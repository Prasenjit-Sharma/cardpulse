// Run: node --test test/leadform.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { canSendLead, formatPhone, validEmail, validPhone } from '../src/lib/leadform.ts'

test('an email needs a name, an @ and a domain with a dot', () => {
  assert.equal(validEmail('a@b.com'), true)
  assert.equal(validEmail(''), false)
  assert.equal(validEmail('a@b'), false)
  assert.equal(validEmail('ab.com'), false)
  assert.equal(validEmail('a b@c.com'), false)
})
test('a phone needs a plausible number of digits, code and number combined', () => {
  assert.equal(validPhone('+91', '9824022893'), true)          // 12 digits total
  assert.equal(validPhone('+1', '4155551234'), true)            // 11 digits total
  assert.equal(validPhone('+91', '98240'), false)                // too short
  assert.equal(validPhone('+91', ''), false)
  assert.equal(validPhone('91', '9824022893'), true)             // a missing '+' is still fine, just digits
})
test('formatPhone joins the code and number with one space, and always leads with +', () => {
  assert.equal(formatPhone('+91', '98240 22893'), '+91 9824022893')
  assert.equal(formatPhone('91', '9824022893'), '+91 9824022893')
  assert.equal(formatPhone('  +91  ', '  98240-22893  '), '+91 9824022893')
})
test('sending needs a name, and a valid phone or a valid email — not junk in either', () => {
  const base = { name: 'Asha', code: '+91', phone: '', email: '' }
  assert.equal(canSendLead(base).ok, false)                                            // neither
  assert.equal(canSendLead({ ...base, phone: '123' }).ok, false)                        // phone too short
  assert.equal(canSendLead({ ...base, email: 'not-an-email' }).ok, false)               // bad email
  assert.equal(canSendLead({ ...base, phone: '9824022893' }).ok, true)
  assert.equal(canSendLead({ ...base, email: 'a@b.com' }).ok, true)
  assert.equal(canSendLead({ ...base, name: '', phone: '9824022893' }).ok, false)       // no name
})
