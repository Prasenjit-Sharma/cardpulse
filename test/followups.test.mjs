// Run: node --test test/followups.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LOG, MAX_NOTE, dueLabel, dueStatus, followUpIcs, localISO, logInteraction, newEntry, presetDate, removeInteraction } from '../src/lib/followups.ts'

const BS = String.fromCharCode(92)                                       // a backslash
const person = (o = {}) => ({ name: 'Rajesh Shah', title: '', company: 'ABC Polymers', phones: ['+91 98240 22893'], emails: [], website: '', address: '', gstin: '', social: [], ...o })

test('the date is the phone\'s own calendar day, not UTC', () => {
  // 01:30 on 5 Oct in India (UTC+5:30) is still 4 Oct in UTC: toISOString would say the 4th.
  const d = new Date(2026, 9, 5, 1, 30)
  assert.equal(localISO(d), '2026-10-05')
})
test('presets are counted from the given day, across month ends', () => {
  const from = new Date(2026, 0, 30)
  assert.equal(presetDate('tomorrow', from), '2026-01-31'); assert.equal(presetDate('3d', from), '2026-02-02')
  assert.equal(presetDate('week', from), '2026-02-06'); assert.equal(presetDate('2w', from), '2026-02-13'); assert.equal(presetDate('month', from), '2026-02-28')
})
test('a follow-up is overdue, today, upcoming or none, with the number of days', () => {
  assert.deepEqual(dueStatus(undefined, '2026-10-05'), { state: 'none', days: 0 })
  assert.deepEqual(dueStatus('', '2026-10-05'), { state: 'none', days: 0 })
  assert.deepEqual(dueStatus('2026-10-02', '2026-10-05'), { state: 'overdue', days: 3 })
  assert.deepEqual(dueStatus('2026-10-05', '2026-10-05'), { state: 'today', days: 0 })
  assert.deepEqual(dueStatus('2026-10-09', '2026-10-05'), { state: 'upcoming', days: 4 })
})
test('an entry keeps a trimmed, bounded note, and an outcome only for calls', () => {
  const e = newEntry({ kind: 'call', outcome: 'connected', note: '  Wants HDPE quote  ', next: '2026-10-09' }, 1000, 'a')
  assert.deepEqual(e, { id: 'a', at: 1000, kind: 'call', outcome: 'connected', note: 'Wants HDPE quote', next: '2026-10-09' })
  assert.equal(newEntry({ kind: 'meeting', outcome: 'connected', note: 'x' }, 1, 'b').outcome, undefined)
  assert.equal(newEntry({ kind: 'call', note: 'y'.repeat(MAX_NOTE + 50) }, 1, 'c').note.length, MAX_NOTE)
})
test('logging puts the newest first and moves the follow-up to the new date', () => {
  let c = person({ followUp: '2026-10-01' })
  c = logInteraction(c, newEntry({ kind: 'call', outcome: 'no-answer', note: 'rang twice', next: '2026-10-03' }, 100, 'one'))
  c = logInteraction(c, newEntry({ kind: 'call', outcome: 'connected', note: 'spoke', next: '2026-10-10' }, 200, 'two'))
  assert.deepEqual(c.log.map((e) => e.id), ['two', 'one']); assert.equal(c.followUp, '2026-10-10')
})
test('logging with no next date completes the follow-up', () => {
  const c = logInteraction(person({ followUp: '2026-10-01' }), newEntry({ kind: 'message', note: 'sent catalogue' }, 1, 'm'))
  assert.equal(c.followUp, undefined); assert.equal(c.log.length, 1)
})
test('the log is capped, dropping the oldest', () => {
  let c = person()
  for (let i = 0; i < MAX_LOG + 5; i++) c = logInteraction(c, newEntry({ kind: 'call', note: String(i) }, i, `e${i}`))
  assert.equal(c.log.length, MAX_LOG); assert.equal(c.log[0].note, String(MAX_LOG + 4))
})
test('removing an entry leaves the follow-up alone', () => {
  let c = logInteraction(person(), newEntry({ kind: 'call', note: 'a', next: '2026-10-09' }, 1, 'x'))
  c = removeInteraction(c, 'x')
  assert.deepEqual(c.log, []); assert.equal(c.followUp, '2026-10-09')
})
test('the calendar file is an all-day event with the person, company and last note, and escapes special characters', () => {
  const c = logInteraction(person({ name: 'Rajesh; Shah' }), newEntry({ kind: 'call', note: 'Quote, HDPE\nsend Monday' }, 1, 'x'))
  const ics = followUpIcs(c, '2026-10-09', new Date(Date.UTC(2026, 9, 5, 12, 0, 0)))
  const lines = ics.split('\r\n')
  for (const l of ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'DTSTART;VALUE=DATE:20261009', 'DTSTAMP:20261005T120000Z', 'END:VEVENT', 'END:VCALENDAR']) assert.ok(lines.includes(l), l)
  assert.ok(lines.includes('SUMMARY:Follow up: Rajesh' + BS + '; Shah (ABC Polymers)'))
  const desc = lines.find((l) => l.startsWith('DESCRIPTION:'))
  assert.ok(desc.includes('Quote' + BS + ', HDPE' + BS + 'nsend Monday')); assert.ok(desc.includes('+91 98240 22893'))
  assert.ok(lines.some((l) => l.startsWith('UID:')))
})

test('the due wording is plain: overdue by n days, due today, tomorrow, in n days, or nothing', () => {
  const t = '2026-10-05'
  assert.equal(dueLabel(undefined, t), ''); assert.equal(dueLabel('2026-10-04', t), 'Overdue by 1 day'); assert.equal(dueLabel('2026-10-02', t), 'Overdue by 3 days')
  assert.equal(dueLabel(t, t), 'Due today'); assert.equal(dueLabel('2026-10-06', t), 'Tomorrow'); assert.equal(dueLabel('2026-10-09', t), 'In 4 days')
})
