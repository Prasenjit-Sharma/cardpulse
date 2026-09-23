// Run: node --test test/errors.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { classifyFailure } from '../src/lib/errors.ts'

const err = (message, status) => Object.assign(new Error(message), { status })

test('busy, server trouble, slow reads and no connection are retried by themselves', () => {
  for (const e of [err('x', 429), err('x', 502), err('x', 503), err('The reading is taking too long. Try again.'), err('Network error. Are you online?'), new TypeError('Failed to fetch')]) {
    assert.equal(classifyFailure(e).transient, true, e.message)
  }
})
test('a photo the reader refused is not retried, and says what to do', () => {
  const f = classifyFailure(err('Blocked: SAFETY'))
  assert.equal(f.transient, false); assert.match(f.message, /taking it again/i)
})
test('anything unknown is a plain, actionable message and never leaks internals', () => {
  const f = classifyFailure(err('TypeError: cannot read properties of undefined'))
  assert.equal(f.transient, false); assert.ok(!/undefined|TypeError/.test(f.message))
})
test('the daily scan limit is shown as the server says it and never retried by itself', () => {
  const f = classifyFailure(err("You have reached today's limit of 300 scans. It resets at midnight UTC.", 429))
  assert.equal(f.transient, false); assert.match(f.message, /today's limit of 300 scans/)
})
