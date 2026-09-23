// Run: node --test test/qrcontact.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseQr, parseVCard, parseCardLink } from '../src/lib/qrcontact.ts'
import { buildCardVcf } from '../src/lib/cardvcf.ts'
import { emptyCard } from '../src/lib/mycards.ts'

test('a CardPulse "Just share" QR round-trips into a contact', () => {
  const card = { ...emptyCard(), name: 'Prasenjit Sharma', title: 'Chief Regional Manager', company: 'Hindustan Petroleum; Corp, Ltd', phones: ['+91 70709 90307'], emails: ['p@example.in'], website: 'example.in', address: '12 MG Road, Pune', social: ['linkedin.com/in/ps'] }
  const r = parseQr(buildCardVcf(card).text)
  assert.equal(r.kind, 'contact')
  const c = r.contact
  assert.equal(c.name, 'Prasenjit Sharma'); assert.equal(c.company, 'Hindustan Petroleum; Corp, Ltd'); assert.equal(c.title, 'Chief Regional Manager')
  assert.deepEqual(c.phones, ['+917070990307']); assert.deepEqual(c.emails, ['p@example.in'])
  assert.equal(c.website, 'example.in'); assert.equal(c.address, '12 MG Road, Pune'); assert.deepEqual(c.social, ['linkedin.com/in/ps'])
})

test('a printed card\'s vCard 2.1: folded lines, item groups, quoted-printable, N without FN', () => {
  const text = 'BEGIN:VCARD\r\nVERSION:2.1\r\nN:Rao;Asha;;;\r\nORG:Vivacity Woven;Sales\r\nitem1.TEL;CELL:+91 98765 43210\r\nTEL;WORK:+91 20 2345 6789\r\nEMAIL;INTERNET:asha@\r\n example.in\r\nNOTE;ENCODING=QUOTED-PRINTABLE;CHARSET=UTF-8:=E0=A4=A8=E0=A4=AE=E0=A4=B8=E0=A5=8D=E0=A4=A4=E0=A5=87\r\nEND:VCARD'
  const c = parseVCard(text)
  assert.equal(c.name, 'Asha Rao'); assert.equal(c.company, 'Vivacity Woven')
  assert.deepEqual(c.phones, ['+91 98765 43210', '+91 20 2345 6789']); assert.deepEqual(c.emails, ['asha@example.in'])
  assert.equal(c.note, 'नमस्ते')
})

test('MeCard, tel: and mailto: become contacts', () => {
  const m = parseQr('MECARD:N:Mehta,Rahul;TEL:9876543210;EMAIL:rahul@example.in;ORG:Shakti Polymers;;')
  assert.equal(m.kind, 'contact'); assert.equal(m.contact.name, 'Rahul Mehta'); assert.equal(m.contact.company, 'Shakti Polymers')
  assert.deepEqual(parseQr('tel:+919876543210').contact.phones, ['+919876543210'])
  assert.deepEqual(parseQr('mailto:priya@example.in?subject=Hi').contact.emails, ['priya@example.in'])
})

test('a CardPulse "Collect leads" link is recognised with its event; other links and text are not contacts', () => {
  assert.deepEqual(parseCardLink('https://prasenjit-sharma.github.io/cardpulse/?card=7KQ4M2XA&event=e1&eventName=Plast%20India'), { slug: '7KQ4M2XA', eventId: 'e1', eventName: 'Plast India' })
  assert.deepEqual(parseQr('https://prasenjit-sharma.github.io/cardpulse/?card=7KQ4M2XA'), { kind: 'cardpulse', slug: '7KQ4M2XA' })
  assert.equal(parseQr('https://evil.example/?card=7KQ4M2XA').kind, 'link', 'a lookalike on another site is just a link')
  assert.equal(parseQr('https://example.in').kind, 'link')
  assert.equal(parseQr('hello there').kind, 'text')
  assert.equal(parseQr('BEGIN:VCARD\nEND:VCARD').kind, 'text', 'an empty vCard is not a contact')
})
