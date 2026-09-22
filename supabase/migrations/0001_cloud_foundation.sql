-- supabase/migrations/0001_cloud_foundation.sql
-- Run once, by hand, in the Supabase project's SQL Editor. There is no CI migration runner in this project.

create table public.cards (
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
  unique (owner_id, local_card_id)
);
alter table public.cards enable row level security;
create policy "owner reads own cards" on public.cards for select using (auth.uid() = owner_id);
create policy "owner inserts own cards" on public.cards for insert with check (auth.uid() = owner_id);
create policy "owner updates own cards" on public.cards for update using (auth.uid() = owner_id);
create policy "owner deletes own cards" on public.cards for delete using (auth.uid() = owner_id);

-- The only public read path. security definer bypasses RLS inside the function, but the function only ever
-- returns one row for one known slug — there is no way to ask it for "all cards". Returns a SET (zero or one
-- rows), not a single composite: PostgREST serializes a NULL composite as an object of all-null fields rather
-- than JSON null, which would make a dead link look like a real, blank card. A set makes "not found" an
-- unambiguous empty array.
-- Postgres refuses to change a function's return type via CREATE OR REPLACE, so drop it first (idempotent
-- across re-runs of this file).
drop function if exists public.get_public_card(text);
create function public.get_public_card(p_slug text)
returns setof public.cards
language sql security definer set search_path = public as $$
  select * from public.cards where slug = p_slug limit 1;
$$;
grant execute on function public.get_public_card(text) to anon;

create table public.leads (
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
create policy "owner reads own leads" on public.leads for select using (auth.uid() = owner_id);
create policy "owner updates own leads" on public.leads for update using (auth.uid() = owner_id);

-- The only public write path. owner_id is derived from the card here, never accepted from the caller, so nobody
-- can claim someone else's leads.
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
  return v_id;
end $$;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text) to anon;

insert into storage.buckets (id, name, public) values ('card-photos', 'card-photos', true)
  on conflict (id) do nothing;
create policy "owner writes own photos" on storage.objects for insert
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own photos" on storage.objects for update
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
