// Run: npm run test:db (after check-migrations), or node scripts/check-baseline.mjs
// supabase/baseline.sql is what a NEW project runs instead of migrations 0001 to 0011. This builds one database each way
// (PGlite, with stand-ins for Supabase's auth and storage) and compares them: every table and column, function and its
// body, policy, grant, trigger, index and storage bucket must match, apart from the changes the baseline lists. Then it
// runs the baseline's own behaviour checks: the daily brakes (the one table that changed), charging, limits and leads.
import { PGlite } from '@electric-sql/pglite'
import { readFileSync, readdirSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import assert from 'node:assert/strict'

const ROOT = fileURLToPath(new URL('../supabase/', import.meta.url))
const SETUP = `
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
`
async function fresh() { const db = new PGlite(); await db.exec(SETUP); return db }

const migrated = await fresh()
for (const f of readdirSync(ROOT + 'migrations').filter((f) => /^\d{4}_.*\.sql$/.test(f)).sort()) await migrated.exec(readFileSync(ROOT + 'migrations/' + f, 'utf8'))
const base = await fresh()
await base.exec(readFileSync(ROOT + 'baseline.sql', 'utf8'))
await base.exec(readFileSync(ROOT + 'baseline.sql', 'utf8'))   // re-runnable
console.log('baseline ran twice; migrations 0001 to 0011 ran in order')

// ── the same database, apart from the listed changes ──
const TABLES_GONE = new Set(['scan_usage', 'brief_usage']), TABLES_NEW = new Set(['daily_brakes'])
const FUNCS_GONE = new Set(['consume_scan', 'consume_brief', 'submit_lead']), FUNCS_NEW = new Set(['_brake'])
const FUNCS_CHANGED = new Set(['begin_read', 'begin_brief'])        // they count in daily_brakes now
const norm = (s) => s.replace(/--[^\n]*/g, '').replace(/\s+/g, ' ').trim()
const rows = async (db, sql) => (await db.query(sql)).rows.map((r) => JSON.stringify(r))
function same(name, a, b, skipA = () => false, skipB = () => false) {
  const x = new Set(a.filter((r) => !skipA(JSON.parse(r)))), y = new Set(b.filter((r) => !skipB(JSON.parse(r))))
  const onlyA = [...x].filter((r) => !y.has(r)), onlyB = [...y].filter((r) => !x.has(r))
  assert.deepEqual({ onlyInMigrations: onlyA, onlyInBaseline: onlyB }, { onlyInMigrations: [], onlyInBaseline: [] }, name)
}
const cols = `select table_name, column_name, data_type, is_nullable from information_schema.columns where table_schema = 'public' order by 1, 2`
same('tables and columns', await rows(migrated, cols), await rows(base, cols), (r) => TABLES_GONE.has(r.table_name), (r) => TABLES_NEW.has(r.table_name))
const funcs = `select p.proname as name, pg_get_function_identity_arguments(p.oid) as args, pg_get_function_result(p.oid) as result,
  p.prosecdef as definer, p.provolatile as volatility, p.prosrc as body from pg_proc p join pg_namespace n on n.oid = p.pronamespace where n.nspname = 'public'`
const fnRows = async (db) => (await db.query(funcs)).rows.map((r) => JSON.stringify({ ...r, body: FUNCS_CHANGED.has(r.name) ? '(changed)' : norm(r.body) }))
same('functions, arguments, security and bodies', await fnRows(migrated), await fnRows(base), (r) => FUNCS_GONE.has(r.name), (r) => FUNCS_NEW.has(r.name))
const pols = `select schemaname, tablename, policyname, cmd, coalesce(qual, '') as qual, coalesce(with_check, '') as with_check from pg_policies`
same('row-level security policies', await rows(migrated, pols), await rows(base, pols), (r) => TABLES_GONE.has(r.tablename), (r) => TABLES_NEW.has(r.tablename))
const rls = `select relname from pg_class c join pg_namespace n on n.oid = c.relnamespace where n.nspname = 'public' and c.relkind = 'r' and c.relrowsecurity`
same('row-level security switched on', await rows(migrated, rls), await rows(base, rls), (r) => TABLES_GONE.has(r.relname), (r) => TABLES_NEW.has(r.relname))
const grants = `select r.routine_name, p.grantee, p.privilege_type from information_schema.routine_privileges p join information_schema.routines r on r.specific_name = p.specific_name
  where r.routine_schema = 'public' and p.grantee in ('anon', 'authenticated', 'service_role', 'PUBLIC')`
same('who may call each function', await rows(migrated, grants), await rows(base, grants), (r) => FUNCS_GONE.has(r.routine_name), (r) => FUNCS_NEW.has(r.routine_name))
const trig = `select event_object_table, trigger_name, event_manipulation, action_timing from information_schema.triggers where trigger_schema = 'public'`
same('triggers', await rows(migrated, trig), await rows(base, trig))
const idx = `select tablename, indexname from pg_indexes where schemaname = 'public'`
same('indexes', await rows(migrated, idx), await rows(base, idx), (r) => TABLES_GONE.has(r.tablename), (r) => TABLES_NEW.has(r.tablename))
const cons = `select conrelid::regclass::text as tbl, pg_get_constraintdef(oid) as def from pg_constraint where connamespace = 'public'::regnamespace`
same('constraints (checks, keys, references)', await rows(migrated, cons), await rows(base, cons), (r) => TABLES_GONE.has(r.tbl), (r) => TABLES_NEW.has(r.tbl))
same('storage buckets', await rows(migrated, 'select * from storage.buckets'), await rows(base, 'select * from storage.buckets'))
console.log('ok the baseline defines the same database as 0001 to 0011, apart from the listed changes')

// ── the baseline's own behaviour ──
const db = base
const as = async (role, uid, sql, params) => {
  await db.exec(`reset role; select set_config('request.jwt.claim.sub', '${uid ?? ''}', false); set role ${role};`)
  try { return await db.query(sql, params) } finally { await db.exec('reset role') }
}
const sudo = (sql, params) => as('service_role', null, sql, params)
const bal = async (uid) => (await as('authenticated', uid, 'select public.my_balance() as b')).rows[0].b
const begin = async (uid, what) => (await as('authenticated', uid, `select * from public.begin_${what}()`)).rows[0]
const [F, U, P, Q] = ['a1', 'a2', 'a3', 'a4'].map((s) => `99999999-9999-9999-9999-9999999999${s}`)
await db.exec(`insert into auth.users values ('${F}'), ('${U}'), ('${P}'), ('${Q}')`)

// daily brakes: 300 reads (Unlimited 200) and 10 briefs a day, counted in one table, each kind apart
await db.exec(`insert into public.daily_brakes (owner_id, day, kind, n) values ('${F}', current_date, 'read', 299)`)
let r = await begin(F, 'read'); assert.equal(r.allowed, true); assert.equal(r.day_limit, 300)
r = await begin(F, 'read'); assert.equal(r.allowed, false); assert.equal(r.reason, 'daily_limit')
await sudo(`select public.grant_plan('${U}', 'unlimited', 1)`)
await db.exec(`insert into public.daily_brakes (owner_id, day, kind, n) values ('${U}', current_date, 'read', 199)`)
r = await begin(U, 'read'); assert.equal(r.allowed, true); assert.equal(r.day_limit, 200)
r = await begin(U, 'read'); assert.equal(r.allowed, false, 'Unlimited fair use: 200 a day')
for (let i = 0; i < 10; i++) assert.equal((await begin(U, 'brief')).allowed, true, `brief ${i + 1}`)
r = await begin(U, 'brief'); assert.equal(r.allowed, false); assert.equal(r.reason, 'daily_limit')
assert.deepEqual((await db.query(`select kind, n from public.daily_brakes where owner_id = '${U}' order by kind`)).rows, [{ kind: 'brief', n: 10 }, { kind: 'read', n: 200 }])
assert.equal((await as('authenticated', F, 'select count(*)::int as n from public.daily_brakes')).rows[0].n, 1, 'each account sees only its own brakes')
await assert.rejects(as('authenticated', F, `update public.daily_brakes set n = 0`).then((x) => { if (!x.affectedRows) throw new Error('row-level security: no rows') }), /row-level security/)
console.log('ok daily brakes: reads and briefs per account per day, Unlimited 200, nobody resets their own')

// balances, charging once, plans, the card limit and leads behave as in 0011
let b = await bal(P); assert.equal(b.tier, 'free'); assert.equal(b.cards.left, 20); assert.equal(b.briefs.trial, 3)
assert.equal((await bal(U)).cards.month.allowance, 3000)
await as('authenticated', P, `select public.charge_reads_once(2, 'read:aaaaaaaaaaaaaaaa')`)
await as('authenticated', P, `select public.charge_reads_once(2, 'read:aaaaaaaaaaaaaaaa')`)
assert.equal((await bal(P)).cards.left, 18, 'a retried read is charged once')
await as('authenticated', P, `insert into public.cards (owner_id, local_card_id, slug, name, created_at) values ('${P}', 'p1', 'SLUGP001', 'P', '2026-01-01')`)
await assert.rejects(as('authenticated', P, `insert into public.cards (owner_id, local_card_id, slug, name, created_at) values ('${P}', 'p2', 'SLUGP002', 'P', '2026-01-02')`), /card_limit/, 'Free keeps one card')
const card = (await db.query(`select id from public.cards where slug = 'SLUGP001'`)).rows[0].id
await assert.rejects(as('anon', null, `select public.submit_lead_pack($1, 'e', 'E', 'V', '9', null, null)`, [card]), /not_collecting/, 'Free cannot collect leads')
await sudo(`select public.grant_pass('${P}')`)
await as('anon', null, `select public.submit_lead_pack($1, 'e', 'E', 'V', '9', null, null)`, [card])
assert.equal((await as('authenticated', P, 'select count(*)::int as n from public.leads')).rows[0].n, 1)
assert.equal((await as('anon', null, `select * from public.get_public_card('SLUGP001')`)).rows.length, 1)
await assert.rejects(as('anon', null, `select public.submit_lead($1, null, null, 'V', '9', null, null)`, [card]), /does not exist/, 'submit_lead is not carried over')
await assert.rejects(as('authenticated', Q, 'select * from public.consume_scan()'), /does not exist/, 'consume_scan is not carried over')
await as('authenticated', Q, 'select public.delete_my_account()')
assert.equal((await db.query(`select count(*)::int as n from auth.users where id = '${Q}'`)).rows[0].n, 0)
console.log('ok balances, charge once, plans, card limit, leads and deletion behave as after 0011')
console.log('BASELINE OK')
