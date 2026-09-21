// Run: node --test test/search.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { hasAllTags, matchesQuery, searchTokens } from '../src/lib/search.ts'

const p = (o) => ({ name: '', title: '', company: '', phones: [], emails: [], website: '', address: '', gstin: '', social: [], ...o })
const rajesh = p({ name: 'Rajesh Shah', company: 'ABC Polymers Pvt. Ltd.', address: 'GIDC Vatva, Surat 395002', phones: ['+91 98240 22893'], emails: ['rajesh@abcpolymers.com'], note: 'Authorised dealer for HDPE and LDPE', tags: ['Polymers', 'Customer'] })
const m = (q, c = rajesh, ev = '') => matchesQuery(c, searchTokens(q), ev)

test('words match in any order and across different fields', () => {
  assert.ok(m('surat polymers'))
  assert.ok(m('polymers surat'))
  assert.ok(!m('surat steel'))
})
test('finds address, notes, website, gstin, event name and tags, not just the name', () => {
  assert.ok(m('vatva'))
  assert.ok(m('hdpe'))
  assert.ok(m('395002'))
  assert.ok(m('abcpolymers.com'))
  assert.ok(m('customer'))
  assert.ok(m('gandhinagar expo', p({ name: 'X' }), 'Gandhinagar Expo 2026'))
  assert.ok(m('24aabca1234f1z5', p({ gstin: '24AABCA1234F1Z5' })))
})
test('case, accents and stray punctuation do not matter', () => {
  assert.ok(m('SURAT, Polymers'))
  assert.ok(m('zurich', p({ address: 'Zürich' })))
})
test('phone numbers match by digits however they are spaced', () => {
  assert.ok(m('9824022893'))
  assert.ok(m('98240 22893'))
  assert.ok(!m('98240 22894'))
})
test('an empty query matches everyone', () => {
  assert.ok(m(''))
  assert.ok(m('   '))
})
test('every chosen tag must be present', () => {
  assert.ok(hasAllTags(rajesh, []))
  assert.ok(hasAllTags(rajesh, ['Polymers']))
  assert.ok(hasAllTags(rajesh, ['Polymers', 'Customer']))
  assert.ok(!hasAllTags(rajesh, ['Polymers', 'Supplier']))
  assert.ok(!hasAllTags(p({}), ['Polymers']))
})

test('search also finds what was said in a logged call or meeting', () => {
  const c = p({ name: 'Asha', log: [{ id: '1', at: 1, kind: 'call', note: 'Wants a quote for HDPE granules', next: '2026-10-09' }] })
  assert.ok(m('quote hdpe', c)); assert.ok(!m('polyester', c))
})
