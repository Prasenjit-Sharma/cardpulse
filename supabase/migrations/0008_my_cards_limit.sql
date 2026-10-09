-- supabase/migrations/0008_my_cards_limit.sql
-- Run once, by hand, in the Supabase project's SQL Editor, after 0007. Safe to run again.
--
-- How many digital cards (My Card) a plan keeps: Free 1, Starter 2, Plus 3, Pro and Unlimited 5 (MY_CARDS in
-- shared/plans.ts; test/plans.test.mjs checks the numbers match). An Exhibition pass does not change it.
-- The QR drawn on a card is the contact itself and never reaches the server, so the app locks cards over the limit;
-- here the limit holds for everything that does: a card cannot be published past it, and after a move to a smaller
-- plan the newest cards over it stop opening and stop taking leads. The oldest cards are the ones kept, in the same
-- order as the app (created_at, then local_card_id), so the phone and the server agree on which cards are locked.

alter table public.cards add column if not exists created_at timestamptz not null default now();

create or replace function public._my_cards(p_tier text) returns integer
language sql immutable as $$
  select case p_tier when 'unlimited' then 5 when 'pro' then 5 when 'plus' then 3 when 'starter' then 2 else 1 end;
$$;

-- True when the card is among the owner's oldest N, N being what their plan keeps today.
create or replace function public._card_in_plan(p_card_id uuid) returns boolean
language sql stable security definer set search_path = public as $$
  select coalesce((
    select r.n <= public._my_cards((public._period(r.owner_id)).tier)
    from (
      select id, owner_id, row_number() over (partition by owner_id order by created_at, local_card_id) as n
      from public.cards where owner_id = (select owner_id from public.cards where id = p_card_id)
    ) r where r.id = p_card_id
  ), false);
$$;
revoke execute on function public._card_in_plan(uuid) from public, anon, authenticated;

-- Publishing a new card past the plan's limit is refused with 'card_limit'. Updating a card already published is not.
create or replace function public.cards_within_plan() returns trigger
language plpgsql security definer set search_path = public as $$
declare v_limit integer;
begin
  perform pg_advisory_xact_lock(hashtext('my_cards:' || new.owner_id::text));   -- two phones publishing at once
  v_limit := public._my_cards((public._period(new.owner_id)).tier);
  if (select count(*) from public.cards where owner_id = new.owner_id) >= v_limit then
    raise exception 'card_limit' using hint = format('This plan keeps %s digital card(s).', v_limit);
  end if;
  return new;
end $$;
drop trigger if exists cards_within_plan on public.cards;
create trigger cards_within_plan before insert on public.cards for each row execute function public.cards_within_plan();

-- The public card page: a card over its owner's limit reads as not found.
create or replace function public.get_public_card(p_slug text)
returns table (id uuid, slug text, name text, title text, company text, phones text[], emails text[], website text, address text, social text[], photo_url text, template text, accent text, font text)
language sql security definer set search_path = public as $$
  select c.id, c.slug, c.name, c.title, c.company, c.phones, c.emails, c.website, c.address, c.social, c.photo_url, c.template, c.accent, c.font
  from public.cards c where c.slug = p_slug and public._card_in_plan(c.id) limit 1;
$$;
grant execute on function public.get_public_card(text) to anon;

-- Leads: as 0007, and the card must be within its owner's plan.
create or replace function public.submit_lead(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null or not public._card_in_plan(p_card_id) then raise exception 'unknown card'; end if;
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
