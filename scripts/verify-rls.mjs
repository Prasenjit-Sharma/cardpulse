// Run: SUPABASE_SECRET_KEY=<secret key> node scripts/verify-rls.mjs
// Checks the live project's RLS and RPC boundaries. Creates and deletes two throwaway test users and one test card.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://xqwslvteyhfmnxcnlpsg.supabase.co'
const PUBLISHABLE = 'sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf'
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!SECRET) { console.error('Set SUPABASE_SECRET_KEY in the environment before running this.'); process.exit(1) }

const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = () => createClient(URL, PUBLISHABLE, { auth: { autoRefreshToken: false, persistSession: false } })

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok  ${name}`) }
  else { failed++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function makeUser(tag) {
  const email = `cardpulse-verify-${tag}-${Date.now()}@example.com`
  const password = `Verify-${Math.random().toString(36).slice(2)}-1A`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = anon()
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client, session: signIn.session }
}

async function main() {
  console.log('Creating two test users…')
  const a = await makeUser('a')
  const b = await makeUser('b')

  console.log('User A publishes a card…')
  const { data: card, error: cardErr } = await a.client.from('cards')
    .insert({ owner_id: a.id, local_card_id: 'verify-1', name: 'Verify Test', slug: `vfy${Math.random().toString(36).slice(2, 7)}` })
    .select('id, slug').single()
  check('user A can insert their own card', !cardErr && !!card, cardErr?.message)

  console.log('Public read path…')
  const anonClient = anon()
  const { data: pub } = await anonClient.rpc('get_public_card', { p_slug: card.slug })
  check('anon can fetch the published card by its real slug', pub?.[0]?.name === 'Verify Test')
  const { data: missing } = await anonClient.rpc('get_public_card', { p_slug: 'doesnotexist' })
  check('anon gets nothing (an empty set) for a made-up slug', Array.isArray(missing) && missing.length === 0)
  const { data: listAll } = await anonClient.from('cards').select('*')
  check('anon cannot list the cards table directly', !listAll || listAll.length === 0)

  console.log('Public write path (submitting a lead)…')
  const { data: leadId, error: leadErr } = await anonClient.rpc('submit_lead', {
    p_card_id: card.id, p_event_id: null, p_event_name: null, p_name: 'Visitor One', p_phone: '9990001111', p_email: null, p_company: null,
  })
  check('anon can submit a lead for a real card', !leadErr && !!leadId, leadErr?.message)
  const { data: leadsAsAnon } = await anonClient.from('leads').select('*')
  check('anon cannot read leads directly', !leadsAsAnon || leadsAsAnon.length === 0)

  console.log('The public RPCs also work for a signed-in but unrelated user (someone else\'s stall QR, while logged in)…')
  const { data: pubAsB } = await b.client.rpc('get_public_card', { p_slug: card.slug })
  check('a signed-in unrelated user can still fetch the card by its slug', pubAsB?.[0]?.name === 'Verify Test')
  const { data: leadIdAsB, error: leadAsBErr } = await b.client.rpc('submit_lead', {
    p_card_id: card.id, p_event_id: null, p_event_name: null, p_name: 'Visitor Two', p_phone: null, p_email: null, p_company: null,
  })
  check('a signed-in unrelated user can submit a lead too', !leadAsBErr && !!leadIdAsB, leadAsBErr?.message)
  const { data: leadAsBRow } = await admin.from('leads').select('owner_id').eq('id', leadIdAsB).single()
  check('...and that lead is still attributed to the card\'s real owner (A), not the submitter (B)', leadAsBRow?.owner_id === a.id)

  console.log('Owner isolation…')
  const { data: ownLeads } = await a.client.from('leads').select('*').eq('card_id', card.id)
  check('user A can read the lead on their own card', ownLeads?.some((l) => l.id === leadId) && ownLeads[0].owner_id === a.id)
  const { data: otherLeads } = await b.client.from('leads').select('*').eq('card_id', card.id)
  check('user B cannot read user A\'s leads', !otherLeads || otherLeads.length === 0)
  const { data: otherCard } = await b.client.from('cards').select('*').eq('id', card.id)
  check('user B cannot read user A\'s card row directly', !otherCard || otherCard.length === 0)

  console.log('Cleaning up…')
  await admin.from('leads').delete().eq('id', leadIdAsB)
  await a.client.from('cards').delete().eq('id', card.id)
  await admin.auth.admin.deleteUser(a.id)
  await admin.auth.admin.deleteUser(b.id)

  console.log(`\n${passed} passed, ${failed} failed.`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
