// Run: node --test test/store.test.mjs
// The Google Play listing: within Play's limits, no banned title words, the search phrases present, no claims we cannot back.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const L = JSON.parse(readFileSync('store/listing.json', 'utf8')).play
const count = (text, phrase) => text.toLowerCase().split(phrase.toLowerCase()).length - 1

test('every field fits Play', () => {
  assert.equal(L.title, 'Pulse - Business Card Reader')
  assert.ok(L.title.length <= 30)
  assert.equal(L.shortDescription, 'Scan business & visiting cards to contacts. Many cards in one photo. Expo-ready.')
  assert.ok(L.shortDescription.length <= 80)
  assert.ok(L.fullDescription.length <= 4000 && L.fullDescription.length >= 1800, String(L.fullDescription.length))
})
test('the title keeps to Play policy', () => {
  assert.ok(!/best|#1|free|top|new/i.test(L.title))
  assert.ok(!/\p{Extended_Pictographic}/u.test(L.title + L.shortDescription))
  assert.ok(!/\b[A-Z]{4,}\b/.test(L.title))
})
test('the description carries the search phrases, naturally', () => {
  for (const p of ['business card', 'visiting card', 'card reader', 'card scanner', 'exhibition', 'expo']) assert.ok(count(L.fullDescription, p) >= 2, p)
  assert.ok(/exhibition mode/i.test(L.fullDescription))
  assert.ok(/digital (business )?card/i.test(L.fullDescription))
})
test('no claims we cannot back', () => {
  const all = Object.values(L).join(' ')
  assert.ok(!/\b(best|#1|number one|million|award|rated|trusted by|\d[\d,]*\+? (users|downloads|installs))\b/i.test(all))
})

test('the Data safety draft exists, is marked a draft, and covers what Play asks', () => {
  assert.ok(existsSync('store/data-safety.md'))
  const d = readFileSync('store/data-safety.md', 'utf8')
  assert.match(d, /draft/i)
  for (const h of ['Data collected', 'Data shared', 'Security practices', 'Deletion']) assert.ok(d.includes(h), h)
  for (const k of ['Name', 'Email address', 'Photos', 'Contacts', 'App interactions']) assert.ok(d.includes(k), k)
  assert.match(d, /privacy\.html/)
})

const head = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] } }
const SLIDES = ['01-leads', '02-scan', '03-one-photo', '04-digital-card', '05-read-right', '06-brief', '07-one-tap', '08-more']
test('eight Play screenshots at 1080x1920, no alpha', () => {
  for (const s of SLIDES) assert.deepEqual(head(`store/play/phone/${s}.png`), { w: 1080, h: 1920, type: 2 }, s)
})
test('the feature graphic at 1024x500, no alpha', () => {
  assert.deepEqual(head('store/play/feature-graphic.png'), { w: 1024, h: 500, type: 2 })
})
test('no purchase is advertised before Play Billing ships (the app cannot sell anything yet)', () => {
  assert.ok(!/paid plans?|card packs?|exhibition pass|subscription/i.test(L.fullDescription))
  assert.match(L.fullDescription, /20 cards a month free/)
})
test('Data safety covers every path data leaves the phone, and the Gemini tier it depends on', () => {
  const d = readFileSync('store/data-safety.md', 'utf8')
  for (const k of ['User IDs', 'Pulse Brief', 'paid tier', 'delete-account.html']) assert.ok(d.includes(k), k)
})
test('a public page explains how to delete the account, as Play requires', () => {
  const p = readFileSync('public/delete-account.html', 'utf8')
  assert.match(p, /Delete account/)
  assert.match(p, /Delete cloud data/)
  assert.match(p, /privacy\.html/)
})
test('slides show only what the screens show', () => {
  const all = SLIDES.map((s) => readFileSync(`store/slides/${s}.html`, 'utf8')).join('\n')
  assert.ok(!/XLS|left her details|Follow-ups due today/.test(all))
  // the visitor's page says "Thanks — they'll be in touch." and "More from …"; the stall gets contacts and a toast
  assert.ok(!/Thanks for visiting|tap to open|Your stall · live/.test(all))
  assert.match(readFileSync('store/slides/01-leads.html', 'utf8'), /they'll be in touch/)
  assert.ok(!/Kenya|doubled/.test(readFileSync('store/capture/seed.ts', 'utf8')))
})
