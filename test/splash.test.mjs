// Run: node --test test/splash.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { hideSplash, setNative } from '../src/lib/platform.ts'

test('outside the app there is no splash to hide, and asking is harmless', () => {
  assert.doesNotThrow(() => hideSplash())
})
test('in the app the splash is let go once, however many places ask, and a failure is swallowed', async () => {
  let n = 0
  setNative({ hideSplash: async () => { n++; throw new Error('already gone') } })
  hideSplash(); hideSplash(); hideSplash()
  await new Promise((r) => setTimeout(r, 0))
  assert.equal(n, 1)
})
