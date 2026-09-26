// Run: node --test test/phones.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { callNumber, canWhatsApp, guessKind, phoneKey, prunePhoneMeta, rankedPhones, whatsAppNumber } from '../src/lib/phones.ts'
import { toVCard } from '../src/lib/actions.ts'

// the card from the field: two Kalol landlines printed above the mobile
const haresh = { name: 'Haresh Shah', title: 'CEO', company: 'Mayur Wovens', phones: ['+91 2717 297051', '+91 2717 297052', '+91 9898 22 88 55'], emails: [], website: '', address: '', gstin: '', social: [] }

test('one number, however it is written', () => {
  assert.equal(phoneKey('+91 98250 07291'), '9825007291')
  assert.equal(phoneKey('098250 07291'), '9825007291')
  assert.equal(phoneKey('9825007291'), '9825007291')
})

test('an Indian landline is told from a mobile by its first digit', () => {
  assert.equal(guessKind('+91 2717 297051'), 'work')
  assert.equal(guessKind('079 2658 1234'), 'work')           // STD codes that open like a mobile: written apart
  assert.equal(guessKind('(079) 2658-1234'), 'work')
  assert.equal(guessKind('+91 80 4123 4567'), 'work')
  assert.equal(guessKind('+91 79265 81234'), 'mobile')
  assert.equal(guessKind('+91 7926581234'), 'mobile')
  assert.equal(guessKind('+91 98250 07291'), 'mobile')
  assert.equal(guessKind('63510 00034'), 'mobile')
  assert.equal(guessKind('+1 415 555 0100'), 'mobile')      // abroad: no way to tell, so it stays callable and WhatsApp-able
})

test('the mobile goes first, landlines keep their printed order', () => {
  assert.deepEqual(rankedPhones(haresh).map((p) => [p.number, p.kind, p.main]), [
    ['+91 9898 22 88 55', 'mobile', true], ['+91 2717 297051', 'work', false], ['+91 2717 297052', 'work', false]])
  assert.equal(callNumber(haresh), '+91 9898 22 88 55')
})

test('a number the user made main leads, even a landline', () => {
  const c = { ...haresh, mainPhone: phoneKey('+91 2717 297052') }
  assert.equal(callNumber(c), '+91 2717 297052')
  assert.equal(whatsAppNumber(c), '+91 9898 22 88 55')        // WhatsApp still opens the mobile
})

test('a label the user set wins over the guess', () => {
  const c = { ...haresh, phoneKinds: { [phoneKey('+91 9898 22 88 55')]: 'home' } }
  assert.equal(rankedPhones(c)[0].number, '+91 2717 297051')   // no mobile left: printed order
  assert.equal(whatsAppNumber(c), '+91 9898 22 88 55')        // a home mobile can still take WhatsApp
})

test('no WhatsApp for landlines and faxes', () => {
  assert.equal(canWhatsApp('+91 2717 297051', 'work'), false)
  assert.equal(canWhatsApp('+91 98250 07291', 'fax'), false)
  assert.equal(whatsAppNumber({ phones: ['+91 2717 297051'] }), undefined)
})

test('labels of numbers no longer on the contact are dropped', () => {
  const k = phoneKey('+91 2717 297051')
  assert.deepEqual(prunePhoneMeta({ phones: ['+91 9898 22 88 55'], phoneKinds: { [k]: 'main' }, mainPhone: k }), { phoneKinds: undefined, mainPhone: undefined })
  assert.deepEqual(prunePhoneMeta({ phones: ['+91 2717 297051'], phoneKinds: { [k]: 'main' }, mainPhone: k }), { phoneKinds: { [k]: 'main' }, mainPhone: k })
})

test('the vCard lists the main number first, preferred, with real types', () => {
  const tel = toVCard(haresh).split('\r\n').filter((l) => l.startsWith('TEL'))
  assert.deepEqual(tel, ['TEL;TYPE=CELL,PREF:+919898228855', 'TEL;TYPE=WORK,VOICE:+912717297051', 'TEL;TYPE=WORK,VOICE:+912717297052'])
  assert.deepEqual(toVCard({ ...haresh, phones: ['+91 98250 07291'] }).split('\r\n').filter((l) => l.startsWith('TEL')), ['TEL;TYPE=CELL:+919825007291'])
})
