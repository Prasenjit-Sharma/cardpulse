-- supabase/migrations/0010_charge_once.sql
-- Run once, by hand, in the Supabase project's SQL Editor, after 0009. Safe to run again.
--
-- On a weak signal the Worker can finish and charge a read or a brief while its answer is lost on the way back; the app
-- then retries. The app now sends a request id with each read (from the card ids, so it is the same on every retry of
-- that photo) and each brief (new per tap, the same across its retries). Charging with an id the account was already
-- charged for returns the balance and charges nothing. The Worker falls back to charge_reads / charge_brief if this
-- migration has not run.

alter table public.usage add column if not exists request_id text check (request_id is null or length(request_id) <= 100);
create index if not exists usage_owner_request on public.usage (owner_id, request_id) where request_id is not null;

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

revoke execute on function public.charge_reads_once(integer, text), public.charge_brief_once(text) from public, anon;
grant execute on function public.charge_reads_once(integer, text), public.charge_brief_once(text) to authenticated;
