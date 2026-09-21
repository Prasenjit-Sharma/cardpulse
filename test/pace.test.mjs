// Run: node --test test/pace.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextGap, smooth } from '../src/lib/pace.ts'

test('a fast phone keeps its full rate', () => { assert.equal(nextGap(6, 40), 40) })
test('a slow phone waits about twice the cost, up to a ceiling', () => {
  assert.equal(nextGap(60, 40), 120); assert.equal(nextGap(500, 40), 260)
})
test('one slow frame barely moves the smoothed cost; a lasting change does', () => {
  assert.equal(smooth(null, 30), 30)
  assert.ok(smooth(10, 100) < 40)
  let c = 10; for (let i = 0; i < 12; i++) c = smooth(c, 100)
  assert.ok(c > 90)
})
