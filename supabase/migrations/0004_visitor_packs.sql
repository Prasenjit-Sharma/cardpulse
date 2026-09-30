-- supabase/migrations/0004_visitor_packs.sql
-- Visitor pack: per event, up to 3 files, one web link and a short note, shown to a stall visitor right after they send
-- their details on the Collect-leads page. Re-runnable. Run it in the Supabase SQL editor after 0003.
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
drop policy if exists "owner reads own packs" on public.visitor_packs;
drop policy if exists "owner writes own packs" on public.visitor_packs;
drop policy if exists "owner changes own packs" on public.visitor_packs;
drop policy if exists "owner deletes own packs" on public.visitor_packs;
create policy "owner reads own packs" on public.visitor_packs for select using (auth.uid() = owner_id);
create policy "owner writes own packs" on public.visitor_packs for insert with check (auth.uid() = owner_id);
create policy "owner changes own packs" on public.visitor_packs for update using (auth.uid() = owner_id) with check (auth.uid() = owner_id);
create policy "owner deletes own packs" on public.visitor_packs for delete using (auth.uid() = owner_id);

-- The files: public to read (each under an unguessable name, handed out only after a visitor sends their details),
-- written only inside the owner's own folder.
insert into storage.buckets (id, name, public) values ('visitor-packs', 'visitor-packs', true)
  on conflict (id) do nothing;
drop policy if exists "owner adds pack files" on storage.objects;
drop policy if exists "owner removes pack files" on storage.objects;
create policy "owner adds pack files" on storage.objects for insert
  with check (bucket_id = 'visitor-packs' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner removes pack files" on storage.objects for delete
  using (bucket_id = 'visitor-packs' and (storage.foldername(name))[1] = auth.uid()::text);

-- Sending details, answered with the pack for that card's owner and event. The answer comes with the submission itself:
-- the stall phone deletes leads from the server once it pulls them, so a later lookup could find nothing.
create or replace function public.submit_lead_pack(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns jsonb
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid; v_pack jsonb;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null then raise exception 'unknown card'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  select jsonb_build_object('note', note, 'link_url', link_url, 'link_label', link_label, 'files', files) into v_pack
  from public.visitor_packs where owner_id = v_owner and event_id = p_event_id;
  return jsonb_build_object('id', v_id, 'pack', v_pack);
end $$;
grant execute on function public.submit_lead_pack(uuid, text, text, text, text, text, text) to anon, authenticated;

-- "Delete cloud data" also removes the packs (their files are removed by the app first, through the Storage API).
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
