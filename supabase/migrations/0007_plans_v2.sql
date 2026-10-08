-- supabase/migrations/0007_plans_v2.sql
-- Plans v2: Starter, Plus, Pro and Unlimited (fair use 200 reads a day), Pulse Brief on every paid plan, and lead
-- capture with brochures as a paid feature (any paid plan or the Exhibition pass), enforced where leads and visitor
-- packs arrive. Publishing a card is not gated: card links stay free. Re-runnable. Run it in the Supabase SQL editor
-- after 0006. Every number here must match shared/plans.ts (test/plans.test.mjs checks it).

alter table public.plans drop constraint if exists plans_tier_check;
alter table public.plans add constraint plans_tier_check check (tier in ('starter', 'plus', 'pro', 'unlimited'));

create or replace function public._allow(p_tier text, out v_cards integer, out v_briefs integer)
language plpgsql immutable as $$
begin
  v_cards := case p_tier when 'unlimited' then 1000000 when 'pro' then 400 when 'plus' then 250 when 'starter' then 100 else 20 end;
  v_briefs := case p_tier when 'unlimited' then 30 when 'pro' then 20 when 'plus' then 5 when 'starter' then 3 else 0 end;
end $$;

-- Lead capture and brochures: an active paid plan or an active Exhibition pass.
create or replace function public._can_collect(v_uid uuid) returns boolean
language plpgsql stable security definer set search_path = public as $$
begin
  return (select tier from public._period(v_uid)) <> 'free' or (public._active_pass(v_uid)).id is not null;
end $$;
revoke execute on function public._can_collect(uuid) from public, anon;
-- policies run as the caller, who may only ask about themselves (auth.uid())
grant execute on function public._can_collect(uuid) to authenticated;

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

-- Before a read: at least 1 card left, then the daily brake; Unlimited's fair use is a lower brake.
create or replace function public.begin_read()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit integer; v_used integer; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  v_limit := case b->>'tier' when 'unlimited' then 200 else 300 end;
  if (b->'cards'->>'left')::integer < 1 then return query select false, 'no_cards'::text, v_limit, b; return; end if;
  insert into public.scan_usage as u (owner_id, day, reads) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set reads = u.reads + 1 where u.reads < v_limit
    returning u.reads into v_used;
  if v_used is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
  return query select true, null::text, v_limit, b;
end $$;

-- Before a brief: a free account with no trial left needs a plan (any plan has briefs).
create or replace function public.begin_brief()
returns table (allowed boolean, reason text, day_limit integer, balance jsonb)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 10; v_used integer; b jsonb;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  perform public._ensure_credits(v_uid);
  b := public._balance(v_uid);
  if (b->'briefs'->>'left')::integer < 1 then
    return query select false, (case when b->>'tier' = 'free' then 'plan_needed' else 'no_briefs' end)::text, v_limit, b; return;
  end if;
  insert into public.brief_usage as u (owner_id, day, briefs) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set briefs = u.briefs + 1 where u.briefs < v_limit
    returning u.briefs into v_used;
  if v_used is null then return query select false, 'daily_limit'::text, v_limit, b; return; end if;
  return query select true, null::text, v_limit, b;
end $$;

-- Grants: the service role only. Any paid plan ends the 3 trial briefs (every plan has its own).
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
revoke execute on function public.grant_plan(uuid, text, integer) from public, anon, authenticated;
grant execute on function public.grant_plan(uuid, text, integer) to service_role;

-- Leads arrive only at a stall that can collect. Nothing is stored otherwise.
create or replace function public.submit_lead(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null then raise exception 'unknown card'; end if;
  if not public._can_collect(v_owner) then raise exception 'not_collecting'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  update public.cards set lead_count = lead_count + 1 where id = p_card_id;
  return v_id;
end $$;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text) to anon, authenticated;

create or replace function public.submit_lead_pack(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid; v_pack jsonb;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null then raise exception 'unknown card'; end if;
  if not public._can_collect(v_owner) then raise exception 'not_collecting'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  select jsonb_build_object('note', note, 'link_url', link_url, 'link_label', link_label, 'files', files) into v_pack
  from public.visitor_packs where owner_id = v_owner and event_id = p_event_id;
  return jsonb_build_object('id', v_id, 'pack', v_pack);
end $$;
grant execute on function public.submit_lead_pack(uuid, text, text, text, text, text, text) to anon, authenticated;

-- Visitor packs and their files: written only with a plan or pass. Reading and deleting stay open to the owner.
drop policy if exists "owner writes own packs" on public.visitor_packs;
drop policy if exists "owner changes own packs" on public.visitor_packs;
create policy "owner writes own packs" on public.visitor_packs for insert with check (auth.uid() = owner_id and public._can_collect(auth.uid()));
create policy "owner changes own packs" on public.visitor_packs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id and public._can_collect(auth.uid()));
drop policy if exists "owner adds pack files" on storage.objects;
create policy "owner adds pack files" on storage.objects for insert
  with check (bucket_id = 'visitor-packs' and (storage.foldername(name))[1] = auth.uid()::text and public._can_collect(auth.uid()));

-- Accounts already on a paid plan when this runs: their plan has briefs, so the trial ends.
update public.credits c set trial_briefs = 0
  from public.plans p where p.owner_id = c.owner_id and p.period_end > now() and c.trial_briefs > 0;
