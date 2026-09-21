// Run: node --test test/mycards.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CARDS, MAX_LIST, cardsFromEntries, cardsToEntries, emptyCard, initials, planCardRestore, sanitizeCard } from '../src/lib/mycards.ts'

test('a new card is blank, on the given accent, with the default template and font', () => {
  const c = emptyCard('navy', 5)
  assert.equal(c.name, ''); assert.equal(c.accent, 'navy'); assert.equal(c.template, 'ledger'); assert.equal(c.font, 'archivo')
  assert.equal(c.createdAt, 5); assert.equal(emptyCard().accent, 'graphite')
})
test('sanitizing trims, drops blanks, caps lists and repairs unknown choices', () => {
  const c = sanitizeCard({ ...emptyCard(), name: '  Asha  ', phones: [' 1 ', '', '2', '3', '4'], emails: ['a@b.co'], template: 'zzz', font: 'papyrus', accent: 'nope' })
  assert.equal(c.name, 'Asha'); assert.deepEqual(c.phones, ['1', '2', '3']); assert.equal(c.phones.length, MAX_LIST)
  assert.equal(c.template, 'ledger'); assert.equal(c.font, 'archivo'); assert.equal(c.accent, 'graphite')
})
test('initials are up to two letters, and a question mark for nothing', () => {
  assert.equal(initials('Rajesh Shah'), 'RS'); assert.equal(initials('  madonna '), 'M'); assert.equal(initials(''), '?')
  assert.equal(initials('प्रसेनजीत शर्मा'), 'पश')
})
test('cards round-trip through backup entries with their photos', () => {
  const photo = new Blob([new Uint8Array(40)], { type: 'image/jpeg' })
  const cards = [{ ...emptyCard(), id: 'a', name: 'A', photo }, { ...emptyCard(), id: 'b', name: 'B' }]
  const { json, files } = cardsToEntries(cards)
  assert.equal(files.length, 1); assert.match(files[0].name, /^mycards\/a-photo\.jpg$/)
  const back = cardsFromEntries(json, (n) => files.find((f) => f.name === n)?.blob)
  assert.equal(back.length, 2); assert.equal(back[0].photo.size, 40); assert.equal(back[1].photo, undefined)
  assert.equal(JSON.stringify(json).includes('photo"'), false)
})
test('restoring never duplicates an id already on the phone', () => {
  const plan = planCardRestore(['a'], [{ ...emptyCard(), id: 'a' }, { ...emptyCard(), id: 'b' }])
  assert.deepEqual(plan.add.map((c) => c.id), ['b']); assert.equal(plan.skipped, 1)
})
test('the limit is five', () => assert.equal(MAX_CARDS, 5))
