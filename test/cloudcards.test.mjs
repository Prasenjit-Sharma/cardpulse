// Run: node --test test/cloudcards.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { SLUG_LENGTH, buildCardPayload, generateSlug } from '../src/lib/cloudcards.ts'
import { emptyCard } from '../src/lib/mycards.ts'

test('a slug is 8 characters from the unambiguous alphabet', () => {
  const s = generateSlug()
  assert.equal(s.length, SLUG_LENGTH)
  assert.match(s, /^[0-9A-HJ-KM-NP-TV-Z]+$/)                     // excludes 0/O, 1/I/L, U confusion pairs
})
test('1000 slugs are practically all distinct', () => {
  const seen = new Set(Array.from({ length: 1000 }, generateSlug))
  assert.ok(seen.size >= 998, `${1000 - seen.size} collisions in 1000 (expected ~0)`)
})
test('the payload carries the card fields but never the photo, and is sanitized first', () => {
  const p = buildCardPayload({ ...emptyCard(), id: 'local-1', name: '  Asha  ', photo: new Blob(['x']), phones: [' 1 ', ''] })
  assert.equal(p.local_card_id, 'local-1'); assert.equal(p.name, 'Asha'); assert.deepEqual(p.phones, ['1'])
  assert.equal('photo' in p, false)
})
