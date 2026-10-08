// Run: node --test test/autodetect.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { autoDetectOn } from '../src/lib/autodetect.ts'

test('auto-detect is off unless the user switched it on (it misses cards for now)', () => {
  assert.equal(autoDetectOn(null), false)
  assert.equal(autoDetectOn('0'), false)
  assert.equal(autoDetectOn('1'), true)
})
