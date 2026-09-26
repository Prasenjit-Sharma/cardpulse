// Run: node --test test/cloudcards.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { SLUG_LENGTH, buildCardPayload, conflictKind, generateSlug, publicCardUrlFrom } from '../src/lib/cloudcards.ts'
import { publicBaseFor } from '../src/lib/platform.ts'
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
test('a 23505 violation is classified by which unique constraint actually fired, not assumed to always be the slug', () => {
  assert.equal(conflictKind({ code: '23505', message: 'duplicate key value violates unique constraint "cards_slug_key"' }), 'slug')
  assert.equal(conflictKind({ code: '23505', message: 'duplicate key value violates unique constraint "cards_owner_id_local_card_id_key"' }), 'owner-local')
  assert.equal(conflictKind({ code: '23503', message: 'insert or update on table violates foreign key constraint' }), 'other')
  assert.equal(conflictKind(null), 'other')
  assert.equal(conflictKind(undefined), 'other')
})

test('a card link built in the app points at the public site, never at localhost', () => {
  const base = publicBaseFor(true, { origin: 'https://localhost', pathname: '/' }, 'https://prasenjit-sharma.github.io/cardpulse/')
  const u = new URL(publicCardUrlFrom(base, 'arham-t', 'e1', 'Plast India'))
  assert.equal(u.origin + u.pathname, 'https://prasenjit-sharma.github.io/cardpulse/')
  assert.equal(u.searchParams.get('card'), 'arham-t')
  assert.equal(u.searchParams.get('event'), 'e1')
})
