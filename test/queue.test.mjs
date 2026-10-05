// Run: node --test test/queue.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { claim, readable } from '../src/lib/queue.ts'

test('claim: ids are taken at once, so two overlapping calls never queue the same card twice', () => {
  const inFlight = new Set(['busy'])
  assert.deepEqual(claim(inFlight, ['a', 'b', 'busy']), ['a', 'b'])
  assert.deepEqual(claim(inFlight, ['a', 'b', 'c']), ['c'], 'the second call, before the first has awaited anything, gets only what is new')
  assert.deepEqual([...inFlight].sort(), ['a', 'b', 'busy', 'c'])
})

test('readable: a card already read is never read (and charged) again by a stale retry', () => {
  assert.equal(readable({ status: 'pending' }), true)
  assert.equal(readable({ status: 'running' }), true)
  assert.equal(readable({ status: 'error' }), true, 'Try again on a failed card')
  assert.equal(readable({ status: 'done' }), false)
})
