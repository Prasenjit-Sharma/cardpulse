// Run: npm run read:fetch [-- --email you@example.com]   (asks for the Supabase secret key, typed hidden, unless saved)
// Downloads synced, read cards (photos from the private sync-photos bucket, and the contacts as the reader returned them and
// as the user corrected them) into .lab/cards/, for read-lab to test other models against. .lab/ is git-ignored: these are
// real people's cards and stay on this Mac. QR contacts, thumbnail-only photos and cards with no photo are skipped.
import { createClient } from '@supabase/supabase-js'
import { mkdirSync, writeFileSync, existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { secretKey } from './secret.mjs'

const URL = 'https://xqwslvteyhfmnxcnlpsg.supabase.co'
const OUT = fileURLToPath(new globalThis.URL('../.lab/cards/', import.meta.url))
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }

const admin = createClient(URL, await secretKey(), { auth: { autoRefreshToken: false, persistSession: false } })

// one account only, when asked (the developer's own); otherwise every account that synced
let owner
const email = arg('--email')
if (email) {
  for (let page = 1; !owner; page++) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 })
    if (error) { console.error(error.message); process.exit(1) }
    owner = data.users.find((u) => u.email?.toLowerCase() === email.toLowerCase())?.id
    if (data.users.length < 200) break
  }
  if (!owner) { console.error(`No account for ${email}.`); process.exit(1) }
}

const rows = []
for (let from = 0; ; from += 1000) {
  let q = admin.from('sync_items').select('owner_id, item_id, data').eq('kind', 'card').eq('deleted', false).range(from, from + 999)
  if (owner) q = q.eq('owner_id', owner)
  const { data, error } = await q
  if (error) { console.error(error.message); process.exit(1) }
  rows.push(...data)
  if (data.length < 1000) break
}

let kept = 0, skipped = 0
for (const { owner_id, item_id, data: c } of rows) {
  const ok = c && c.status === 'done' && c.source !== 'qr' && !c.thumbOnly && c.photos?.image && c.corrected?.length && c.extracted
  if (!ok) { skipped++; continue }
  const dir = `${OUT}${item_id}/`
  if (existsSync(`${dir}card.json`)) { kept++; continue }          // fetched before
  const photo = async (slot) => {
    const { data, error } = await admin.storage.from('sync-photos').download(`${owner_id}/card-${item_id}-${slot}.jpg`)
    return error ? null : Buffer.from(await data.arrayBuffer())
  }
  const front = await photo('image')
  if (!front) { skipped++; continue }
  const back = c.photos.back ? await photo('back') : null
  mkdirSync(dir, { recursive: true })
  writeFileSync(`${dir}front.jpg`, front)
  if (back) writeFileSync(`${dir}back.jpg`, back)
  writeFileSync(`${dir}card.json`, JSON.stringify({
    id: item_id, model: c.model ?? '', batchSize: c.batchSize ?? 1, languages: c.languages ?? [],
    // opened: the user looked at this card, so `corrected` is checked truth; unopened cards still carry the reader's answer
    opened: !!c.opened, reviewed: !!c.reviewed, extracted: c.extracted, corrected: c.corrected,
  }, null, 2))
  kept++
}
console.log(`${kept} cards in .lab/cards/ (${rows.length} synced, ${skipped} skipped: QR, thumbnail only, no photo or not read).`)
console.log('Next: npm run read:lab')
