-- supabase/baseline.sql
-- The whole database for a NEW Supabase project (pulse-test, pulse-prod), in one run: migrations 0001 to 0011 folded
-- together (2026-10-10, checklist item B4). Run it once in the project's SQL Editor. Safe to run again.
-- The numbered files in migrations/ stay as the history of the first project; new changes are written as new numbered
-- migrations AND folded in here, and `npm run test:db` checks this file defines the same database as 0001 to 0011
-- (scripts/check-baseline.mjs), apart from the changes listed next.
--
-- Changes from 0001 to 0011:
-- - One table of daily brakes (daily_brakes: reads and briefs per account per day) replaces scan_usage and brief_usage.
-- - Not carried over, nothing calls them: consume_scan and consume_brief (replaced by begin_read / begin_brief in 0005)
--   and submit_lead (the app sends details through submit_lead_pack since 0004).
-- Every number here must match shared/plans.ts (test/plans.test.mjs checks it).

-- ═══ Digital cards (My Card) published for their public link ═══════════════════════════════════════════════════════
create table if not exists public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_card_id text not null,
  slug text not null unique,
  name text not null default '',
  title text not null default '',
  company text not null default '',
  phones text[] not null default '{}',
  emails text[] not null default '{}',
  website text not null default '',
  address text not null default '',
  social text[] not null default '{}',
  photo_url text,
  template text not null default 'ledger',
  accent text not null default 'graphite',
  font text not null default 'archivo',
  updated_at timestamptz not null default now(),
  -- when the card was made on the phone: a plan keeps its oldest cards live, in the same order as the app
  created_at timestamptz not null default now(),
  view_count integer not null default 0,
  lead_count integer not null default 0,
  unique (owner_id, local_card_id)
);
alter table public.cards enable row level security;
drop policy if exists "owner reads own cards" on public.cards;
drop policy if exists "owner inserts own cards" on public.cards;
drop policy if exists "owner updates own cards" on public.cards;
drop policy if exists "owner deletes own cards" on public.cards;
create policy "owner reads own cards" on public.cards for select using (auth.uid() = owner_id);
create policy "owner inserts own cards" on public.cards for insert with check (auth.uid() = owner_id);
create policy "owner updates own cards" on public.cards for update using (auth.uid() = owner_id);
create policy "owner deletes own cards" on public.cards for delete using (auth.uid() = owner_id);

create table if not exists public.leads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text,
  event_name text,
  name text not null,
  phone text,
  email text,
  company text,
  created_at timestamptz not null default now(),
  pulled_at timestamptz
);
alter table public.leads enable row level security;
drop policy if exists "owner reads own leads" on public.leads;
drop policy if exists "owner updates own leads" on public.leads;
drop policy if exists "owner deletes own leads" on public.leads;
create policy "owner reads own leads" on public.leads for select using (auth.uid() = owner_id);
create policy "owner updates own leads" on public.leads for update using (auth.uid() = owner_id);
-- a lead is deleted from the server once it is saved on the owner's phone
create policy "owner deletes own leads" on public.leads for delete using (auth.uid() = owner_id);

-- Anyone holding the link may add one to the count, and do nothing else: no read, no reset.
create or replace function public.record_card_view(p_slug text)
returns void
language sql security definer set search_path = public as $$
  update public.cards set view_count = view_count + 1 where slug = p_slug;
$$;
grant execute on function public.record_card_view(text) to anon, authenticated;

-- ═══ Sync ══════════════════════════════════════════════════════════════════════════════════════════════════════════
create sequence if not exists public.sync_seq;

create table if not exists public.sync_items (
  owner_id uuid not null references auth.users(id) on delete cascade,
  kind text not null check (kind in ('card', 'event', 'mycard')),
  item_id text not null check (length(item_id) between 1 and 100),
  data jsonb,                                   -- null once deleted
  deleted boolean not null default false,
  client_updated_at bigint not null,            -- ms since epoch on the device that made the change: last writer wins
  seq bigint not null default 0,                -- set by the trigger below; a device pulls everything after the last seq it saw
  primary key (owner_id, kind, item_id)
);
create index if not exists sync_items_owner_seq on public.sync_items (owner_id, seq);
alter table public.sync_items enable row level security;
drop policy if exists "owner reads own sync items" on public.sync_items;
drop policy if exists "owner inserts own sync items" on public.sync_items;
drop policy if exists "owner updates own sync items" on public.sync_items;
drop policy if exists "owner deletes own sync items" on public.sync_items;
create policy "owner reads own sync items" on public.sync_items for select using (auth.uid() = owner_id);
create policy "owner inserts own sync items" on public.sync_items for insert with check (auth.uid() = owner_id);
create policy "owner updates own sync items" on public.sync_items for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner deletes own sync items" on public.sync_items for delete using (auth.uid() = owner_id);

-- security definer only so the trigger may use the sequence; it touches nothing but the row being written.
create or replace function public.sync_items_next_seq()
returns trigger
language plpgsql security definer set search_path = public as $$
begin
  new.seq := nextval('public.sync_seq');
  return new;
end $$;
drop trigger if exists sync_items_seq on public.sync_items;
create trigger sync_items_seq before insert or update on public.sync_items for each row execute function public.sync_items_next_seq();

-- Upserts a batch for the caller, as the caller (RLS applies). A row is only overwritten by a change that is at least
-- as new, so a phone that was offline for a week cannot clobber newer edits made elsewhere. Returns rows written.
create or replace function public.sync_push(p_items jsonb)
returns integer
language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := auth.uid(); v_item jsonb; v_n integer := 0; v_rows integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) > 200 then raise exception 'send 1 to 200 items'; end if;
  for v_item in select * from jsonb_array_elements(p_items) loop
    insert into public.sync_items as s (owner_id, kind, item_id, data, deleted, client_updated_at)
    values (
      v_uid, v_item->>'kind', v_item->>'id',
      case when coalesce((v_item->>'deleted')::boolean, false) then null else v_item->'data' end,
      coalesce((v_item->>'deleted')::boolean, false), (v_item->>'updatedAt')::bigint
    )
    on conflict (owner_id, kind, item_id) do update
      set data = excluded.data, deleted = excluded.deleted, client_updated_at = excluded.client_updated_at
      where s.client_updated_at <= excluded.client_updated_at;
    get diagnostics v_rows = row_count;
    v_n := v_n + v_rows;
  end loop;
  return v_n;
end $$;
grant execute on function public.sync_push(jsonb) to authenticated;

-- ═══ Consent (DPDP groundwork: what the user agreed to, and when) ══════════════════════════════════════════════════
create table if not exists public.consents (
  id bigint generated always as identity primary key,
  owner_id uuid not null references auth.users(id) on delete cascade default auth.uid(),
  purpose text not null check (purpose in ('sync')),
  policy_version text not null,
  granted_at timestamptz not null default now(),
  withdrawn_at timestamptz
);
alter table public.consents enable row level security;
drop policy if exists "owner reads own consents" on public.consents;
drop policy if exists "owner records own consents" on public.consents;
drop policy if exists "owner withdraws own consents" on public.consents;
create policy "owner reads own consents" on public.consents for select using (auth.uid() = owner_id);
create policy "owner records own consents" on public.consents for insert with check (auth.uid() = owner_id);
create policy "owner withdraws own consents" on public.consents for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);

-- ═══ Visitor packs (shown to a stall visitor after they send their details) ════════════════════════════════════════
create table if not exists public.visitor_packs (
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text not null check (length(event_id) between 1 and 100),
  note text not null default '' check (length(note) <= 300),
  link_url text not null default '' check (link_url = '' or (link_url ~* '^https?://' and length(link_url) <= 500)),
  link_label text not null default '' check (length(link_label) <= 80),
  -- [{ "name": "Catalogue.pdf", "path": "{owner}/{event}/{random}-Catalogue.pdf", "size": 123456, "type": "application/pdf" }]
  files jsonb not null default '[]' check (jsonb_typeof(files) = 'array' and jsonb_array_length(files) <= 3),
  updated_at timestamptz not null default now(),
  primary key (owner_id, event_id)
);
alter table public.visitor_packs enable row level security;

-- ═══ Plans, packs, passes and what each account has left ═══════════════════════════════════════════════════════════
create table if not exists public.plans (
  owner_id uuid primary key references auth.users(id) on delete cascade,
  tier text not null constraint plans_tier_check check (tier in ('starter', 'plus', 'pro', 'unlimited')),
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
  pass_id bigint references public.passes(id) on delete set null,
  -- the app's request id: a read or brief retried on a weak signal is charged once (charge_*_once)
  request_id text check (request_id is null or length(request_id) <= 100)
);
create index if not exists usage_owner_at on public.usage (owner_id, at);
create index if not exists usage_owner_request on public.usage (owner_id, request_id) where request_id is not null;

-- Abuse brakes per account per day (not prices): reads and briefs, counted before the model is called.
create table if not exists public.daily_brakes (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  kind text not null check (kind in ('read', 'brief')),
  n integer not null default 0,
  primary key (owner_id, day, kind)
);

alter table public.plans enable row level security;
alter table public.passes enable row level security;
alter table public.credits enable row level security;
alter table public.usage enable row level security;
alter table public.daily_brakes enable row level security;
drop policy if exists "owner reads own plan" on public.plans;
create policy "owner reads own plan" on public.plans for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own passes" on public.passes;
create policy "owner reads own passes" on public.passes for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own credits" on public.credits;
create policy "owner reads own credits" on public.credits for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own usage" on public.usage;
create policy "owner reads own usage" on public.usage for select using (auth.uid() = owner_id);
drop policy if exists "owner reads own brakes" on public.daily_brakes;
create policy "owner reads own brakes" on public.daily_brakes for select using (auth.uid() = owner_id);
-- No insert/update/delete policy on these: only the functions below change them.

-- The plan in force and its month at `v_now`. Free months are calendar months in India time (1st 00:00 IST to the next
-- 1st). A paid plan's months run from its start, one at a time, so a yearly plan or a renewal refills every month; the
-- last one stops where the plan ends.
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

-- Cards and briefs a month by plan. Unlimited's 3,000 is its fair use (shown as "Unlimited" in the app).
create or replace function public._allow(p_tier text, out v_cards integer, out v_briefs integer)
language plpgsql immutable as $$
begin
  v_cards := case p_tier when 'unlimited' then 3000 when 'pro' then 400 when 'plus' then 250 when 'starter' then 100 else 20 end;
  v_briefs := case p_tier when 'unlimited' then 30 when 'pro' then 20 when 'plus' then 5 when 'starter' then 3 else 0 end;
end $$;

create or replace function public._ensure_credits(v_uid uuid) returns void
language sql security definer set search_path = public as $$
  insert into public.credits (owner_id) values (v_uid) on conflict (owner_id) do nothing;
$$;

create or replace function public._active_pass(v_uid uuid) returns public.passes
language sql stable security definer set search_path = public as $$
  select * from public.passes where owner_id = v_uid and starts_at <= now() and ends_at > now() order by ends_at limit 1;
$$;

-- Lead capture and brochures: an active paid plan or an active Exhibition pass.
create or replace function public._can_collect(v_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return (select tier from public._period(v_uid)) <> 'free' or (public._active_pass(v_uid)).id is not null;
end $$;

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
    'tier', p.tier, 'periodEnd', p.p_end, 'canCollect', p.tier <> 'free' or ps.id is not null,
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

-- One more use of today's brake, if under the limit; null when the limit is reached.
create or replace function public._brake(v_uid uuid, p_kind text, p_limit integer) returns integer
language plpgsql security definer set search_path = public as $$
declare v_n integer;
begin
  insert into public.daily_brakes as b (owner_id, day, kind, n) values (v_uid, current_date, p_kind, 1)
    on conflict (owner_id, day, kind) do update set n = b.n + 1 where b.n < p_limit
    returning b.n into v_n;
  return v_n;
end $$;

-- Before a read: at least 1 card left, then the daily brake (300, Unlimited's fair use 200).
create or replace function public.begin_read()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit integer; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  v_limit := case b->>'tier' when 'unlimited' then 200 else 300 end;
  if (b->'cards'->>'left')::integer < 1 then return query select false, 'no_cards'::text, v_limit, b; return; end if;
  if public._brake(v_uid, 'read', v_limit) is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
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

-- Before a brief: a free account with no trial left needs a plan (every plan has briefs); then the daily brake (10).
create or replace function public.begin_brief()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 10; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  if (b->'briefs'->>'left')::integer < 1 then
    return query select false, (case when b->>'tier' = 'free' then 'plan_needed' else 'no_briefs' end)::text, v_limit, b; return;
  end if;
  if public._brake(v_uid, 'brief', v_limit) is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
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

-- The same charges with the app's request id: an id already charged returns the balance and charges nothing.
create or replace function public.charge_reads_once(n integer, p_request text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_balance jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_request is null or length(p_request) not between 8 and 100 then raise exception 'bad request id'; end if;
  perform public._ensure_credits(v_uid);
  perform 1 from public.credits where owner_id = v_uid for update;   -- the same lock charge_reads takes: retries queue here
  if exists (select 1 from public.usage where owner_id = v_uid and request_id = p_request) then return public._balance(v_uid); end if;
  v_balance := public.charge_reads(n);
  -- every usage row charge_reads just wrote carries this transaction's time: tag them with the id
  update public.usage set request_id = p_request where owner_id = v_uid and request_id is null and at = now();
  return v_balance;
end $$;

create or replace function public.charge_brief_once(p_request text) returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_balance jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  if p_request is null or length(p_request) not between 8 and 100 then raise exception 'bad request id'; end if;
  perform public._ensure_credits(v_uid);
  perform 1 from public.credits where owner_id = v_uid for update;
  if exists (select 1 from public.usage where owner_id = v_uid and request_id = p_request) then return public._balance(v_uid); end if;
  v_balance := public.charge_brief();
  update public.usage set request_id = p_request where owner_id = v_uid and request_id is null and at = now();
  return v_balance;
end $$;

-- Grants: the service role only (scripts/grant.mjs now, the billing webhook later). Any paid plan ends the 3 trial
-- briefs (every plan has its own).
create or replace function public.grant_plan(p_user uuid, p_tier text, p_months integer) returns jsonb
language plpgsql security definer set search_path = public as $$
begin
  if p_tier not in ('starter', 'plus', 'pro', 'unlimited') or p_months < 1 or p_months > 24 then raise exception 'bad grant'; end if;
  insert into public.plans as x (owner_id, tier, period_start, period_end) values (p_user, p_tier, now(), now() + make_interval(months => p_months))
    on conflict (owner_id) do update set
      period_start = case when x.tier = excluded.tier and x.period_end > now() then x.period_start else now() end,
      period_end = case when x.tier = excluded.tier and x.period_end > now() then x.period_end + make_interval(months => p_months) else excluded.period_end end,
      tier = excluded.tier;
  perform public._ensure_credits(p_user);
  update public.credits set trial_briefs = 0 where owner_id = p_user;
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

-- ═══ Digital cards by plan: Free 1, Starter 2, Plus 3, Pro and Unlimited 5; 5 while an Exhibition pass runs ════════
create or replace function public._my_cards(p_tier text) returns integer
language sql immutable as $$
  select case p_tier when 'unlimited' then 5 when 'pro' then 5 when 'plus' then 3 when 'starter' then 2 else 1 end;
$$;

create or replace function public._my_cards_for(v_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(public._my_cards((public._period(v_uid)).tier), case when (public._active_pass(v_uid)).id is not null then 5 else 0 end);
$$;

-- True when the card is among the owner's oldest N, N being what the account keeps today.
create or replace function public._card_in_plan(p_card_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.n <= public._my_cards_for(r.owner_id)
    from (
      select id, owner_id, row_number() over (partition by owner_id order by created_at, local_card_id) as n
      from public.cards where owner_id = (select owner_id from public.cards where id = p_card_id)
    ) r where r.id = p_card_id
  ), false);
$$;

-- Publishing a new card past the limit is refused with 'card_limit'. Updating a card already published is not.
create or replace function public.cards_within_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext('my_cards:' || new.owner_id::text));   -- two phones publishing at once
  v_limit := public._my_cards_for(new.owner_id);
  if (select count(*) from public.cards where owner_id = new.owner_id) >= v_limit then
    raise exception 'card_limit' using hint = format('This account keeps %s digital card(s).', v_limit);
  end if;
  return new;
end $$;
drop trigger if exists cards_within_plan on public.cards;
create trigger cards_within_plan before insert on public.cards for each row execute function public.cards_within_plan();

-- The only public read path: one row for one known slug, never "all cards", and not found when the card is over its
-- owner's limit. A set (zero or one rows), so "not found" is an empty array, never a blank card.
drop function if exists public.get_public_card(text);
create function public.get_public_card(p_slug text)
returns table (id uuid, slug text, name text, title text, company text, phones text[], emails text[], website text, address text, social text[], photo_url text, template text, accent text, font text)
language sql security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.title, c.company, c.phones, c.emails, c.website, c.address, c.social, c.photo_url, c.template, c.accent, c.font
  from public.cards c where c.slug = p_slug and public._card_in_plan(c.id) limit 1;
$$;
grant execute on function public.get_public_card(text) to anon;

-- The only public write path: a visitor's details, answered with the event's pack. owner_id comes from the card, never
-- from the caller; the card must be within its owner's plan and the owner able to collect (a plan or a pass).
create or replace function public.submit_lead_pack(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid; v_pack jsonb;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null or not public._card_in_plan(p_card_id) then raise exception 'unknown card'; end if;
  if not public._can_collect(v_owner) then raise exception 'not_collecting'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  select jsonb_build_object('note', note, 'link_url', link_url, 'link_label', link_label, 'files', files) into v_pack
  from public.visitor_packs where owner_id = v_owner and event_id = p_event_id;
  return jsonb_build_object('id', v_id, 'pack', v_pack);
end $$;
grant execute on function public.submit_lead_pack(uuid, text, text, text, text, text, text) to anon, authenticated;

-- Visitor packs: written only with a plan or pass; reading and deleting stay open to the owner.
drop policy if exists "owner reads own packs" on public.visitor_packs;
drop policy if exists "owner writes own packs" on public.visitor_packs;
drop policy if exists "owner changes own packs" on public.visitor_packs;
drop policy if exists "owner deletes own packs" on public.visitor_packs;
create policy "owner reads own packs" on public.visitor_packs for select using (auth.uid() = owner_id);
create policy "owner writes own packs" on public.visitor_packs for insert with check (auth.uid() = owner_id and public._can_collect(auth.uid()));
create policy "owner changes own packs" on public.visitor_packs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id and public._can_collect(auth.uid()));
create policy "owner deletes own packs" on public.visitor_packs for delete using (auth.uid() = owner_id);

-- ═══ Deleting on request ═══════════════════════════════════════════════════════════════════════════════════════════
-- Everything the caller has on the server except the account itself. Storage files are removed by the app first,
-- through the Storage API (Supabase does not allow deleting them with SQL).
create or replace function public.delete_my_cloud_data()
returns void
language plpgsql security invoker set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  delete from public.sync_items where owner_id = v_uid;
  delete from public.leads where owner_id = v_uid;
  delete from public.cards where owner_id = v_uid;
  delete from public.visitor_packs where owner_id = v_uid;
end $$;
grant execute on function public.delete_my_cloud_data() to authenticated;

-- The account itself. Every table cascades from auth.users, so this removes whatever is left.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = v_uid;
end $$;

-- ═══ Who may call what ═════════════════════════════════════════════════════════════════════════════════════════════
revoke execute on function public._period(uuid, timestamptz), public._allow(text), public._ensure_credits(uuid), public._active_pass(uuid),
  public._balance(uuid), public._brake(uuid, text, integer), public._card_in_plan(uuid), public._my_cards_for(uuid) from public, anon, authenticated;
revoke execute on function public._can_collect(uuid) from public, anon;
grant execute on function public._can_collect(uuid) to authenticated;   -- policies run as the caller, who may only ask about themselves
revoke execute on function public.my_balance(), public.begin_read(), public.charge_reads(integer), public.begin_brief(), public.charge_brief(),
  public.charge_reads_once(integer, text), public.charge_brief_once(text), public.delete_my_account() from public, anon;
grant execute on function public.my_balance(), public.begin_read(), public.charge_reads(integer), public.begin_brief(), public.charge_brief(),
  public.charge_reads_once(integer, text), public.charge_brief_once(text), public.delete_my_account() to authenticated;
revoke execute on function public.grant_plan(uuid, text, integer), public.grant_pack(uuid, text, integer), public.grant_pass(uuid) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, integer), public.grant_pack(uuid, text, integer), public.grant_pass(uuid) to service_role;

-- ═══ Storage ═══════════════════════════════════════════════════════════════════════════════════════════════════════
-- card-photos: the public card's photo, public to read, written and removed only in the owner's own folder.
insert into storage.buckets (id, name, public) values ('card-photos', 'card-photos', true) on conflict (id) do nothing;
drop policy if exists "owner writes own photos" on storage.objects;
drop policy if exists "owner updates own photos" on storage.objects;
drop policy if exists "owner deletes own photos" on storage.objects;
drop policy if exists "owner lists own photos" on storage.objects;
create policy "owner writes own photos" on storage.objects for insert
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own photos" on storage.objects for update
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes own photos" on storage.objects for delete
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner lists own photos" on storage.objects for select
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- sync-photos: a synced contact's photos, private, the owner's own folder only.
insert into storage.buckets (id, name, public) values ('sync-photos', 'sync-photos', false) on conflict (id) do nothing;
drop policy if exists "owner reads own sync photos" on storage.objects;
drop policy if exists "owner writes own sync photos" on storage.objects;
drop policy if exists "owner updates own sync photos" on storage.objects;
drop policy if exists "owner deletes own sync photos" on storage.objects;
create policy "owner reads own sync photos" on storage.objects for select
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner writes own sync photos" on storage.objects for insert
  with check (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own sync photos" on storage.objects for update
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner deletes own sync photos" on storage.objects for delete
  using (bucket_id = 'sync-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- visitor-packs: brochures, public to read under unguessable names, added only with a plan or pass.
insert into storage.buckets (id, name, public) values ('visitor-packs', 'visitor-packs', true) on conflict (id) do nothing;
drop policy if exists "owner adds pack files" on storage.objects;
drop policy if exists "owner removes pack files" on storage.objects;
create policy "owner adds pack files" on storage.objects for insert
  with check (bucket_id = 'visitor-packs' and (storage.foldername(name))[1] = auth.uid()::text and public._can_collect(auth.uid()));
create policy "owner removes pack files" on storage.objects for delete
  using (bucket_id = 'visitor-packs' and (storage.foldername(name))[1] = auth.uid()::text);
