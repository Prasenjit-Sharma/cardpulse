// Run: node --test test/appshare.test.mjs
// Inside the Android app the WebView can neither download nor use Web Share: every save and share must reach the
// native share sheet. Kept in its own file because setNative() changes module state for everything after it.
import test from 'node:test'
import assert from 'node:assert/strict'
import { setNative } from '../src/lib/platform.ts'
import { browserEnv, download, saveToPhone } from '../src/lib/actions.ts'

const calls = { written: [], shared: [] }
setNative({
  writeCache: async (name, blob) => { calls.written.push({ name, type: blob.type }); return `file:///cache/${name}` },
  share: async (o) => { calls.shared.push(o) },
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
