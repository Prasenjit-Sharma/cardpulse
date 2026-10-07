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
