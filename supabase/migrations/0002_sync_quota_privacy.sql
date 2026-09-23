-- supabase/migrations/0002_sync_quota_privacy.sql
-- Run once, by hand, in the Supabase project's SQL Editor, after 0001. Safe to re-run.

-- ── View and lead counts on a published card ─────────────────────────────────────────────────────────────────────
alter table public.cards add column if not exists view_count integer not null default 0;
alter table public.cards add column if not exists lead_count integer not null default 0;

-- Anyone holding the link may add one to the count, and do nothing else: no read, no reset.
create or replace function public.record_card_view(p_slug text)
returns void
language sql security definer set search_path = public as $$
  update public.cards set view_count = view_count + 1 where slug = p_slug;
$$;
grant execute on function public.record_card_view(text) to anon, authenticated;

-- Same as 0001's, plus the lead count.
create or replace function public.submit_lead(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null then raise exception 'unknown card'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  update public.cards set lead_count = lead_count + 1 where id = p_card_id;
  return v_id;
end $$;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text) to anon, authenticated;

-- A lead is deleted from the server once it is saved on the owner's phone.
drop policy if exists "owner deletes own leads" on public.leads;
create policy "owner deletes own leads" on public.leads for delete using (auth.uid() = owner_id);

-- ── Sync ─────────────────────────────────────────────────────────────────────────────────────────────────────────
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

-- Upserts a batch for the caller. Runs as the caller (RLS applies). A row is only overwritten by a change that is at
-- least as new, so a phone that was offline for a week cannot clobber newer edits made elsewhere. Returns how many
-- rows were written.
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

-- Private: a synced contact's photos are never public.
insert into storage.buckets (id, name, public) values ('sync-photos', 'sync-photos', false)
  on conflict (id) do nothing;
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

-- The public card photo can be taken down by its owner (unpublishing, deleting cloud data).
drop policy if exists "owner deletes own photos" on storage.objects;
create policy "owner deletes own photos" on storage.objects for delete
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
-- Listing a folder (needed to delete everything in it) goes through select.
drop policy if exists "owner lists own photos" on storage.objects;
create policy "owner lists own photos" on storage.objects for select
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);

-- ── Consent (DPDP groundwork: a record of what the user agreed to, and when) ─────────────────────────────────────
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

-- ── Per-account scan quota ───────────────────────────────────────────────────────────────────────────────────────
create table if not exists public.scan_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  reads integer not null default 0,
  primary key (owner_id, day)
);
alter table public.scan_usage enable row level security;
drop policy if exists "owner reads own usage" on public.scan_usage;
create policy "owner reads own usage" on public.scan_usage for select using (auth.uid() = owner_id);
-- No insert/update policy: only consume_scan (below) changes the count.

-- Called by the reading Worker with the user's own token. Counts one read if today's count (UTC) is under the limit.
-- An abuse brake, not a price: 300 is roughly a heavy exhibition day. Change the constant here to adjust it.
create or replace function public.consume_scan()
returns table (allowed boolean, used integer, day_limit integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 300; v_used integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into public.scan_usage as u (owner_id, day, reads) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set reads = u.reads + 1 where u.reads < v_limit
    returning u.reads into v_used;
  if v_used is null then
    select reads into v_used from public.scan_usage where owner_id = v_uid and day = current_date;
    return query select false, v_used, v_limit;
  else
    return query select true, v_used, v_limit;
  end if;
end $$;
revoke execute on function public.consume_scan() from public, anon;
grant execute on function public.consume_scan() to authenticated;

-- ── Deleting on request ──────────────────────────────────────────────────────────────────────────────────────────
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
end $$;
grant execute on function public.delete_my_cloud_data() to authenticated;

-- The account itself. Every table above cascades from auth.users, so this removes whatever is left, consents and
-- usage included.
create or replace function public.delete_my_account()
returns void
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid();
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  delete from auth.users where id = v_uid;
end $$;
revoke execute on function public.delete_my_account() from public, anon;
grant execute on function public.delete_my_account() to authenticated;
