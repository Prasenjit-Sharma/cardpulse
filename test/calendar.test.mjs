// Run: node --test test/calendar.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { monthGrid, shiftMonth } from '../src/lib/calendar.ts'

test('a month grid is six Monday-first weeks covering the whole month', () => {
  const g = monthGrid(2026, 8)                               // September 2026 starts on a Tuesday
  assert.equal(g.length, 42)
  assert.equal(g[0].iso, '2026-08-31'); assert.equal(g[0].inMonth, false)
  assert.equal(g[1].iso, '2026-09-01'); assert.equal(g[1].inMonth, true)
  assert.equal(g.filter((d) => d.inMonth).length, 30)
})
test('a month that starts on Monday has no leading days', () => {
  const g = monthGrid(2026, 5)                               // June 2026 starts on a Monday
  assert.equal(g[0].iso, '2026-06-01')
})
test('shifting months crosses year boundaries', () => {
  assert.deepEqual(shiftMonth(2026, 11, 1), [2027, 0])
  assert.deepEqual(shiftMonth(2026, 0, -1), [2025, 11])
})
