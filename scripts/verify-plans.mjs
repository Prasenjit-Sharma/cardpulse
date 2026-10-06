// Run: npm run verify:plans   (asks for the Supabase secret key, typed hidden)
// Checks migration 0005 on the live project: a new account's free balance, the check before a read, charging by
// contacts, briefs, that an account cannot grant itself anything, and the service role's grants. Creates and deletes
// one throwaway user.
import { createClient } from '@supabase/supabase-js'
import { secretKey } from './secret.mjs'

const URL = 'https://xqwslvteyhfmnxcnlpsg.supabase.co'
const PUBLISHABLE = 'sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf'

const SECRET = await secretKey()
const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } })
let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok  ${name}`) }
  else { failed++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function main() {
  const email = `cardpulse-verify-plans-${Date.now()}@example.com`
  const password = `Verify-${Math.random().toString(36).slice(2)}-1A`
  const { data: made, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const id = made.user.id
  const me = createClient(URL, PUBLISHABLE, { auth: { autoRefreshToken: false, persistSession: false } })
  try {
    const { error: e } = await me.auth.signInWithPassword({ email, password })
    if (e) throw e
    let r = await me.rpc('my_balance')
    check('a new account is on Free with 20 cards and 3 trial briefs', !r.error && r.data?.tier === 'free' && r.data.cards.left === 20 && r.data.briefs.trial === 3, r.error?.message ?? JSON.stringify(r.data))
    r = await me.rpc('begin_read')
    check('begin_read allows a read', !r.error && r.data?.[0]?.allowed === true, r.error?.message)
    r = await me.rpc('charge_reads', { n: 2 })
    check('charge_reads(2) leaves 18', !r.error && r.data?.cards.left === 18, r.error?.message)
    r = await me.rpc('charge_brief')
    check('a brief uses a trial brief', !r.error && r.data?.briefs.trial === 2, r.error?.message)
    r = await me.rpc('grant_pack', { p_user: id, p_kind: 'cards', p_qty: 1000 })
    check('an account cannot grant itself cards', !!r.error)
    const { data: rows } = await me.from('credits').select('*')
    check('the account can read its own credits row', Array.isArray(rows) && rows.length === 1)
    const upd = await me.from('credits').update({ pack_cards: 9999 }).eq('owner_id', id).select()
    check('nor change it directly', !!upd.error || (upd.data ?? []).length === 0)
    r = await admin.rpc('grant_pack', { p_user: id, p_kind: 'cards', p_qty: 50 })
    check('the service role can grant a pack', !r.error && r.data?.cards.pack === 50, r.error?.message)
    r = await admin.rpc('grant_plan', { p_user: id, p_tier: 'pro', p_months: 1 })
    check('the service role can grant Pro', !r.error && r.data?.tier === 'pro' && r.data.briefs.month.allowance === 20, r.error?.message)
    r = await createClient(URL, PUBLISHABLE).rpc('my_balance')
    check('signed out, there is no balance', !!r.error)
  } finally {
    await admin.auth.admin.deleteUser(id).catch(() => {})
  }
  console.log(`\n${passed} passed, ${failed} failed.`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
