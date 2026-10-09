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
await db.exec(readFileSync(ROOT + '0006_trial_ends_on_pro.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0006_trial_ends_on_pro.sql', 'utf8'))
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
b = await bal(D); assert.equal(b.tier, 'pro'); assert.equal(b.cards.month.allowance, 400)
assert.equal(b.briefs.left, 20, 'subscribing to Pro ends the trial: 20 briefs, not 23'); assert.equal(b.briefs.trial, 0)
for (let i = 0; i < 20; i++) await as('authenticated', D, 'select public.charge_brief()')
b = await bal(D); assert.equal(b.briefs.month.used, 20); assert.equal(b.briefs.left, 0)
await sudo(`select public.grant_pack('${D}', 'briefs', 10)`)
await as('authenticated', D, 'select public.charge_brief()')
b = await bal(D); assert.equal(b.briefs.extra, 9)
// granting the same plan again extends it
await sudo(`select public.grant_plan('${D}', 'pro', 1)`)
r = await db.query(`select period_end from public.plans where owner_id = '${D}'`)
assert.ok(r.rows[0].period_end > new Date(Date.now() + 45 * 864e5), 'a second month is added to the first')
b = await bal(D); assert.ok(new Date(b.periodEnd) < new Date(Date.now() + 32 * 864e5), 'the balance shows when this month renews, not when the plan ends')
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
// the Free month ends at midnight IST on the 1st of the next month, whatever the month's length (review C1)
const F = '66666666-6666-6666-6666-666666666666', G = '77777777-7777-7777-7777-777777777777'
await db.exec(`insert into auth.users values ('${F}'), ('${G}')`)
const period = async (uid, at) => (await db.query(`select p_start, p_end, tier from public._period($1, $2::timestamptz)`, [uid, at])).rows[0]
let pp = await period(F, '2026-10-31T17:30:00Z')      // 31 Oct, 23:00 IST
assert.equal(pp.p_start.toISOString(), '2026-09-30T18:30:00.000Z'); assert.equal(pp.p_end.toISOString(), '2026-10-31T18:30:00.000Z', '31 Oct IST is still October')
pp = await period(F, '2027-03-31T12:00:00Z')
assert.equal(pp.p_end.toISOString(), '2027-03-31T18:30:00.000Z', 'March ends on the 31st, not the 28th')

// a paid plan's month runs from its start, month by month, inside a longer period (review C2)
await db.exec(`insert into public.plans (owner_id, tier, period_start, period_end) values ('${G}', 'pro', '2026-01-15T06:00:00Z', '2027-01-15T06:00:00Z')`)
pp = await period(G, '2026-03-20T00:00:00Z')
assert.equal(pp.tier, 'pro')
assert.equal(pp.p_start.toISOString(), '2026-03-15T06:00:00.000Z'); assert.equal(pp.p_end.toISOString(), '2026-04-15T06:00:00.000Z', 'a yearly plan gives its allowance every month')
pp = await period(G, '2027-01-10T00:00:00Z')
assert.equal(pp.p_end.toISOString(), '2027-01-15T06:00:00.000Z', 'the last month stops where the plan ends')
// renewal: last month's use does not count against the next month
await db.exec(`update public.plans set period_start = now() - interval '40 days', period_end = now() + interval '20 days' where owner_id = '${G}'`)
await db.exec(`insert into public.usage (owner_id, at, kind, source, qty) values ('${G}', now() - interval '35 days', 'card', 'month', 400)`)
b = await bal(G); assert.equal(b.cards.month.used, 0, 'the second month starts fresh'); assert.equal(b.cards.month.allowance, 400)
console.log('ok month ends in India time; paid plans count month by month')


// ── 0007 plans v2 and lead capture as a paid feature (applied after the earlier checks, which test their own migrations) ──
await db.exec(readFileSync(ROOT + '0007_plans_v2.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0007_plans_v2.sql', 'utf8'))   // re-runnable
const [H, I, J, K] = ['88888888-8888-8888-8888-888888888881', '88888888-8888-8888-8888-888888888882', '88888888-8888-8888-8888-888888888883', '88888888-8888-8888-8888-888888888884']
await db.exec(`insert into auth.users values ('${H}'), ('${I}'), ('${J}'), ('${K}')`)
await sudo(`select public.grant_plan('${H}', 'starter', 1)`)
b = await bal(H)
assert.equal(b.tier, 'starter'); assert.equal(b.cards.month.allowance, 100); assert.equal(b.briefs.month.allowance, 3)
assert.equal(b.canCollect, true); assert.equal(b.briefs.trial, 0, 'any paid plan ends the trial')
await sudo(`select public.grant_plan('${I}', 'unlimited', 1)`)
b = await bal(I); assert.equal(b.cards.month.allowance, 1000000); assert.equal(b.briefs.month.allowance, 30)
for (let i = 0; i < 200; i++) assert.equal((await begin(I, 'read')).allowed, true)
r = await begin(I, 'read'); assert.equal(r.allowed, false); assert.equal(r.reason, 'daily_limit'); assert.equal(r.day_limit, 200)
b = await bal(J); assert.equal(b.tier, 'free'); assert.equal(b.canCollect, false)
for (let i = 0; i < 3; i++) await as('authenticated', J, 'select public.charge_brief()')
r = await begin(J, 'brief'); assert.equal(r.allowed, false); assert.equal(r.reason, 'plan_needed')
await sudo(`select public.grant_pass('${K}')`)
assert.equal((await bal(K)).canCollect, true, 'the Exhibition pass collects leads')
await db.exec(`update public.passes set ends_at = now() - interval '1 minute' where owner_id = '${K}'`)
assert.equal((await bal(K)).canCollect, false)
await assert.rejects(sudo(`select public.grant_plan('${H}', 'gold', 1)`), /bad grant/)
// leads arrive only at a stall that can collect
await as('authenticated', J, `insert into public.cards (owner_id, local_card_id, slug, name) values ('${J}', 'mj', 'SLUGJ111', 'Free')`)
await as('authenticated', H, `insert into public.cards (owner_id, local_card_id, slug, name) values ('${H}', 'mh', 'SLUGH111', 'Paid')`)
const cardOf = async (slug) => (await db.query(`select id from public.cards where slug = '${slug}'`)).rows[0].id
const jCard = await cardOf('SLUGJ111'), hCard = await cardOf('SLUGH111')
await assert.rejects(as('anon', null, `select public.submit_lead_pack($1, 'expo', 'Expo', 'V', '999', null, null)`, [jCard]), /not_collecting/)
await assert.rejects(as('anon', null, `select public.submit_lead($1, 'expo', 'Expo', 'V', '999', null, null)`, [jCard]), /not_collecting/)
assert.equal((await db.query(`select count(*)::int as n from public.leads where owner_id = '${J}'`)).rows[0].n, 0, 'nothing stored for a stall that cannot collect')
await as('anon', null, `select public.submit_lead_pack($1, 'expo', 'Expo', 'V', '999', null, null)`, [hCard])
assert.equal((await db.query(`select count(*)::int as n from public.leads where owner_id = '${H}'`)).rows[0].n, 1)
// visitor packs and their files: only with a plan or pass
await assert.rejects(as('authenticated', J, `insert into public.visitor_packs (owner_id, event_id) values ('${J}', 'expo')`), /row-level security/)
await as('authenticated', H, `insert into public.visitor_packs (owner_id, event_id) values ('${H}', 'expo')`)
await assert.rejects(as('authenticated', J, `insert into storage.objects (bucket_id, name) values ('visitor-packs', '${J}/expo/a.pdf')`), /row-level security/)
await as('authenticated', H, `insert into storage.objects (bucket_id, name) values ('visitor-packs', '${H}/expo/a.pdf')`)
// a lapsed plan stops new leads and keeps the ones received
await db.exec(`update public.plans set period_end = now() - interval '1 minute' where owner_id = '${H}'`)
await assert.rejects(as('anon', null, `select public.submit_lead_pack($1, 'expo', 'Expo', 'V2', '888', null, null)`, [hCard]), /not_collecting/)
assert.equal((await as('authenticated', H, `select count(*)::int as n from public.leads`)).rows[0].n, 1, 'received leads stay')
console.log('ok 0007 plans v2, Unlimited fair use, Brief on every plan, lead capture gated at leads and packs')

// ── 0008 digital cards by plan: Free 1, Starter 2, Plus 3, Pro and Unlimited 5; the pass changes nothing ──
await db.exec(readFileSync(ROOT + '0008_my_cards_limit.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0008_my_cards_limit.sql', 'utf8'))   // re-runnable
const L = '88888888-8888-8888-8888-888888888888'
await db.exec(`insert into auth.users values ('${L}')`)
const publish = (uid, local, slug, at) => as('authenticated', uid, `insert into public.cards (owner_id, local_card_id, slug, name, created_at) values ('${uid}', '${local}', '${slug}', 'L', '${at}')`)
await publish(L, 'l1', 'SLUGL001', '2026-01-01')
await assert.rejects(publish(L, 'l2', 'SLUGL002', '2026-01-02'), /card_limit/, 'Free keeps one card')
await sudo(`select public.grant_plan('${L}', 'starter', 1)`)
await publish(L, 'l2', 'SLUGL002', '2026-01-02')
await assert.rejects(publish(L, 'l3', 'SLUGL003', '2026-01-03'), /card_limit/, 'Starter keeps two')
await sudo(`select public.grant_plan('${L}', 'plus', 1)`)
await publish(L, 'l3', 'SLUGL003', '2026-01-03')
await assert.rejects(publish(L, 'l4', 'SLUGL004', '2026-01-04'), /card_limit/, 'Plus keeps three')
await sudo(`select public.grant_plan('${L}', 'pro', 1)`)
await publish(L, 'l4', 'SLUGL004', '2026-01-04'); await publish(L, 'l5', 'SLUGL005', '2026-01-05')
await assert.rejects(publish(L, 'l6', 'SLUGL006', '2026-01-06'), /card_limit/, 'Pro keeps five')
// the plan lapses: the oldest card stays live, the newer ones stop opening and taking leads, and can still be edited
await db.exec(`update public.plans set period_end = now() - interval '1 minute' where owner_id = '${L}'`)
await db.exec(`update public.passes set ends_at = now() - interval '1 minute' where owner_id = '${L}'`)
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGL001')`)).rows.length, 1)
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGL002')`)).rows.length, 0, 'over the limit reads as not found')
await assert.rejects(as('anon', null, `select public.submit_lead($1, null, null, 'V', '9', null, null)`, [await cardOf('SLUGL005')]), /unknown card/)
await as('authenticated', L, `update public.cards set name = 'Edited' where local_card_id = 'l5'`)
assert.equal((await db.query(`select name from public.cards where local_card_id = 'l5'`)).rows[0].name, 'Edited')
await assert.rejects(as('anon', null, 'select public._card_in_plan(gen_random_uuid())'), /permission denied/)
console.log('ok 0008 digital cards by plan, enforced at publish, public page and leads')

// ── 0009 a running Exhibition pass keeps 5 cards whatever the plan; when it ends the plan's number returns ──
await db.exec(readFileSync(ROOT + '0009_pass_my_cards.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0009_pass_my_cards.sql', 'utf8'))   // re-runnable
const M = '88888888-8888-8888-8888-888888888889'
await db.exec(`insert into auth.users values ('${M}')`)
await publish(M, 'm1', 'SLUGM001', '2026-02-01')
await assert.rejects(publish(M, 'm2', 'SLUGM002', '2026-02-02'), /card_limit/, 'Free keeps one')
await sudo(`select public.grant_pass('${M}')`)
for (let i = 2; i <= 5; i++) await publish(M, `m${i}`, `SLUGM00${i}`, `2026-02-0${i}`)
await assert.rejects(publish(M, 'm6', 'SLUGM006', '2026-02-06'), /card_limit/, 'the pass keeps five')
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGM005')`)).rows.length, 1, 'all five open while the pass runs')
await db.exec(`update public.passes set ends_at = now() - interval '1 minute' where owner_id = '${M}'`)
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGM001')`)).rows.length, 1)
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGM002')`)).rows.length, 0, 'the pass over: back to the plan')
await assert.rejects(publish(M, 'm6', 'SLUGM006', '2026-02-06'), /card_limit/)
console.log('ok 0009 the Exhibition pass keeps five digital cards while it runs')

// ── 0010 charge once per request id: a lost answer retried on a weak signal is not charged twice ──
await db.exec(readFileSync(ROOT + '0010_charge_once.sql', 'utf8'))
await db.exec(readFileSync(ROOT + '0010_charge_once.sql', 'utf8'))   // re-runnable
const N = '88888888-8888-8888-8888-88888888888a'
await db.exec(`insert into auth.users values ('${N}')`)
const left = async () => (await bal(N)).cards.left
const start = await left()
await as('authenticated', N, `select public.charge_reads_once(2, 'read:aaaaaaaaaaaaaaaa')`)
assert.equal(await left(), start - 2)
await as('authenticated', N, `select public.charge_reads_once(2, 'read:aaaaaaaaaaaaaaaa')`)
assert.equal(await left(), start - 2, 'the same read retried is not charged again')
await as('authenticated', N, `select public.charge_reads_once(1, 'read:bbbbbbbbbbbbbbbb')`)
assert.equal(await left(), start - 3, 'another read is')
assert.equal((await db.query(`select count(*)::int as n from public.usage where owner_id = '${N}' and request_id is null`)).rows[0].n, 0, 'every charge row carries its id')
const briefs = async () => (await bal(N)).briefs.left
const b0 = await briefs()
await as('authenticated', N, `select public.charge_brief_once('brief:cccccccccccc')`)
await as('authenticated', N, `select public.charge_brief_once('brief:cccccccccccc')`)
assert.equal(await briefs(), b0 - 1, 'a brief retried is charged once')
await assert.rejects(as('authenticated', N, `select public.charge_reads_once(1, 'short')`), /bad request id/)
await assert.rejects(as('anon', null, `select public.charge_reads_once(1, 'read:dddddddddddddddd')`), /permission denied/)
console.log('ok 0010 charge once per request id, reads and briefs')

console.log('ALL OK')
