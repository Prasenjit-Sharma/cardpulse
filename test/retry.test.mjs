// Run: node --test test/retry.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRetry, MAX_ATTEMPTS, RETRY_DELAY_MS } from '../src/lib/retry.ts'

test('a brake wait uses the server\'s delay and does not count as one of the card\'s attempts', () => {
  assert.deepEqual(nextRetry({ message: '', transient: true, retryAfterMs: 540_000 }, true), { delayMs: 540_000, countsAsAttempt: false })
})
test('other transient failures retry after 30 s and count while online', () => {
  assert.deepEqual(nextRetry({ message: '', transient: true }, true), { delayMs: RETRY_DELAY_MS, countsAsAttempt: true })
  assert.deepEqual(nextRetry({ message: '', transient: true }, false), { delayMs: RETRY_DELAY_MS, countsAsAttempt: false })
  assert.equal(MAX_ATTEMPTS, 3)
})
