// Run: node --test test/leads.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { applyPulledLeads, leadToContact } from '../src/lib/leads.ts'

const lead = (o = {}) => ({ id: 'l1', card_id: 'c1', event_id: null, event_name: null, name: 'Visitor One', phone: '9990001111', email: null, company: null, created_at: '2026-09-22T10:00:00Z', ...o })
const events = [{ id: 'e1', name: 'Plast India', createdAt: 1 }]

test('a matched local event is applied, and the note does not repeat its name', () => {
  const { contact, eventId } = leadToContact(lead({ event_id: 'e1', event_name: 'Plast India' }), events)
  assert.equal(eventId, 'e1'); assert.equal(contact.note, 'From your stall')
})
test('an unknown or missing event is never invented; its name is folded into the note instead', () => {
  const a = leadToContact(lead({ event_id: 'gone', event_name: 'Old Expo' }), events)
  assert.equal(a.eventId, undefined); assert.equal(a.contact.note, 'From your stall (Old Expo)')
  const b = leadToContact(lead(), events)
  assert.equal(b.eventId, undefined); assert.equal(b.contact.note, 'From your stall')
})
test('a name-only lead becomes a real contact with no crash, empty lists where nothing was given', () => {
  const { contact } = leadToContact(lead({ phone: null, email: null, company: null }), [])
  assert.equal(contact.name, 'Visitor One'); assert.deepEqual(contact.phones, []); assert.deepEqual(contact.emails, []); assert.equal(contact.company, '')
})
test('phone and email, when present, become single-item lists', () => {
  const { contact } = leadToContact(lead({ email: 'v@x.com' }), [])
  assert.deepEqual(contact.phones, ['9990001111']); assert.deepEqual(contact.emails, ['v@x.com'])
})

test('a write that fails leaves that lead unmarked, so it is retried on the next pull instead of lost; successes are reported', async () => {
  const pulled = [{ leadId: 'a', contact: { name: 'A' } }, { leadId: 'b', contact: { name: 'B' } }, { leadId: 'c', contact: { name: 'C' } }]
  let calls = 0
  const write = async () => { calls++; if (calls === 2) throw new Error('boom') }
  const succeeded = await applyPulledLeads(pulled, write)
  assert.deepEqual(succeeded, ['a', 'c'])
})
test('every write succeeding marks every lead', async () => {
  const pulled = [{ leadId: 'x', contact: { name: 'X' } }, { leadId: 'y', contact: { name: 'Y' } }]
  const succeeded = await applyPulledLeads(pulled, async () => {})
  assert.deepEqual(succeeded, ['x', 'y'])
})
test('every write failing marks nothing', async () => {
  const succeeded = await applyPulledLeads([{ leadId: 'z', contact: { name: 'Z' } }], async () => { throw new Error('down') })
  assert.deepEqual(succeeded, [])
})
