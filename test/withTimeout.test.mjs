// Run: node --test test/withTimeout.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { withTimeout } from '../src/lib/withTimeout.ts'

test('resolves with the value when it arrives before the timeout', async () => {
  const r = await withTimeout(Promise.resolve('x'), 50, 'fallback')
  assert.equal(r, 'x')
})
test('resolves with the fallback when the promise takes too long, and never rejects', async () => {
  const slow = new Promise((resolve) => setTimeout(() => resolve('late'), 200))
  const r = await withTimeout(slow, 20, 'fallback')
  assert.equal(r, 'fallback')
})
test('a rejected promise resolves with the fallback instead of throwing', async () => {
  const r = await withTimeout(Promise.reject(new Error('boom')), 50, 'fallback')
  assert.equal(r, 'fallback')
})
