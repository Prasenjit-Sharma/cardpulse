// Run: node --test test/token.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { makeTokenSource } from '../src/lib/token.ts'
import { newRequestId, requestIdFor } from '../src/lib/requestid.ts'

const s = (t) => ({ access_token: t })
const never = () => new Promise(() => {})

test('a fresh token in time is used and remembered', async () => {
  const t = makeTokenSource(async () => s('a'), async () => s('b'), 50)
  assert.equal(await t.get(), 'a'); assert.equal(t.signedIn(), true)
  assert.equal(await t.renew(), 'b')
})

test('weak signal: a renewal that hangs or fails falls back to the last good token, never to signed out', async () => {
  let mode = 'ok'
  const t = makeTokenSource(async () => { if (mode === 'hang') return never(); if (mode === 'fail') throw new Error('net'); if (mode === 'none') return null; return s('good') }, never, 30)
  assert.equal(await t.get(), 'good')
  mode = 'hang'; assert.equal(await t.get(), 'good')
  mode = 'fail'; assert.equal(await t.get(), 'good')
  mode = 'none'; assert.equal(await t.get(), 'good', 'a renewal that came back empty on a bad network keeps the sign-in')
  assert.equal(await t.renew(), 'good'); assert.equal(t.signedIn(), true)
})

test('only a real sign-out forgets the token', async () => {
  const t = makeTokenSource(async () => null, async () => null, 30)
  t.note(s('x')); assert.equal(await t.get(), 'x')
  t.note(null); assert.equal(await t.get(), undefined); assert.equal(t.signedIn(), false)
})

test('a read has the same request id on every retry, whatever the order of its cards; a brief gets a new one per tap', async () => {
  const a = await requestIdFor(['c2', 'c1']), b = await requestIdFor(['c1', 'c2'])
  assert.equal(a, b); assert.match(a, /^read:[0-9a-f]{32}$/)
  assert.notEqual(a, await requestIdFor(['c1']))
  const r1 = newRequestId(), r2 = newRequestId()
  assert.notEqual(r1, r2); assert.match(r1, /^brief:[A-Za-z0-9_:-]{8,100}$/)
})
