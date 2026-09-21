// Run: node --test test/cardshare.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cardAsText, cardFileName } from '../src/lib/cardshare.ts'
import { emptyCard } from '../src/lib/mycards.ts'
const c = (o = {}) => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'GM', company: 'ABC', phones: ['+91 98240 22893'], emails: ['r@abc.com'], website: 'abc.com', address: 'Vatva, Ahmedabad', ...o })
test('file names are safe and readable', () => {
  assert.equal(cardFileName(c(), 'vcf'), 'Rajesh-Shah-card.vcf')
  assert.equal(cardFileName(c({ name: 'A/B: C?' }), 'png'), 'A-B-C-card.png')
  assert.equal(cardFileName(c({ name: '' }), 'png'), 'my-card.png')
  assert.equal(cardFileName(c({ name: 'प्रसेनजीत शर्मा' }), 'vcf'), 'प्रसेनजीत-शर्मा-card.vcf')
})
test('copied text lists what is on the card, one item a line, skipping empties', () => {
  assert.equal(cardAsText(c()), ['Rajesh Shah', 'GM', 'ABC', '+91 98240 22893', 'r@abc.com', 'abc.com', 'Vatva, Ahmedabad'].join('\n'))
  assert.equal(cardAsText(c({ title: '', website: '' })).includes('\n\n'), false)
})
