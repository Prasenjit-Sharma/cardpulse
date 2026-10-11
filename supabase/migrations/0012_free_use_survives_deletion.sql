-- supabase/migrations/0012_free_use_survives_deletion.sql
-- Run once, by hand, in the Supabase project's SQL Editor (pulse-test and pulse-prod), after 0011 or after baseline.sql
-- as it stood on 2026-10-11. Safe to run again. Also folded into baseline.sql.
--
-- Found in testing 2026-10-11: deleting the account and signing in again with the same Google account gave a fresh 20
-- free cards and 3 trial briefs, because the usage went with the account. Now, when an account is deleted, a one-way
-- fingerprint of its sign-in (a hash of the provider's account id, never the name or email) is kept with how much of this
-- month's free allowance and of the trial briefs it had used. If the same sign-in comes back, it carries on from there.
-- Kept 13 months, then forgotten (the privacy policy says so). Nothing else about the person is kept.

create table if not exists public.quota_memory (
  identity_hash text primary key,                       -- sha256 of provider:account id; not reversible to a person by us
  free_month_start timestamptz,                         -- the free month the count below belongs to (null on a paid plan)
  free_cards_used integer not null default 0 check (free_cards_used >= 0),
  trial_briefs_left integer not null default 3 check (trial_briefs_left >= 0),
  remembered_at timestamptz not null default now()
);
alter table public.quota_memory enable row level security;
-- No policies: nobody reads or writes it except the two functions below.

create or replace function public._identity_hash(p_provider text, p_provider_id text) returns text
language sql immutable as $$
  select encode(sha256(convert_to(lower(p_provider) || ':' || p_provider_id, 'UTF8')), 'hex');
$$;

-- Deleting the account remembers its free use first, then deletes it (every table cascades from auth.users).
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); p record; v_used integer := 0; v_trial integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  select * into p from public._period(v_uid);
  if p.tier = 'free' then
    select coalesce(sum(qty), 0) into v_used from public.usage
      where owner_id = v_uid and kind = 'card' and source = 'month' and at >= p.p_start and at < p.p_end;
  end if;
  select trial_briefs into v_trial from public.credits where owner_id = v_uid;
  insert into public.quota_memory as q (identity_hash, free_month_start, free_cards_used, trial_briefs_left)
    select public._identity_hash(i.provider, i.provider_id), case when p.tier = 'free' then p.p_start end, v_used, coalesce(v_trial, 3)
    from auth.identities i where i.user_id = v_uid
  on conflict (identity_hash) do update set
    free_month_start = excluded.free_month_start,
    free_cards_used = case when q.free_month_start = excluded.free_month_start then greatest(q.free_cards_used, excluded.free_cards_used) else excluded.free_cards_used end,
    trial_briefs_left = least(q.trial_briefs_left, excluded.trial_briefs_left),
    remembered_at = now();
  delete from public.quota_memory where remembered_at < now() - interval '13 months';
  delete from auth.users where id = v_uid;
end $$;

-- A sign-in that was deleted before carries on: trial briefs never come back, and this month's free cards stay used.
create or replace function public.recall_free_use() returns trigger
language plpgsql security definer set search_path = public as $$
declare m public.quota_memory; p record;
begin
  select * into m from public.quota_memory where identity_hash = public._identity_hash(new.provider, new.provider_id);
  if m.identity_hash is null then return new; end if;
  perform public._ensure_credits(new.user_id);
  update public.credits set trial_briefs = least(trial_briefs, m.trial_briefs_left) where owner_id = new.user_id;
  select * into p from public._period(new.user_id);
  if m.free_cards_used > 0 and p.tier = 'free' and p.p_start = m.free_month_start
     and not exists (select 1 from public.usage where owner_id = new.user_id and request_id = 'recalled-after-deletion') then
    insert into public.usage (owner_id, kind, source, qty, request_id) values (new.user_id, 'card', 'month', m.free_cards_used, 'recalled-after-deletion');
  end if;
  return new;
end $$;
drop trigger if exists recall_free_use on auth.identities;
create trigger recall_free_use after insert on auth.identities for each row execute function public.recall_free_use();

revoke execute on function public._identity_hash(text, text), public.recall_free_use() from public, anon, authenticated;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
