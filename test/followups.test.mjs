// Run: node --test test/followups.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_LOG, MAX_NOTE, currentFollowUp, dueLabel, dueStatus, followUpIcs, localISO, logInteraction, newEntry, plannedFollowUps, presetDate, removeInteraction, setFollowUp } from '../src/lib/followups.ts'

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
const at = (m, d, h = 12) => new Date(2026, m - 1, d, h).getTime()        // a moment on the phone's own clock
test('logging puts the newest first and keeps every planned follow-up', () => {
  let c = person()
  c = logInteraction(c, newEntry({ kind: 'call', outcome: 'no-answer', note: 'rang twice', next: '2026-10-03' }, at(9, 26), 'one'))
  c = logInteraction(c, newEntry({ kind: 'call', outcome: 'connected', note: 'spoke', next: '2026-10-10' }, at(9, 26, 13), 'two'))
  assert.deepEqual(c.log.map((e) => e.id), ['two', 'one'])
  assert.deepEqual(plannedFollowUps(c), ['2026-10-03', '2026-10-10'])
})
test('the nearest follow-up stands, not the newest one logged (a call for 27 Sept, then a meeting for 26 Oct)', () => {
  let c = person()
  c = logInteraction(c, newEntry({ kind: 'call', outcome: 'connected', note: '', next: '2026-09-27' }, at(9, 26, 22), 'call'))
  c = logInteraction(c, newEntry({ kind: 'meeting', note: '', next: '2026-10-26' }, at(9, 26, 23), 'meet'))
  assert.equal(currentFollowUp(c, '2026-09-26'), '2026-09-27')
  assert.equal(currentFollowUp(c, '2026-09-27'), '2026-09-27')             // due today
  assert.equal(currentFollowUp(c, '2026-09-28'), '2026-10-26')             // once the day has passed, the next one takes over
})
test('a passed follow-up with nothing planned after it stays, as overdue', () => {
  const c = logInteraction(person(), newEntry({ kind: 'call', note: '', next: '2026-09-27' }, at(9, 26), 'x'))
  assert.equal(currentFollowUp(c, '2026-10-02'), '2026-09-27')
})
test('logging on or after a follow-up day completes it; later plans stay', () => {
  let c = person({ followUp: '2026-10-01' })
  c = logInteraction(c, newEntry({ kind: 'call', note: 'quote', next: '2026-10-20' }, at(9, 28), 'a'))
  assert.equal(c.followUp, '2026-10-01')                                   // logged before the day: still to do
  c = logInteraction(c, newEntry({ kind: 'message', note: 'sent catalogue' }, at(10, 1), 'b'))
  assert.equal(c.followUp, undefined)                                      // done on the day
  assert.deepEqual(plannedFollowUps(c), ['2026-10-20'])
  c = logInteraction(c, newEntry({ kind: 'call', note: 'spoke' }, at(10, 21), 'c'))
  assert.deepEqual(plannedFollowUps(c), [])
})
test('a next date on the day it is logged is not completed by its own entry', () => {
  const c = logInteraction(person(), newEntry({ kind: 'call', note: '', next: '2026-09-26' }, at(9, 26), 'x'))
  assert.equal(currentFollowUp(c, '2026-09-26'), '2026-09-26')
})
test('changing the follow-up moves the one that stands, and removing it lets the next one take over', () => {
  let c = person()
  c = logInteraction(c, newEntry({ kind: 'call', note: '', next: '2026-09-27' }, at(9, 26), 'call'))
  c = logInteraction(c, newEntry({ kind: 'meeting', note: '', next: '2026-10-26' }, at(9, 26, 13), 'meet'))
  const moved = setFollowUp(c, '2026-10-05', '2026-09-26')
  assert.equal(currentFollowUp(moved, '2026-09-26'), '2026-10-05')
  assert.equal(moved.log.find((e) => e.id === 'call').next, '2026-10-05')
  const removed = setFollowUp(c, '', '2026-09-26')
  assert.equal(currentFollowUp(removed, '2026-09-26'), '2026-10-26')
  assert.equal('next' in removed.log.find((e) => e.id === 'call'), false)
  assert.equal(currentFollowUp(setFollowUp(removed, '', '2026-09-26'), '2026-09-26'), undefined)
})
test('a follow-up set by hand is kept, moved and removed like one from the log', () => {
  const c = setFollowUp(person(), '2026-10-09', '2026-09-26')
  assert.equal(c.followUp, '2026-10-09')
  assert.equal(setFollowUp(c, '2026-10-12', '2026-09-26').followUp, '2026-10-12')
  assert.equal('followUp' in setFollowUp(c, '', '2026-09-26'), false)
})
test('the log is capped, dropping the oldest', () => {
  let c = person()
  for (let i = 0; i < MAX_LOG + 5; i++) c = logInteraction(c, newEntry({ kind: 'call', note: String(i) }, i, `e${i}`))
  assert.equal(c.log.length, MAX_LOG); assert.equal(c.log[0].note, String(MAX_LOG + 4))
})
test('removing an entry takes its planned follow-up with it, and leaves one set by hand', () => {
  let c = logInteraction(person({ followUp: '2026-10-12' }), newEntry({ kind: 'call', note: 'a', next: '2026-10-09' }, at(9, 26), 'x'))
  c = removeInteraction(c, 'x')
  assert.deepEqual(c.log, []); assert.deepEqual(plannedFollowUps(c), ['2026-10-12'])
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
