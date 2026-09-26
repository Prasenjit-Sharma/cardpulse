// Run: node --test test/appshare.test.mjs
// Inside the Android app the WebView can neither download nor use Web Share: every save and share must reach the
// native share sheet. Kept in its own file because setNative() changes module state for everything after it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { onNotice, setNative } from '../src/lib/platform.ts'
import { browserEnv, download, saveToPhone } from '../src/lib/actions.ts'
import { saveBackupFile } from '../src/lib/backup.ts'

const calls = { written: [], shared: [] }
// each test can make the native side fail: writeFail / shareFail are functions that throw, or null
let writeFail = null, shareFail = null
setNative({
  writeCache: async (name, blob) => { if (writeFail) writeFail(); calls.written.push({ name, type: blob.type }); return `file:///cache/${name}` },
  share: async (o) => { calls.shared.push(o); if (shareFail) shareFail() },
  openUrl: async () => {}, closeBrowser: async () => {}, onAppUrl: () => {}, setStatusBar: async () => {},
})
const c = { name: 'Rajesh Shah', title: '', company: 'ABC', phones: ['+91 98765 43210'], emails: [], website: '', address: '', gstin: '', social: [] }

test('in the app, a download goes to the share sheet as a file', async () => {
  calls.written.length = 0; calls.shared.length = 0
  download('Plast India.csv', 'a,b', 'text/csv')
  await new Promise((r) => setTimeout(r, 10))
  assert.deepEqual(calls.written, [{ name: 'Plast_India.csv', type: 'text/csv' }])
  assert.deepEqual(calls.shared[0].files, ['file:///cache/Plast_India.csv'])
})

test('in the app, Save to phone shares the contact file through the native sheet', async () => {
  calls.written.length = 0; calls.shared.length = 0
  const out = await saveToPhone(c, '', browserEnv())
  assert.equal(out.result, 'shared')
  assert.equal(calls.written[0].name, 'Rajesh_Shah.vcf')
})

test('in the app, a failed backup share is an error, never a second share sheet (review I5)', async () => {
  calls.written.length = 0; calls.shared.length = 0
  shareFail = () => { throw new Error("Can't share while sharing is in progress") }
  await assert.rejects(saveBackupFile(new Blob(['zip']), 'cardpulse-backup.zip'), /in progress/)
  assert.equal(calls.shared.length, 1)
  shareFail = null
})

test('in the app, a file that cannot be saved tells the user instead of failing silently (review I3)', async () => {
  const seen = []
  const off = onNotice((m) => seen.push(m))
  writeFail = () => { throw new Error('disk full') }
  await download('Plast India.csv', 'a,b', 'text/csv')
  writeFail = null; off()
  assert.equal(seen.length, 1)
})

test('in the app, closing the share sheet on a download is quiet', async () => {
  const seen = []
  const off = onNotice((m) => seen.push(m))
  shareFail = () => { throw new Error('Share canceled') }
  await download('x.csv', 'a', 'text/csv')
  shareFail = null; off()
  assert.deepEqual(seen, [])
})
