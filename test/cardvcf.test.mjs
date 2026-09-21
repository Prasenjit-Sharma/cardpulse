// Run: node --test test/cardvcf.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCardVcf, reachable } from '../src/lib/cardvcf.ts'
import { qrMatrix } from '../src/lib/qr.ts'
import { emptyCard } from '../src/lib/mycards.ts'

const card = (o = {}) => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'General Manager', company: 'ABC Polymers', phones: ['+91 98240 22893'], emails: ['r@abc.com'], website: 'abc.com', address: 'GIDC Vatva, Ahmedabad 382445', ...o })

test('a vCard 3.0 carries name, organisation, title, phone, email, url and address', () => {
  const { text, dropped } = buildCardVcf(card())
  for (const l of ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Rajesh Shah', 'N:Shah;Rajesh;;;', 'ORG:ABC Polymers', 'TITLE:General Manager', 'TEL;TYPE=CELL:+919824022893', 'EMAIL;TYPE=WORK:r@abc.com', 'URL:abc.com', 'END:VCARD']) assert.ok(text.split('\r\n').includes(l), l)
  assert.ok(text.includes('ADR;TYPE=WORK:;;GIDC Vatva\\, Ahmedabad 382445;;;;')); assert.deepEqual(dropped, [])
})
test('commas, semicolons, backslashes and newlines in fields are escaped', () => {
  const { text } = buildCardVcf(card({ company: 'A;B, C\\D', address: 'line1\nline2: near, market' }))
  assert.ok(text.includes('ORG:A\;B\\, C\\\\D')); assert.ok(text.includes('line1\\nline2: near\\, market'))
  assert.equal(text.split('\r\n').every((l) => !l.includes('\n')), true)
})
test('over budget, optional parts drop in a fixed order and are reported', () => {
  const big = card({ social: ['linkedin.com/in/' + 'x'.repeat(200)], address: 'a'.repeat(300), emails: ['a@b.co', 'c@d.co', 'e@f.co'], phones: ['1111111111', '2222222222', '3333333333'] })
  const r = buildCardVcf(big, 350)
  assert.ok(new TextEncoder().encode(r.text).length <= 350)
  assert.deepEqual(r.dropped.slice(0, 2), ['social', 'address'])
  assert.ok(r.text.includes('EMAIL;TYPE=WORK:a@b.co'), 'the first email is always kept')
})
test('a card with only a name still produces a valid vCard, and is reported unreachable', () => {
  const c = card({ phones: [], emails: [], website: '', address: '', title: '', company: '' })
  assert.ok(buildCardVcf(c).text.includes('FN:Rajesh Shah')); assert.equal(reachable(c), false); assert.equal(reachable(card()), true)
})
test('a Hindi name survives into the vCard text', () => {
  const { text } = buildCardVcf(card({ name: 'प्रसेनजीत शर्मा' }))
  assert.ok(text.includes('FN:प्रसेनजीत शर्मा'))
})
test('the QR is a square matrix with the three finder patterns, and a Hindi card encodes without error', () => {
  const m = qrMatrix(buildCardVcf(card()).text)
  const n = m.length
  assert.ok(n >= 21 && m.every((r) => r.length === n))
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) { assert.ok(m[y][x] && m[y][x + 6] && m[y + 6][x] && m[y + 6][x + 6]); assert.ok(m[y + 3][x + 3]) }
  assert.ok(qrMatrix(buildCardVcf(card({ name: 'प्रसेनजीत शर्मा', company: 'हिन्दुस्तान पेट्रोलियम' })).text).length >= 21)
})

test('non-Latin text is encoded as UTF-8 bytes, not squeezed to one byte a character', () => {
  // 6 Hindi letters are 18 UTF-8 bytes: too many for the smallest QR (14 bytes at level M), so it must grow, exactly like 18 plain letters do.
  assert.equal(qrMatrix('प्रसेन').length, qrMatrix('a'.repeat(18)).length)
  assert.ok(qrMatrix('प्रसेन').length > 21)
})
