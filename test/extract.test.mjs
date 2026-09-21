// Run: node --test test/extract.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseResponse, responseSchema, PROMPT } from '../shared/extract-core.ts'

const reply = (obj) => ({ candidates: [{ content: { parts: [{ text: JSON.stringify(obj) }] } }] })
const person = { name: 'Nilay Shah', title: '', company: 'Premchand Dahyabhai Sh', phones: [], emails: ['NilayShah80@gmail.com'], website: '', address: '', gstin: '', social: [], image: 1 }

test('extras are kept, trimmed, and empty ones dropped', () => {
  const r = parseResponse(reply({ languages: ['English'], notes: '', contacts: [
    { ...person, extras: '  Authorised Dealer for Hindustan Petroleum  ' },
    { ...person, name: 'B', extras: '' },
    { ...person, name: 'C' },
  ] }))
  assert.equal(r.contacts[0].extras, 'Authorised Dealer for Hindustan Petroleum')
  assert.equal(r.contacts[1].extras, undefined)
  assert.equal(r.contacts[2].extras, undefined)
})

test('the schema requires extras, and the prompt asks for dealer status, factory addresses and client lists', () => {
  assert.ok(responseSchema.properties.contacts.items.required.includes('extras'))
  assert.match(PROMPT, /"extras"/)
  assert.match(PROMPT, /Factory:/)
  assert.match(PROMPT, /Authorised Dealer/)
  assert.match(PROMPT, /client or brand list/)
})

test('model uncertainty notes stay separate from extras', () => {
  const r = parseResponse(reply({ languages: [], notes: 'Email is cut off at the right edge.', contacts: [{ ...person, extras: 'Dealer: HDPE' }] }))
  assert.equal(r.notes, 'Email is cut off at the right edge.')
  assert.equal(r.contacts[0].extras, 'Dealer: HDPE')
})
