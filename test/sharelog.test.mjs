// Run: node --test test/sharelog.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_ENTRIES, noteShare, readShareLog, tallyShares } from '../src/lib/sharelog.ts'

const memory = () => { const m = new Map(); return { getItem: (k) => m.get(k) ?? null, setItem: (k, v) => m.set(k, v) } }

test('shares are logged newest first and counted per card', () => {
  const s = memory()
  noteShare('a', 'qr', 1, s); noteShare('a', 'file', 2, s); noteShare('b', 'picture', 3, s); noteShare('a', 'exchange', 4, s); noteShare('a', 'text', 5, s)
  const log = readShareLog(s)
  assert.deepEqual(log.map((e) => e.at), [5, 4, 3, 2, 1])
  assert.deepEqual(tallyShares(log, 'a'), { shared: 2, qr: 1, exchanged: 1 })
  assert.deepEqual(tallyShares(log, 'b'), { shared: 1, qr: 0, exchanged: 0 })
})

test('the log stays bounded', () => {
  const s = memory()
  for (let i = 0; i < MAX_ENTRIES + 5; i++) noteShare('a', 'qr', i, s)
  assert.equal(readShareLog(s).length, MAX_ENTRIES)
})

test('a broken or missing log reads as empty', () => {
  const s = memory(); s.setItem('cardpulse.shareLog', '{oops')
  assert.deepEqual(readShareLog(s), [])
  assert.deepEqual(readShareLog(undefined), [])
})
