// Run: node --test test/actions.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { contactText, saveToPhone, shareContact, shareVcf } from '../src/lib/actions.ts'

const c = { name: 'Rajesh Shah', title: 'General Manager – Procurement', company: 'ABC Polymers Pvt. Ltd.', phones: ['+91 98765 43210'], emails: ['rajesh@abc.com'], website: 'www.abc.com', address: 'Plot 42, Ahmedabad', gstin: '', social: [] }
const abort = () => Object.assign(new Error('cancelled'), { name: 'AbortError' })

/**
 * A navigator that behaves like Chrome: share/canShare THROW "Illegal invocation" unless called on the navigator itself.
 * (The bug that made Share do nothing on real phones slipped past tests whose fakes were plain functions.)
 */
function chromeNavigator({ files = true, shareImpl } = {}) {
  const calls = { share: [], clip: [], download: [] }
  const nav = {
    canShare(d) { if (this !== nav) throw new TypeError('Illegal invocation'); return files || !d.files },
    async share(d) { if (this !== nav) throw new TypeError('Illegal invocation'); calls.share.push(d); if (shareImpl) await shareImpl(d) },
    clipboard: { async writeText(t) { calls.clip.push(t) } },
  }
  return { nav, calls, env: { nav, download: (...a) => calls.download.push(a), log: () => {} } }
}

test('REGRESSION: works with a navigator that rejects detached calls (real Chrome semantics)', async () => {
  const { env, calls } = chromeNavigator()
  const out = await shareContact(c, 'note', env)
  assert.equal(out.result, 'shared'); assert.equal(out.problem, undefined)
  assert.equal(calls.share.length, 1)
})

test('Share contact: vCard file plus readable text in one share', async () => {
  const { env, calls } = chromeNavigator()
  await shareContact(c, '', env)
  const d = calls.share[0]
  assert.equal(d.files[0].type, 'text/x-vcard'); assert.equal(d.files[0].name, 'Rajesh Shah.vcf'); assert.match(d.text, /\+91 98765 43210/); assert.match(d.text, /rajesh@abc\.com/)
})

test('Save to phone: share sheet with the file only (no text), so Contacts apps are offered; never a plain download', async () => {
  const { env, calls } = chromeNavigator()
  const out = await saveToPhone(c, '', env)
  assert.equal(out.result, 'shared'); assert.equal(calls.share[0].files[0].name, 'Rajesh Shah.vcf'); assert.equal(calls.share[0].text, undefined); assert.equal(calls.download.length, 0)
})

test('files not shareable: Share falls back to text; Save to phone downloads (nothing else it can do) and says why', async () => {
  const a = chromeNavigator({ files: false })
  const s1 = await shareContact(c, '', a.env)
  assert.equal(s1.result, 'shared'); assert.equal(a.calls.share[0].files, undefined); assert.match(a.calls.share[0].text, /Rajesh Shah/)
  const b = chromeNavigator({ files: false })
  const s2 = await saveToPhone(c, '', b.env)
  assert.equal(s2.result, 'downloaded'); assert.equal(b.calls.download[0][2], 'text/x-vcard')
})

test('share() rejects (blocked): tries text, then clipboard, then download, and reports the reason', async () => {
  const blocked = () => { throw Object.assign(new Error('blocked'), { name: 'NotAllowedError' }) }
  const a = chromeNavigator({ shareImpl: blocked })
  const o1 = await shareContact(c, '', a.env)
  assert.equal(o1.result, 'copied'); assert.match(o1.problem, /NotAllowedError/); assert.match(a.calls.clip[0], /Rajesh Shah/)
  const b = chromeNavigator({ shareImpl: blocked }); b.nav.clipboard = undefined
  const o2 = await shareContact(c, '', b.env)
  assert.equal(o2.result, 'downloaded'); assert.match(o2.problem, /NotAllowedError/)
})

test('no Web Share at all (desktop browsers): copies for Share, downloads for Save, both say so', async () => {
  const calls = { clip: [], dl: [] }
  const env = { nav: { clipboard: { writeText: async (t) => calls.clip.push(t) } }, download: (...a) => calls.dl.push(a) }
  const o1 = await shareContact(c, '', env); assert.equal(o1.result, 'copied'); assert.match(o1.problem, /no share sheet/)
  const o2 = await saveToPhone(c, '', env); assert.equal(o2.result, 'downloaded')
})

test('closing the share sheet is not an error and triggers no fallback', async () => {
  const { env, calls } = chromeNavigator({ shareImpl: () => { throw abort() } })
  const out = await shareContact(c, '', env)
  assert.equal(out.result, 'cancelled'); assert.equal(calls.clip.length, 0); assert.equal(calls.download.length, 0)
})

test('uses text/x-vcard (what Android contact files are), falls back to text/vcard if the browser only allows that', async () => {
  const a = chromeNavigator(); await saveToPhone(c, '', a.env)
  assert.equal(a.calls.share[0].files[0].type, 'text/x-vcard')
  const b = chromeNavigator(); const real = b.nav.canShare
  b.nav.canShare = function (d) { if (d.files?.[0]?.type === 'text/x-vcard') return false; return real.call(this, d) }
  await saveToPhone(c, '', b.env)
  assert.equal(b.calls.share[0].files[0].type, 'text/vcard')
})

test('canShare itself throwing does not crash the action', async () => {
  const { env, nav } = chromeNavigator(); nav.canShare = () => { throw new TypeError('boom') }
  const out = await shareContact(c, '', env)
  assert.equal(out.result, 'shared')   // falls through to the text share
})

test('shareVcf works for several contacts at once (bulk select)', async () => {
  const { env, calls } = chromeNavigator()
  assert.equal((await shareVcf('contacts.vcf', 'BEGIN:VCARD\r\nEND:VCARD', '3 contacts', undefined, env, false)).result, 'shared'); assert.equal(calls.share[0].files[0].name, 'contacts.vcf')
})

test('contactText is readable and skips empty fields', () => {
  assert.equal(contactText({ ...c, website: '', address: '' }), 'Rajesh Shah\nGeneral Manager – Procurement, ABC Polymers Pvt. Ltd.\n+91 98765 43210\nrajesh@abc.com')
})
