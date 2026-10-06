-- supabase/migrations/0005_plans_balances.sql
-- Plans, packs, the Exhibition pass and what each account has left. Re-runnable. Run it in the Supabase SQL editor
-- after 0004. Every number here must match shared/plans.ts (test/plans.test.mjs checks it).
-- Reads and briefs are checked before the model call (begin_*) and charged after a good answer (charge_*), with the
-- user's own token. Grants are for the service role only: the test script now, purchase checks later.

create table if not exists public.plans (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null check (tier in ('plus', 'pro')),
  period_start timestamptz not null,
  period_end timestamptz not null
);
create table if not exists public.passes (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  starts_at timestamptz not null default now(),
  ends_at timestamptz not null,
  allowance integer not null check (allowance > 0)
);
create table if not exists public.credits (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  pack_cards integer not null default 0 check (pack_cards >= 0),
  extra_briefs integer not null default 0 check (extra_briefs >= 0),
  trial_briefs integer not null default 3 check (trial_briefs >= 0)
);
create table if not exists public.usage (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade,
  at timestamptz not null default now(),
  kind text not null check (kind in ('card', 'brief')),
  source text not null check (source in ('pass', 'month', 'pack', 'extra', 'trial')),
  qty integer not null check (qty > 0),
  pass_id bigint references public.passes(id) on delete set null
);
create index if not exists usage_owner_at on public.usage (owner_id, at);

alter table public.plans enable row level security;
alter table public.passes enable row level security;
alter table public.credits enable row level security;
alter table public.usage enable row level security;
drop policy if exists "owner reads own plan" on public.plans;
create policy "owner reads own plan" on public.plans for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own passes" on public.passes;
create policy "owner reads own passes" on public.passes for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own credits" on public.credits;
create policy "owner reads own credits" on public.credits for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own usage" on public.usage;
create policy "owner reads own usage" on public.usage for select using (auth.uid() = owner_id);
-- No insert/update/delete policy: only the functions below change these rows.

-- The plan in force and its month at `v_now`. Free months are calendar months in India time (1st 00:00 IST to the next
-- 1st). A paid plan's months run from its start, one at a time, so a yearly plan or a renewal refills every month; the
-- last one stops where the plan ends.
drop function if exists public._period(uuid);
create or replace function public._period(v_uid uuid, v_now timestamptz default now(), out tier text, out p_start timestamptz, out p_end timestamptz)
language plpgsql stable security definer set search_path = public as $$
declare v_from timestamptz; v_to timestamptz; v_local timestamp := v_now at time zone 'Asia/Kolkata'; v_k integer;
begin
  select p.tier, p.period_start, p.period_end into tier, v_from, v_to from public.plans p where p.owner_id = v_uid and p.period_start <= v_now and p.period_end > v_now;
  if tier is null then
    tier := 'free';
    p_start := date_trunc('month', v_local) at time zone 'Asia/Kolkata';
    p_end := (date_trunc('month', v_local) + interval '1 month') at time zone 'Asia/Kolkata';
    return;
  end if;
  v_k := (extract(year from age(v_now, v_from)) * 12 + extract(month from age(v_now, v_from)))::integer;
  p_start := v_from + make_interval(months => v_k);
  if p_start > v_now then v_k := v_k - 1; p_start := v_from + make_interval(months => v_k); end if;
  p_end := least(v_from + make_interval(months => v_k + 1), v_to);
end $$;

create or replace function public._allow(p_tier text, out v_cards integer, out v_briefs integer)
language plpgsql immutable as $$
begin
  v_cards := case p_tier when 'pro' then 400 when 'plus' then 150 else 20 end;
  v_briefs := case p_tier when 'pro' then 20 else 0 end;
end $$;

create or replace function public._ensure_credits(v_uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.credits (owner_id) values (v_uid) on conflict (owner_id) do nothing;
$$;

create or replace function public._active_pass(v_uid uuid) returns public.passes
language sql stable security definer set search_path = public as $$
  select * from public.passes where owner_id = v_uid and starts_at <= now() and ends_at > now() order by ends_at limit 1;
$$;

create or replace function public._balance(v_uid uuid) returns jsonb
language plpgsql stable security definer set search_path = public as $$
declare p record; a record; ps public.passes; c public.credits;
  v_mc integer; v_mb integer; v_pu integer := 0; v_pass jsonb := null; v_pass_left integer := 0;
begin
  select * into p from public._period(v_uid);
  select * into a from public._allow(p.tier);
  select coalesce(sum(qty) filter (where kind = 'card'), 0), coalesce(sum(qty) filter (where kind = 'brief'), 0) into v_mc, v_mb
    from public.usage where owner_id = v_uid and source = 'month' and at >= p.p_start and at < p.p_end;
  ps := public._active_pass(v_uid);
  if ps.id is not null then
    select coalesce(sum(qty), 0) into v_pu from public.usage where pass_id = ps.id;
    v_pass_left := greatest(ps.allowance - v_pu, 0);
    v_pass := jsonb_build_object('used', v_pu, 'allowance', ps.allowance, 'endsAt', ps.ends_at);
  end if;
  select * into c from public.credits where owner_id = v_uid;
  return jsonb_build_object(
    'tier', p.tier, 'periodEnd', p.p_end,
    'cards', jsonb_build_object('month', jsonb_build_object('used', v_mc, 'allowance', a.v_cards), 'pass', v_pass,
      'pack', coalesce(c.pack_cards, 0), 'left', greatest(a.v_cards - v_mc, 0) + v_pass_left + coalesce(c.pack_cards, 0)),
    'briefs', jsonb_build_object('month', jsonb_build_object('used', v_mb, 'allowance', a.v_briefs),
      'extra', coalesce(c.extra_briefs, 0), 'trial', coalesce(c.trial_briefs, 3),
      'left', greatest(a.v_briefs - v_mb, 0) + coalesce(c.extra_briefs, 0) + coalesce(c.trial_briefs, 3)));
end $$;

create or replace function public.my_balance() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  return public._balance(v_uid);
end $$;

-- Before a read: at least 1 card left, then the daily brake (scan_usage, 0002). Replaces consume_scan for the Worker.
create or replace function public.begin_read()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 300; v_used integer; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  if (b->'cards'->>'left')::integer < 1 then return query select false, 'no_cards'::text, v_limit, b; return; end if;
  insert into public.scan_usage as u (owner_id, day, reads) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set reads = u.reads + 1 where u.reads < v_limit
    returning u.reads into v_used;
  if v_used is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
  return query select true, null::text, v_limit, b;
end $$;

-- After a good read: n cards, pass first, then the month, then packs. What cannot be covered is not charged.
create or replace function public.charge_reads(n integer) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_left integer := n; v_take integer; v_used integer; p record; a record; ps public.passes; v_pack integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if n is null or n < 1 or n > 200 then raise exception 'n must be 1 to 200'; end if;
  perform public._ensure_credits(v_uid);
  perform 1 from public.credits where owner_id = v_uid for update;   -- one charge at a time per account
  ps := public._active_pass(v_uid);
  if ps.id is not null then
    select coalesce(sum(qty), 0) into v_used from public.usage where pass_id = ps.id;
    v_take := least(v_left, greatest(ps.allowance - v_used, 0));
    if v_take > 0 then insert into public.usage (owner_id, kind, source, qty, pass_id) values (v_uid, 'card', 'pass', v_take, ps.id); v_left := v_left - v_take; end if;
  end if;
  if v_left > 0 then
    select * into p from public._period(v_uid);
    select * into a from public._allow(p.tier);
    select coalesce(sum(qty), 0) into v_used from public.usage where owner_id = v_uid and kind = 'card' and source = 'month' and at >= p.p_start and at < p.p_end;
    v_take := least(v_left, greatest(a.v_cards - v_used, 0));
    if v_take > 0 then insert into public.usage (owner_id, kind, source, qty) values (v_uid, 'card', 'month', v_take); v_left := v_left - v_take; end if;
  end if;
  if v_left > 0 then
    select pack_cards into v_pack from public.credits where owner_id = v_uid;
    v_take := least(v_left, v_pack);
    if v_take > 0 then
      update public.credits set pack_cards = pack_cards - v_take where owner_id = v_uid;
      insert into public.usage (owner_id, kind, source, qty) values (v_uid, 'card', 'pack', v_take);
    end if;
  end if;
  return public._balance(v_uid);
end $$;

create or replace function public.begin_brief()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 10; v_used integer; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  if (b->'briefs'->>'left')::integer < 1 then
    return query select false, (case when b->>'tier' = 'pro' then 'no_briefs' else 'pro_only' end)::text, v_limit, b; return;
  end if;
  insert into public.brief_usage as u (owner_id, day, briefs) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set briefs = u.briefs + 1 where u.briefs < v_limit
    returning u.briefs into v_used;
  if v_used is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
  return query select true, null::text, v_limit, b;
end $$;

create or replace function public.charge_brief() returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p record; a record; v_used integer; c public.credits;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  select * into c from public.credits where owner_id = v_uid for update;
  select * into p from public._period(v_uid);
  select * into a from public._allow(p.tier);
  select coalesce(sum(qty), 0) into v_used from public.usage where owner_id = v_uid and kind = 'brief' and source = 'month' and at >= p.p_start and at < p.p_end;
  if v_used < a.v_briefs then
    insert into public.usage (owner_id, kind, source, qty) values (v_uid, 'brief', 'month', 1);
  elsif c.extra_briefs > 0 then
    update public.credits set extra_briefs = extra_briefs - 1 where owner_id = v_uid;
    insert into public.usage (owner_id, kind, source, qty) values (v_uid, 'brief', 'extra', 1);
  elsif c.trial_briefs > 0 then
    update public.credits set trial_briefs = trial_briefs - 1 where owner_id = v_uid;
    insert into public.usage (owner_id, kind, source, qty) values (v_uid, 'brief', 'trial', 1);
  end if;
  return public._balance(v_uid);
end $$;

-- Grants: the service role only (scripts/grant.mjs now, purchase checks later).
create or replace function public.grant_plan(p_user uuid, p_tier text, p_months integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_tier not in ('plus', 'pro') or p_months < 1 or p_months > 24 then raise exception 'bad grant'; end if;
  insert into public.plans as x (owner_id, tier, period_start, period_end) values (p_user, p_tier, now(), now() + make_interval(months => p_months))
    on conflict (owner_id) do update set
      period_start = case when x.tier = excluded.tier and x.period_end > now() then x.period_start else now() end,
      period_end = case when x.tier = excluded.tier and x.period_end > now() then x.period_end + make_interval(months => p_months) else excluded.period_end end,
      tier = excluded.tier;
  perform public._ensure_credits(p_user);
  return public._balance(p_user);
end $$;

create or replace function public.grant_pack(p_user uuid, p_kind text, p_qty integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_kind not in ('cards', 'briefs') or p_qty < 1 or p_qty > 10000 then raise exception 'bad grant'; end if;
  perform public._ensure_credits(p_user);
  if p_kind = 'cards' then update public.credits set pack_cards = pack_cards + p_qty where owner_id = p_user;
  else update public.credits set extra_briefs = extra_briefs + p_qty where owner_id = p_user; end if;
  return public._balance(p_user);
end $$;

create or replace function public.grant_pass(p_user uuid) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  insert into public.passes (owner_id, starts_at, ends_at, allowance) values (p_user, now(), now() + interval '7 days', 1000);
  perform public._ensure_credits(p_user);
  return public._balance(p_user);
end $$;

revoke execute on function public._period(uuid, timestamptz), public._allow(text), public._ensure_credits(uuid), public._active_pass(uuid), public._balance(uuid) from public, anon, authenticated;
revoke execute on function public.my_balance(), public.begin_read(), public.charge_reads(integer), public.begin_brief(), public.charge_brief() from public, anon;
grant execute on function public.my_balance(), public.begin_read(), public.charge_reads(integer), public.begin_brief(), public.charge_brief() to authenticated;
revoke execute on function public.grant_plan(uuid, text, integer), public.grant_pack(uuid, text, integer), public.grant_pass(uuid) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, integer), public.grant_pack(uuid, text, integer), public.grant_pass(uuid) to service_role;
