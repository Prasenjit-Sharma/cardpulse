// Run: node --test test/cardqr.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cardQr } from '../src/lib/cardqr.ts'
import { emptyCard } from '../src/lib/mycards.ts'

const card = (o = {}) => ({ ...emptyCard(), name: 'Rajesh Shah', company: 'ABC', phones: ['+91 98240 22893'], emails: ['r@abc.com'], ...o })

test('an ordinary card gives a QR and reports nothing dropped', () => {
  const r = cardQr(card()); assert.ok(r.matrix.length >= 21); assert.deepEqual(r.dropped, [])
})
test('a card with huge fields still gives a QR instead of throwing, carrying at least the name and a way to reach them', () => {
  const huge = 'ब'.repeat(3000)
  const r = cardQr(card({ name: huge, company: huge, title: huge, website: huge, address: huge }))
  assert.ok(r.matrix.length >= 21); assert.equal(r.trimmed, true)
})
test('an empty card still gives a QR', () => assert.ok(cardQr(emptyCard()).matrix.length >= 21))
