// Run: SUPABASE_SECRET_KEY=<secret key> node scripts/verify-sync.mjs
// Checks migration 0002 on the live project: sync isolation and newer-wins, private sync photos, the scan quota,
// view/lead counts, lead deletion, and deleting cloud data and the account. Creates and deletes two throwaway users.
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
  const { error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client }
}

async function main() {
  console.log('Creating two test users…')
  const a = await makeUser('a')
  const b = await makeUser('b')
  try {
    console.log('Sync items…')
    const push = (u, items) => u.client.rpc('sync_push', { p_items: items })
    let r = await push(a, [{ kind: 'card', id: 'v1', data: { n: 1 }, updatedAt: 100 }])
    check('A can push an item', !r.error && r.data === 1, r.error?.message)
    r = await push(a, [{ kind: 'card', id: 'v1', data: { n: 0 }, updatedAt: 50 }])
    check('an older change does not overwrite a newer one', !r.error && r.data === 0, r.error?.message)
    const { data: mine } = await a.client.from('sync_items').select('data').eq('item_id', 'v1')
    check('A reads back the newer copy', mine?.[0]?.data?.n === 1)
    const { data: theirs } = await b.client.from('sync_items').select('*')
    check('B cannot see A\'s items', Array.isArray(theirs) && theirs.length === 0)
    const { data: anonItems } = await anon().from('sync_items').select('*')
    check('anon cannot see any items', !anonItems || anonItems.length === 0)
    const forged = await b.client.from('sync_items').insert({ owner_id: a.id, kind: 'card', item_id: 'forged', client_updated_at: 1 })
    check('B cannot write into A\'s items', !!forged.error)

    console.log('Private sync photos…')
    const path = `${a.id}/card-v1-image.jpg`
    const up = await a.client.storage.from('sync-photos').upload(path, new Blob(['x'], { type: 'image/jpeg' }), { upsert: true, contentType: 'image/jpeg' })
    check('A can upload into their own folder', !up.error, up.error?.message)
    const bUp = await b.client.storage.from('sync-photos').upload(path, new Blob(['y'], { type: 'image/jpeg' }), { upsert: true })
    check('B cannot upload into A\'s folder', !!bUp.error)
    const bDown = await b.client.storage.from('sync-photos').download(path)
    check('B cannot download A\'s photo', !!bDown.error)
    const anonDown = await anon().storage.from('sync-photos').download(path)
    check('anon cannot download it either', !!anonDown.error)

    console.log('Scan quota…')
    const q = await a.client.rpc('consume_scan')
    check('a signed-in user can count a read', !q.error && q.data?.[0]?.allowed === true && q.data[0].used === 1, q.error?.message)
    const qa = await anon().rpc('consume_scan')
    check('anon cannot call the quota', !!qa.error)

    console.log('Counts and leads…')
    const slug = `vfy${Math.random().toString(36).slice(2, 7)}`
    const { data: card } = await a.client.from('cards').insert({ owner_id: a.id, local_card_id: 'verify-sync', name: 'Verify', slug }).select('id').single()
    await anon().rpc('record_card_view', { p_slug: slug })
    const lead = await anon().rpc('submit_lead', { p_card_id: card.id, p_event_id: null, p_event_name: null, p_name: 'Visitor', p_phone: '999', p_email: null, p_company: null })
    const { data: counted } = await a.client.from('cards').select('view_count, lead_count').eq('id', card.id).single()
    check('a view and a lead are counted', counted?.view_count === 1 && counted?.lead_count === 1, JSON.stringify(counted))
    const { data: pub } = await anon().rpc('get_public_card', { p_slug: slug })
    check('counts are not on the public card', pub?.[0] && !('view_count' in pub[0]))
    const bDel = await b.client.from('leads').delete().eq('id', lead.data).select('id')
    check('B cannot delete A\'s lead', !bDel.data?.length)
    const aDel = await a.client.from('leads').delete().eq('id', lead.data).select('id')
    check('A can delete their own lead once received', aDel.data?.length === 1, aDel.error?.message)

    console.log('Deleting…')
    await a.client.from('consents').insert({ purpose: 'sync', policy_version: 'verify' })
    await a.client.storage.from('sync-photos').remove([path])
    const del = await a.client.rpc('delete_my_cloud_data')
    const { count: left } = await admin.from('sync_items').select('*', { count: 'exact', head: true }).eq('owner_id', a.id)
    const { count: cardsLeft } = await admin.from('cards').select('*', { count: 'exact', head: true }).eq('owner_id', a.id)
    check('delete_my_cloud_data empties A\'s items and cards', !del.error && left === 0 && cardsLeft === 0, del.error?.message)
    const acct = await a.client.rpc('delete_my_account')
    const { data: gone } = await admin.auth.admin.getUserById(a.id)
    check('delete_my_account removes the account', !acct.error && !gone?.user, acct.error?.message)
    const anonAcct = await anon().rpc('delete_my_account')
    check('anon cannot call delete_my_account', !!anonAcct.error)
  } finally {
    console.log('Cleaning up…')
    await admin.auth.admin.deleteUser(a.id).catch(() => {})
    await admin.auth.admin.deleteUser(b.id).catch(() => {})
  }
  console.log(`\n${passed} passed, ${failed} failed.`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
