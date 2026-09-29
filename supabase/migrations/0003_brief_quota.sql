-- supabase/migrations/0003_brief_quota.sql
-- Pulse Brief: a daily limit of fresh web-searched briefs per account, counted the same way as scans (consume_scan, 0002).
-- Re-runnable. Run it in the Supabase SQL editor after 0002.
create table if not exists public.brief_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  briefs integer not null default 0,
  primary key (owner_id, day)
);
alter table public.brief_usage enable row level security;
drop policy if exists "owner reads own brief usage" on public.brief_usage;
create policy "owner reads own brief usage" on public.brief_usage for select using (auth.uid() = owner_id);
-- No insert/update policy: only consume_brief (below) changes the count.

-- Called by the Worker with the user's own token. Each fresh brief is a paid Google search, so the limit is small.
create or replace function public.consume_brief()
returns table (allowed boolean, used integer, day_limit integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 10; v_used integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into public.brief_usage as u (owner_id, day, briefs) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set briefs = u.briefs + 1 where u.briefs < v_limit
    returning u.briefs into v_used;
  if v_used is null then
    select briefs into v_used from public.brief_usage where owner_id = v_uid and day = current_date;
    return query select false, v_used, v_limit;
  else
    return query select true, v_used, v_limit;
  end if;
end $$;
revoke execute on function public.consume_brief() from public, anon;
grant execute on function public.consume_brief() to authenticated;
