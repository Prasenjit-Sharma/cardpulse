// Run: node --test test/watch.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { dueFigure, isToday, phase, rowFigure, shortDate } from '../src/lib/watch.ts'

const person = (extra = {}) => ({ name: 'Asha Rao', title: '', company: '', phones: [], emails: [], website: '', address: '', social: [], ...extra })

test('a contact is New, then Contacted once something is logged, and Follow-up while a date is set', () => {
  assert.equal(phase(person()), 'New')
  assert.equal(phase(person({ log: [{ id: '1', at: 0, kind: 'call', note: '' }] })), 'Contacted')
  assert.equal(phase(person({ followUp: '2026-09-30', log: [{ id: '1', at: 0, kind: 'call', note: '' }] })), 'Follow-up')
})

test('a late or due follow-up is red; an upcoming one is plain; none gives no figure', () => {
  assert.deepEqual(dueFigure('2026-09-21', '2026-09-24'), { text: '3d late', sub: 'Follow-up', tone: 'due' })
  assert.deepEqual(dueFigure('2026-09-24', '2026-09-24'), { text: 'Today', sub: 'Follow-up', tone: 'due' })
  assert.deepEqual(dueFigure('2026-09-28', '2026-09-24'), { text: 'in 4d', sub: 'Follow-up', tone: 'muted' })
  assert.equal(dueFigure(undefined, '2026-09-24'), null)
})

test('without a follow-up a row shows the day it was scanned and the phase', () => {
  const now = new Date(2026, 8, 24).getTime()
  const f = rowFigure(person(), new Date(2026, 8, 12).getTime(), '2026-09-24', now)
  assert.match(f.text, /12/); assert.match(f.text, /Sep/); assert.doesNotMatch(f.text, /26/)
  assert.equal(f.sub, 'New'); assert.equal(f.tone, 'muted')
  assert.match(shortDate(new Date(2025, 0, 3).getTime(), now), /25/)
})

test('a follow-up outranks the scan date', () => {
  assert.equal(rowFigure(person({ followUp: '2026-09-20' }), 0, '2026-09-24').tone, 'due')
})

test('today is the phone’s own day', () => {
  assert.equal(isToday(new Date(2026, 8, 24, 23, 30).getTime(), '2026-09-24'), true)
  assert.equal(isToday(new Date(2026, 8, 23, 23, 30).getTime(), '2026-09-24'), false)
})
