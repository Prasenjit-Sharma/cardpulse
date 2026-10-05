// Run: npm run test:db
// Runs both migrations against PGlite with stand-ins for Supabase's auth and storage schemas, then checks behaviour.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = fileURLToPath(new URL('../supabase/migrations/', import.meta.url))
const db = new PGlite()
await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin;
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
await db.exec(readFileSync(ROOT + '0003_brief_quota.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0003_brief_quota.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0004_visitor_packs.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0004_visitor_packs.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0005_plans_balances.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0005_plans_balances.sql', 'utf8'))
console.log('migrations ran (0002 to 0005 twice)')

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

// consume_brief: its own limit of 10, separate from scans
for (let i = 1; i <= 10; i++) {
  r = await as('authenticated', A, 'select * from public.consume_brief()')
  assert.equal(r.rows[0].allowed, true); assert.equal(r.rows[0].used, i)
}
r = await as('authenticated', A, 'select * from public.consume_brief()')
assert.deepEqual(r.rows[0], { allowed: false, used: 10, day_limit: 10 })
r = await as('authenticated', B, 'select * from public.consume_brief()')
assert.equal(r.rows[0].used, 1)
await assert.rejects(as('anon', null, 'select * from public.consume_brief()'), /permission denied/)
console.log('ok consume_brief limit per account, anon refused')

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
// visitor packs: owner-only, limits enforced, handed out only as the answer to sending details
const pack = (uid, event, extra = '') => as('authenticated', uid, `insert into public.visitor_packs (owner_id, event_id, note, link_url, files) values ('${uid}', '${event}', 'Thanks for visiting', 'https://example.in', '[{"name":"a.pdf","path":"${uid}/${event}/x-a.pdf","size":10,"type":"application/pdf"}]'::jsonb) ${extra}`)
await pack(A, 'expo1')
await assert.rejects(pack(B, 'expo1', '').then(() => as('authenticated', B, `insert into public.visitor_packs (owner_id, event_id) values ('${A}', 'forged')`)), /row-level security/)
await assert.rejects(as('authenticated', A, `insert into public.visitor_packs (owner_id, event_id, files) values ('${A}', 'e4', '[1,2,3,4]'::jsonb)`), /check constraint/)
await assert.rejects(as('authenticated', A, `insert into public.visitor_packs (owner_id, event_id, link_url) values ('${A}', 'e5', 'javascript:alert(1)')`), /check constraint/)
r = await as('anon', null, 'select * from public.visitor_packs')
assert.equal(r.rows.length, 0, 'visitors cannot list packs')
r = await as('authenticated', B, `select * from public.visitor_packs where owner_id = '${A}'`)
assert.equal(r.rows.length, 0, 'B cannot read A\'s packs')
r = await as('anon', null, `select public.submit_lead_pack($1, 'expo1', 'Expo', 'Visitor', '999', null, null) as out`, [cardId])
assert.equal(r.rows[0].out.pack.note, 'Thanks for visiting'); assert.equal(r.rows[0].out.pack.files.length, 1); assert.ok(r.rows[0].out.id)
r = await as('anon', null, `select public.submit_lead_pack($1, 'other', 'Other', 'Visitor', '999', null, null) as out`, [cardId])
assert.equal(r.rows[0].out.pack, null, 'an event without a pack gives none')
r = await as('anon', null, `select public.submit_lead_pack($1, null, null, 'Visitor', '999', null, null) as out`, [cardId])
assert.equal(r.rows[0].out.pack, null, 'no event, no pack')
await as('authenticated', A, `delete from public.leads`)
console.log('ok visitor packs: owner-only, limits, handed out with the submission')

await as('authenticated', A, `insert into public.consents (purpose, policy_version) values ('sync', '2026-09-23')`)
await as('authenticated', A, `select public.delete_my_cloud_data()`)
r = await as('authenticated', A, `select (select count(*) from public.sync_items)::int si, (select count(*) from public.cards)::int c, (select count(*) from public.visitor_packs)::int vp`)
assert.deepEqual(r.rows[0], { si: 0, c: 0, vp: 0 })
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
// ── 0005 plans and balances ──
const C = '33333333-3333-3333-3333-333333333333', D = '44444444-4444-4444-4444-444444444444', E = '55555555-5555-5555-5555-555555555555'
await db.exec(`insert into auth.users values ('${C}'), ('${D}'), ('${E}')`)
const bal = async (uid) => (await as('authenticated', uid, 'select public.my_balance() as b')).rows[0].b
const chargeReads = async (uid, n) => (await as('authenticated', uid, 'select public.charge_reads($1) as b', [n])).rows[0].b
const begin = async (uid, what) => (await as('authenticated', uid, `select * from public.begin_${what}()`)).rows[0]
const sudo = (sql, params) => as('service_role', null, sql, params)

let b = await bal(C)
assert.equal(b.tier, 'free'); assert.deepEqual(b.cards.month, { used: 0, allowance: 20 }); assert.equal(b.cards.left, 20)
assert.equal(b.briefs.trial, 3); assert.equal(b.briefs.left, 3)

// the free month, then 0, never below
b = await chargeReads(C, 6); assert.equal(b.cards.left, 14)
b = await chargeReads(C, 20); assert.equal(b.cards.left, 0, 'a read bigger than what is left stops at 0')
r = await begin(C, 'read'); assert.equal(r.allowed, false); assert.equal(r.reason, 'no_cards')

// a pack, then a pass: pass first, then the month, then the pack
await sudo(`select public.grant_pack('${C}', 'cards', 50)`)
r = await begin(C, 'read'); assert.equal(r.allowed, true); assert.equal(r.balance.cards.left, 50)
await sudo(`select public.grant_pass('${C}')`)
b = await bal(C); assert.equal(b.cards.pass.allowance, 1000); assert.equal(b.cards.left, 1050)
b = await chargeReads(C, 3); assert.equal(b.cards.pass.used, 3); assert.equal(b.cards.pack, 50)
await db.exec(`update public.passes set ends_at = now() - interval '1 minute' where owner_id = '${C}'`)
b = await chargeReads(C, 2); assert.equal(b.cards.pass, null, 'an ended pass is not shown'); assert.equal(b.cards.pack, 48)

// the month rolls over in India time
await db.exec(`update public.usage set at = date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' - interval '1 minute' where owner_id = '${C}' and source = 'month'`)
b = await bal(C); assert.deepEqual(b.cards.month, { used: 0, allowance: 20 }); assert.equal(b.cards.left, 68)
await db.exec(`update public.usage set at = date_trunc('month', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata' + interval '1 minute' where owner_id = '${C}' and source = 'month'`)
b = await bal(C); assert.equal(b.cards.month.used, 20, 'one minute after midnight IST on the 1st is this month')

// Pro: 400 cards and 20 briefs; briefs go month, then extra, then trial
await sudo(`select public.grant_plan('${D}', 'pro', 1)`)
b = await bal(D); assert.equal(b.tier, 'pro'); assert.equal(b.cards.month.allowance, 400); assert.equal(b.briefs.left, 23)
for (let i = 0; i < 20; i++) await as('authenticated', D, 'select public.charge_brief()')
b = await bal(D); assert.equal(b.briefs.month.used, 20); assert.equal(b.briefs.trial, 3)
await sudo(`select public.grant_pack('${D}', 'briefs', 10)`)
await as('authenticated', D, 'select public.charge_brief()')
b = await bal(D); assert.equal(b.briefs.extra, 9); assert.equal(b.briefs.trial, 3)
// granting the same plan again extends it
b = (await sudo(`select public.grant_plan('${D}', 'pro', 1) as b`)).rows[0].b
assert.ok(new Date(b.periodEnd) > new Date(Date.now() + 45 * 864e5), 'a second month is added to the first')
// a paid period that ended: back to Free
await db.exec(`update public.plans set period_end = now() - interval '1 minute' where owner_id = '${D}'`)
b = await bal(D); assert.equal(b.tier, 'free'); assert.equal(b.cards.month.allowance, 20)

// briefs on Free: the trial, then pro_only; on Pro with nothing left: no_briefs
for (let i = 0; i < 3; i++) { r = await begin(E, 'brief'); assert.equal(r.allowed, true); await as('authenticated', E, 'select public.charge_brief()') }
r = await begin(E, 'brief'); assert.equal(r.allowed, false); assert.equal(r.reason, 'pro_only')
b = await bal(E); assert.equal(b.briefs.trial, 0, 'trial briefs are given once')
await sudo(`select public.grant_plan('${E}', 'pro', 1)`)
for (let i = 0; i < 20; i++) await as('authenticated', E, 'select public.charge_brief()')
r = await begin(E, 'brief'); assert.equal(r.reason, 'no_briefs')
r = await as('authenticated', E, 'select public.charge_brief() as b'); assert.equal(r.rows[0].b.briefs.left, 0, 'never below 0')

// the daily brakes still apply
for (let i = 0; i < 300; i++) await begin(D, 'read')
r = await begin(D, 'read'); assert.equal(r.allowed, false); assert.equal(r.reason, 'daily_limit'); assert.equal(r.day_limit, 300)

// isolation and grants
assert.equal((await as('authenticated', C, `select * from public.usage where owner_id <> '${C}'`)).rows.length, 0)
assert.equal((await as('authenticated', C, `select * from public.credits where owner_id = '${D}'`)).rows.length, 0)
await assert.rejects(as('authenticated', C, `select public.grant_pack('${C}', 'cards', 1000)`), /permission denied/)
await assert.rejects(as('authenticated', C, `update public.credits set pack_cards = 9999`).then((x) => { if (x.affectedRows === 0) throw new Error('row-level security: no rows') }), /row-level security|permission denied/)
await assert.rejects(as('anon', null, 'select public.my_balance()'), /permission denied/)
await assert.rejects(as('authenticated', C, 'select public._balance($1)', [C]), /permission denied/)
await assert.rejects(chargeReads(C, 0), /1 to 200/)
// Delete cloud data keeps purchases
await as('authenticated', C, 'select public.delete_my_cloud_data()')
b = await bal(C); assert.equal(b.cards.pack, 48, 'Delete cloud data keeps what was bought')
console.log('ok 0005 plans, packs, pass, briefs, month in India time, brakes, isolation, grants')
console.log('ALL OK')
