// Run: node --test test/stallcaption.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { defaultCaption } from '../src/lib/stallcaption.ts'

test('the default caption matches what the mode actually does', () => {
  assert.equal(defaultCaption('share'), 'Scan to save my contact')
  assert.equal(defaultCaption('leads'), 'Scan to view my card and share yours')
})
