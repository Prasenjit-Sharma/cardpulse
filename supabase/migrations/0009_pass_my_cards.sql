-- supabase/migrations/0009_pass_my_cards.sql
-- Run once, by hand, in the Supabase project's SQL Editor, after 0008. Safe to run again.
--
-- An Exhibition pass keeps 5 digital cards while it runs, whatever the plan (PASS_MY_CARDS in shared/plans.ts).
-- When it ends the plan's own number returns, and the newest cards over it lock again, as after a move to a smaller plan.

-- How many cards this account keeps now: the plan's number, or the pass's while one runs.
create or replace function public._my_cards_for(v_uid uuid) returns integer
language sql stable security definer set search_path = public as $$
  select greatest(public._my_cards((public._period(v_uid)).tier), case when (public._active_pass(v_uid)).id is not null then 5 else 0 end);
$$;
revoke execute on function public._my_cards_for(uuid) from public, anon, authenticated;

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
revoke execute on function public._card_in_plan(uuid) from public, anon, authenticated;

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
