// Run: node --test test/eventdates.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { eventSpan, eventState, eventWhen, featuredEvents, openingEvent } from '../src/lib/eventname.ts'

const ev = (id, start, end, createdAt = 0) => ({ id, name: id, createdAt, start, end })
const since = () => 'x'

test('live from the first day through the last, both included', () => {
  const e = ev('plast', '2026-09-24', '2026-09-28')
  assert.equal(eventState(e, '2026-09-23'), 'upcoming')
  assert.equal(eventState(e, '2026-09-24'), 'live')
  assert.equal(eventState(e, '2026-09-28'), 'live')
  assert.equal(eventState(e, '2026-09-29'), 'past')
  assert.equal(eventState(ev('one', '2026-09-26'), '2026-09-26'), 'live')     // a start alone is a one-day event
  assert.equal(eventState(ev('none'), '2026-09-26'), 'undated')
})

test('spans and lines read naturally', () => {
  assert.equal(eventSpan(ev('a', '2026-09-19', '2026-09-21')), '19–21 Sept')
  assert.equal(eventSpan(ev('a', '2026-09-30', '2026-10-02')), '30 Sept – 2 Oct')
  assert.equal(eventWhen(ev('a', '2026-09-24', '2026-09-28'), '2026-09-26', since), 'Live until 28 Sept')
  assert.equal(eventWhen(ev('a', '2026-09-24', '2026-09-26'), '2026-09-26', since), 'Last day today')
  assert.equal(eventWhen(ev('a', '2026-10-03'), '2026-09-26', since), 'Starts 3 Oct')
  assert.equal(eventWhen(ev('a'), '2026-09-26', since), 'Since x')
})

test('featured: live first, then the next to start, then the most recent', () => {
  const list = [ev('old', '2026-08-01', '2026-08-03'), ev('next', '2026-10-03'), ev('later', '2026-11-01'), ev('live', '2026-09-24', '2026-09-28'), ev('undated', undefined, undefined, Date.parse('2026-09-20'))]
  assert.deepEqual(featuredEvents(list, '2026-09-26').map((e) => e.id), ['live', 'next'])
  assert.deepEqual(featuredEvents(list, '2026-09-26', 5).map((e) => e.id), ['live', 'next', 'later', 'undated', 'old'])
  assert.deepEqual(featuredEvents(list, '2026-09-26', 2, 'old').map((e) => e.id), ['live', 'old'])   // the chosen event keeps its tab
})

test('on opening, a finished event stops taking scans and a live one starts', () => {
  const list = [ev('past', '2026-09-01', '2026-09-03'), ev('live', '2026-09-24', '2026-09-28')]
  assert.equal(openingEvent(list, 'past', '2026-09-26'), 'live')
  assert.equal(openingEvent(list, '', '2026-09-26'), 'live')
  assert.equal(openingEvent(list, '', '2026-10-10'), '')
  assert.equal(openingEvent([ev('undated')], 'undated', '2026-09-26'), 'undated')     // an undated choice is left alone
})
