// Run: node --test test/actions.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { androidInsertIntent, contactText, saveToPhone, shareContact, shareVcf } from '../src/lib/actions.ts'

const c = { name: 'Rajesh Shah', title: 'General Manager – Procurement', company: 'ABC Polymers Pvt. Ltd.', phones: ['+91 98765 43210', '+91 98250 11223'], emails: ['rajesh@abc.com'], website: 'www.abc.com', address: 'Plot 42, GIDC; Vatva = Ahmedabad', gstin: '24AABCA1234F1Z5', social: [] }
const ANDROID = 'Mozilla/5.0 (Linux; Android 14; Pixel 7) Chrome/120'
const IPHONE = 'Mozilla/5.0 (iPhone; CPU iPhone OS 17_0 like Mac OS X) Safari/604.1'
const DESKTOP = 'Mozilla/5.0 (Macintosh; Intel Mac OS X) Chrome/120'

function env(over = {}) {
  const calls = { navigate: [], share: [], download: [], clip: [] }
  const e = { ua: DESKTOP, navigate: (u) => calls.navigate.push(u), download: (...a) => calls.download.push(a),
    nav: { share: async (d) => { calls.share.push(d) }, canShare: () => true, clipboard: { writeText: async (t) => { calls.clip.push(t) } } }, ...over }
  return { e, calls }
}
const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' })

test('Android intent: opens Contacts (INSERT) with every field encoded, so ; and = in values cannot break it', () => {
  const url = androidInsertIntent(c, 'Met at Auto Expo')
  assert.match(url, /^intent:#Intent;action=android\.intent\.action\.INSERT;type=vnd\.android\.cursor\.dir\/contact;/)
  assert.ok(url.endsWith('end'))
  const fields = Object.fromEntries(url.split(';').filter((p) => p.startsWith('S.')).map((p) => { const i = p.indexOf('='); return [p.slice(2, i), decodeURIComponent(p.slice(i + 1))] }))
  assert.equal(fields.name, 'Rajesh Shah'); assert.equal(fields.company, 'ABC Polymers Pvt. Ltd.'); assert.equal(fields.job_title, 'General Manager – Procurement')
  assert.equal(fields.phone, '+91 98765 43210'); assert.equal(fields.secondary_phone, '+91 98250 11223'); assert.equal(fields.email, 'rajesh@abc.com')
  assert.equal(fields.postal, 'Plot 42, GIDC; Vatva = Ahmedabad')   // ; and = survived
  assert.match(fields.notes, /Met at Auto Expo/); assert.match(fields.notes, /Web: www\.abc\.com/); assert.match(fields.notes, /GSTIN: 24AABCA1234F1Z5/)
  assert.equal(url.split(';').filter((p) => p.startsWith('S.')).length, Object.keys(fields).length, 'no stray extras')
})

test('intent leaves out fields the contact does not have', () => {
  const url = androidInsertIntent({ ...c, phones: [], emails: [], address: '', website: '', gstin: '', title: '', company: '' })
  assert.ok(!/S\.(phone|email|postal|company|job_title)=/.test(url)); assert.match(url, /S\.name=/)
})

test('Save to phone on Android: fires the intent synchronously (keeps the tap gesture) and never downloads', async () => {
  const { e, calls } = env({ ua: ANDROID })
  const p = saveToPhone(c, '', e)
  assert.equal(calls.navigate.length, 1, 'navigation must happen before any await')
  assert.equal(await p, 'contacts'); assert.equal(calls.download.length, 0); assert.equal(calls.share.length, 0)
})

test('Save to phone elsewhere: share sheet with the vCard file, not a silent download', async () => {
  for (const ua of [IPHONE, DESKTOP]) {
    const { e, calls } = env({ ua })
    assert.equal(await saveToPhone(c, '', e), 'shared')
    assert.equal(calls.share[0].files[0].type, 'text/vcard'); assert.equal(calls.share[0].files[0].name, 'Rajesh Shah.vcf'); assert.equal(calls.download.length, 0)
  }
})

test('Share contact: card file plus readable text in one share', async () => {
  const { e, calls } = env()
  assert.equal(await shareContact(c, 'note', e), 'shared')
  assert.equal(calls.share[0].files.length, 1); assert.match(calls.share[0].text, /Rajesh Shah/); assert.match(calls.share[0].text, /\+91 98765 43210/)
})

test('Share contact when files are not shareable: falls back to text', async () => {
  const { e, calls } = env(); e.nav.canShare = () => false
  assert.equal(await shareContact(c, '', e), 'shared'); assert.equal(calls.share[0].files, undefined); assert.match(calls.share[0].text, /rajesh@abc\.com/)
})

test('Share contact when share() throws (the old silent failure): tries text, then clipboard, then download; never nothing', async () => {
  const { e, calls } = env(); e.nav.share = async () => { throw Object.assign(new Error('nope'), { name: 'NotAllowedError' }) }
  assert.equal(await shareContact(c, '', e), 'copied'); assert.match(calls.clip[0], /Rajesh Shah/)
  const b = env(); b.e.nav.share = async () => { throw new Error('x') }; b.e.nav.clipboard = undefined
  assert.equal(await shareContact(c, '', b.e), 'downloaded'); assert.equal(b.calls.download[0][2], 'text/vcard')
  const d = env(); d.e.nav.share = undefined; d.e.nav.canShare = undefined
  assert.equal(await shareContact(c, '', d.e), 'copied')
})

test('closing the share sheet is not an error and does not trigger fallbacks', async () => {
  const { e, calls } = env(); e.nav.share = async () => { throw abort() }
  assert.equal(await shareContact(c, '', e), 'cancelled'); assert.equal(calls.clip.length, 0); assert.equal(calls.download.length, 0)
})

test('shareVcf works for several contacts at once (bulk select)', async () => {
  const { e, calls } = env()
  assert.equal(await shareVcf('contacts.vcf', 'BEGIN:VCARD\r\nEND:VCARD', 'Contacts', undefined, e), 'shared'); assert.equal(calls.share[0].files[0].name, 'contacts.vcf')
})

test('contactText is readable and skips empty fields', () => {
  assert.equal(contactText({ ...c, website: '', address: '', phones: ['123'] }), 'Rajesh Shah\nGeneral Manager – Procurement, ABC Polymers Pvt. Ltd.\n123\nrajesh@abc.com')
})
