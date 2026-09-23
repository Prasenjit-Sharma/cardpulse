// Run: npx -y -p @electric-sql/pglite node scripts/check-migrations.mjs   (or install @electric-sql/pglite anywhere on NODE_PATH)
// Runs both migrations against PGlite with stand-ins for Supabase's auth and storage schemas, then checks behaviour.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import assert from 'node:assert/strict'

const ROOT = new URL('../supabase/migrations/', import.meta.url).pathname
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin;
  create schema auth; create table auth.users (id uuid primary key);
  create function auth.uid() returns uuid language sql stable as $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  grant usage on schema auth to anon, authenticated; grant execute on function auth.uid() to anon, authenticated;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql immutable as $$ select (string_to_array(name, '/'))[1:array_length(string_to_array(name, '/'), 1) - 1] $$;
  grant usage on schema storage to anon, authenticated; grant all on storage.objects to anon, authenticated;
  grant usage on schema public to anon, authenticated;
  alter default privileges in schema public grant all on tables to anon, authenticated;
  alter default privileges in schema public grant all on sequences to anon, authenticated;
`)
await db.exec(readFileSync(ROOT + '0001_cloud_foundation.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0002_sync_quota_privacy.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0002_sync_quota_privacy.sql', 'utf8'))   // re-runnable
console.log('migrations ran (0002 twice)')

const A = '11111111-1111-1111-1111-111111111111', B = '22222222-2222-2222-2222-222222222222'
await db.exec(`insert into auth.users values ('${A}'), ('${B}')`)
const as = async (role, uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}

// sync_push: newer wins, older is ignored
const push = (uid, items) => as('authenticated', uid, 'select public.sync_push($1::jsonb) as n', [JSON.stringify(items)])
let r = await push(A, [{ kind: 'card', id: 'c1', data: { v: 1 }, updatedAt: 100 }, { kind: 'event', id: 'e1', data: { name: 'Expo' }, updatedAt: 100 }])
assert.equal(r.rows[0].n, 2)
r = await push(A, [{ kind: 'card', id: 'c1', data: { v: 0 }, updatedAt: 50 }])
assert.equal(r.rows[0].n, 0, 'an older change is not written')
r = await push(A, [{ kind: 'card', id: 'c1', data: { v: 2 }, updatedAt: 200 }])
assert.equal(r.rows[0].n, 1)
r = await as('authenticated', A, `select data, seq from public.sync_items where item_id = 'c1'`)
assert.deepEqual(r.rows[0].data, { v: 2 })
const seqC1 = Number(r.rows[0].seq)
r = await push(A, [{ kind: 'card', id: 'c1', deleted: true, data: { v: 3 }, updatedAt: 300 }])
r = await as('authenticated', A, `select data, deleted, seq from public.sync_items where item_id = 'c1'`)
assert.equal(r.rows[0].data, null); assert.equal(r.rows[0].deleted, true); assert.ok(Number(r.rows[0].seq) > seqC1, 'seq moves forward on every write')
console.log('ok sync_push newer-wins, tombstones, seq')

// isolation
r = await as('authenticated', B, 'select * from public.sync_items')
assert.equal(r.rows.length, 0, 'B sees none of A\'s items')
r = await as('anon', null, 'select * from public.sync_items')
assert.equal(r.rows.length, 0, 'anon sees nothing')
await assert.rejects(push(null, [{ kind: 'card', id: 'x', data: {}, updatedAt: 1 }]), /not signed in|permission denied/)
await push(B, [{ kind: 'card', id: 'c1', data: { mine: 'B' }, updatedAt: 1 }])
r = await as('authenticated', A, `select data from public.sync_items where item_id = 'c1'`)
assert.equal(r.rows[0].data, null, 'B writing the same item id does not touch A\'s row')
await assert.rejects(as('authenticated', B, `insert into public.sync_items (owner_id, kind, item_id, client_updated_at) values ('${A}', 'card', 'forged', 1)`), /row-level security/)
await assert.rejects(push(A, [{ kind: 'bogus', id: 'x', data: {}, updatedAt: 1 }]), /check constraint/)
await assert.rejects(push(A, Array.from({ length: 201 }, (_, i) => ({ kind: 'card', id: 'b' + i, data: {}, updatedAt: 1 }))), /1 to 200/)
console.log('ok isolation and input checks')

// consume_scan
for (let i = 1; i <= 300; i++) {
  r = await as('authenticated', A, 'select * from public.consume_scan()')
  assert.equal(r.rows[0].allowed, true); assert.equal(r.rows[0].used, i)
}
r = await as('authenticated', A, 'select * from public.consume_scan()')
assert.deepEqual(r.rows[0], { allowed: false, used: 300, day_limit: 300 })
r = await as('authenticated', B, 'select * from public.consume_scan()')
assert.equal(r.rows[0].allowed, true); assert.equal(r.rows[0].used, 1)
await assert.rejects(as('anon', null, 'select * from public.consume_scan()'), /permission denied/)
await assert.rejects(as('authenticated', A, `update public.scan_usage set reads = 0`).then((x) => { if (x.affectedRows === 0) throw new Error('row-level security: no rows') }), /row-level security/)
console.log('ok consume_scan limit per account, anon refused, count not editable')

// counts, leads delete, cloud data deletion, account deletion
await as('authenticated', A, `insert into public.cards (owner_id, local_card_id, slug, name) values ('${A}', 'm1', 'SLUGA111', 'Asha')`)
const cardId = (await as('authenticated', A, `select id from public.cards`)).rows[0].id
await as('anon', null, `select public.record_card_view('SLUGA111')`)
await as('anon', null, `select public.record_card_view('SLUGA111')`)
await as('anon', null, `select public.record_card_view('nope')`)
await as('anon', null, `select public.submit_lead($1, null, null, 'Visitor', '999', null, null)`, [cardId])
r = await as('authenticated', A, `select view_count, lead_count from public.cards`)
assert.deepEqual(r.rows[0], { view_count: 2, lead_count: 1 })
r = await as('anon', null, `select * from public.get_public_card('SLUGA111')`)
assert.equal(r.rows.length, 1); assert.equal('view_count' in r.rows[0], false, 'counts are not on the public page')
r = await as('authenticated', B, `delete from public.leads`)
assert.equal(r.affectedRows, 0, 'B cannot delete A\'s leads')
r = await as('authenticated', A, `delete from public.leads`)
assert.equal(r.affectedRows, 1, 'owner can delete own leads')
await as('authenticated', A, `insert into public.consents (purpose, policy_version) values ('sync', '2026-09-23')`)
await as('authenticated', A, `select public.delete_my_cloud_data()`)
r = await as('authenticated', A, `select (select count(*) from public.sync_items)::int si, (select count(*) from public.cards)::int c`)
assert.deepEqual(r.rows[0], { si: 0, c: 0 })
r = await as('authenticated', B, `select count(*)::int n from public.sync_items`)
assert.equal(r.rows[0].n, 1, 'B\'s data untouched')
await as('authenticated', A, `select public.delete_my_account()`)
r = await db.query(`select (select count(*) from auth.users where id = '${A}')::int u, (select count(*) from public.consents)::int c, (select count(*) from public.scan_usage where owner_id = '${A}')::int s`)
assert.deepEqual(r.rows[0], { u: 0, c: 0, s: 0 })
await assert.rejects(as('anon', null, `select public.delete_my_account()`), /permission denied/)
console.log('ok counts, lead delete, delete cloud data, delete account')

// storage policies
await as('authenticated', B, `insert into storage.objects (bucket_id, name) values ('sync-photos', '${B}/card-x-image.jpg')`)
await assert.rejects(as('authenticated', B, `insert into storage.objects (bucket_id, name) values ('sync-photos', '${A}/card-x-image.jpg')`), /row-level security/)
r = await as('anon', null, `select * from storage.objects where bucket_id = 'sync-photos'`)
assert.equal(r.rows.length, 0, 'sync photos are private')
r = await as('authenticated', B, `select * from storage.objects where bucket_id = 'sync-photos'`)
assert.equal(r.rows.length, 1)
r = await db.query(`select public from storage.buckets where id = 'sync-photos'`)
assert.equal(r.rows[0].public, false)
console.log('ok storage policies')
console.log('ALL OK')
