// Run: node --test test/cardlayout.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { CARD_H, CARD_W, cardDescription, fitText, layoutCard } from '../src/lib/cardlayout.ts'
import { TEMPLATES, emptyCard } from '../src/lib/mycards.ts'

const measure = (t, size) => [...t].length * size * 0.56           // a rough width model: enough to test fitting
const base = () => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'General Manager', company: 'ABC Polymers Pvt. Ltd.', phones: ['+91 98240 22893'], emails: ['rajesh@abcpolymers.com'], website: 'abcpolymers.com' })
const inside = (b) => b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= CARD_W + 0.01 && b.y + b.h <= CARD_H + 0.01
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('fitText shrinks first, then truncates with an ellipsis', () => {
  assert.deepEqual(fitText('Asha', 50, 8, 4, 700, measure), { text: 'Asha', size: 8 })
  const s = fitText('A very long name indeed for a card', 40, 8, 4, 700, measure)
  assert.ok(s.size < 8); assert.ok(measure(s.text, s.size) <= 40)
  const t = fitText('x'.repeat(200), 40, 8, 4, 700, measure)
  assert.equal(t.size, 4); assert.ok(t.text.endsWith('…')); assert.ok(measure(t.text, t.size) <= 40)
})
for (const template of TEMPLATES) {
  for (const [label, o] of [['normal', {}], ['very long text', { name: 'Dr. Balasubramaniam Venkataraghavan Iyer-Subramanyam', title: 'Senior Vice President, Strategic Procurement and Supply Chain', company: 'Hindustan Petroleum Corporation Limited (A Government of India Enterprise)', emails: ['balasubramaniam.venkataraghavan@hindustanpetroleum.example.com'] }], ['hindi', { name: 'प्रसेनजीत शर्मा', company: 'हिन्दुस्तान पेट्रोलियम कॉर्पोरेशन लिमिटेड' }], ['name only', { phones: [], emails: [], website: '', title: '', company: '' }]]) {
    test(`${template} (${label}): everything is inside the card and nothing touches the QR plate`, () => {
      const { ops, qrBox } = layoutCard({ ...base(), ...o, template }, measure, false)
      assert.ok(inside(qrBox), 'qr inside'); assert.ok(qrBox.w >= 17 && Math.abs(qrBox.w - qrBox.h) < 0.01, 'qr is square and big enough to scan')
      assert.equal(ops.filter((op) => op.kind === 'qr').length, 1)
      for (const op of ops) {
        if (op.kind === 'qr') continue
        assert.ok(inside(op.box), `${op.kind} inside the card`)
        if (op.kind === 'text' && op.text.trim()) assert.equal(overlap(op.box, qrBox), false, `text "${op.text.slice(0, 20)}" clear of the QR`)
      }
    })
  }
}
test('the layout is deterministic and uses the card accent', () => {
  const a = layoutCard({ ...base(), template: 'header', accent: 'navy' }, measure, false)
  assert.deepEqual(a, layoutCard({ ...base(), template: 'header', accent: 'navy' }, measure, false))
  assert.ok(a.ops.some((op) => op.kind === 'rect' && op.fill === '#1C3F73'))
})
test('noir uses the light twin of the accent on its dark ground', () => {
  const n = layoutCard({ ...base(), template: 'noir', accent: 'navy' }, measure, false)
  assert.ok(n.ops.some((op) => op.kind === 'text' && op.color === '#8AAEEA')); assert.equal(n.background, '#15181C')
})
test('a photo replaces the monogram where a template shows one', () => {
  const withPhoto = layoutCard({ ...base(), template: 'ledger', photo: new Blob(['x']) }, measure, false)
  assert.ok(withPhoto.ops.some((o) => o.kind === 'photo')); assert.ok(!withPhoto.ops.some((o) => o.kind === 'mono'))
  assert.ok(layoutCard({ ...base(), template: 'ledger' }, measure, false).ops.some((o) => o.kind === 'mono' && o.text === 'RS'))
})
test('the accessible description names the person and how to reach them', () => {
  assert.equal(cardDescription(base()), 'Rajesh Shah, General Manager, ABC Polymers Pvt. Ltd., +91 98240 22893, rajesh@abcpolymers.com')
  assert.equal(cardDescription(emptyCard()), 'Unnamed')
})
