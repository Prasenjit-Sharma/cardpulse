// Run: node --test test/sharecard.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { sendCardTo, waJid } from '../src/lib/sharecard.ts'

const person = (o = {}) => ({ name: 'Abhishek', title: '', company: '', phones: ['99740 33339'], emails: [], website: '', address: '', gstin: '', social: [], ...o })
const card = { id: 'm1', name: 'Prasenjit Sharma', title: '', company: 'CardPulse', phones: ['+91 98240 22893'], emails: [], website: '', address: '', social: [] }
function deps(o = {}) {
  const calls = { sent: [], asked: 0, fallback: 0, remembered: [] }
  const native = { writeCache: async (name) => `file:///cache/${name}`, waApps: async () => ['com.whatsapp'], waSend: async (x) => { calls.sent.push(x) }, ...o.native }
  return { calls, d: { native: o.native === null ? null : native, remembered: () => o.remembered, remember: (a) => calls.remembered.push(a), ask: async () => { calls.asked++; return o.pick ?? null }, fallback: async () => { calls.fallback++ } } }
}

test('the number: main WhatsApp-able number, 91 in front of ten digits; landlines have none', () => {
  assert.equal(waJid(person()), '919974033339')
  assert.equal(waJid(person({ phones: ['0261 2345678'] })), null)
})
test('one WhatsApp: the vCard goes straight into the chat, alone', async () => {
  const { calls, d } = deps()
  assert.equal(await sendCardTo(person(), card, d), 'sent')
  assert.deepEqual(calls.sent, [{ uri: 'file:///cache/Prasenjit-Sharma-card.vcf', jid: '919974033339', pkg: 'com.whatsapp' }])
})
test('both apps: asks once and remembers; a remembered choice is used without asking', async () => {
  let x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] }, pick: 'com.whatsapp.w4b' })
  assert.equal(await sendCardTo(person(), card, x.d), 'sent')
  assert.equal(x.calls.asked, 1); assert.deepEqual(x.calls.remembered, ['com.whatsapp.w4b']); assert.equal(x.calls.sent[0].pkg, 'com.whatsapp.w4b')
  x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] }, remembered: 'com.whatsapp' })
  await sendCardTo(person(), card, x.d)
  assert.equal(x.calls.asked, 0); assert.equal(x.calls.sent[0].pkg, 'com.whatsapp')
  x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] } })
  assert.equal(await sendCardTo(person(), card, x.d), 'cancelled', 'closing the question sends nothing')
  x = deps({ native: { waApps: async () => ['com.whatsapp.w4b'] }, remembered: 'com.whatsapp' })
  await sendCardTo(person(), card, x.d)
  assert.equal(x.calls.sent[0].pkg, 'com.whatsapp.w4b', 'a remembered app that was uninstalled is not used')
})
test('the share sheet instead: no number, no WhatsApp, a refusal, or not the app', async () => {
  for (const [c, o] of [[person({ phones: ['0261 2345678'] }), {}], [person(), { native: { waApps: async () => [] } }], [person(), { native: { waSend: async () => { throw new Error('refused') } } }], [person(), { native: null }]]) {
    const { calls, d } = deps(o)
    assert.equal(await sendCardTo(c, card, d), 'fallback')
    assert.equal(calls.fallback, 1)
  }
})
