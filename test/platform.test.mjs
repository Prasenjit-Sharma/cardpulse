// Run: node --test test/platform.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { authCodeFromUrl, cacheName, detectApp, makeAppNav, publicBaseFor, statusBarIcons } from '../src/lib/platform.ts'

test('the app is detected only through Capacitor', () => {
  assert.equal(detectApp(undefined), false)
  assert.equal(detectApp({}), false)
  assert.equal(detectApp({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(detectApp({ Capacitor: { isNativePlatform: () => true } }), true)
})

test('public links: the page itself in a browser, the Pages address in the app', () => {
  const loc = { origin: 'https://prasenjit-sharma.github.io', pathname: '/cardpulse/' }
  assert.equal(publicBaseFor(false, loc, undefined), 'https://prasenjit-sharma.github.io/cardpulse/')
  const app = { origin: 'https://localhost', pathname: '/' }
  assert.equal(publicBaseFor(true, app, 'https://prasenjit-sharma.github.io/cardpulse/'), 'https://prasenjit-sharma.github.io/cardpulse/')
  assert.equal(publicBaseFor(true, app, 'https://prasenjit-sharma.github.io/cardpulse'), 'https://prasenjit-sharma.github.io/cardpulse/')   // slash added
  assert.throws(() => publicBaseFor(true, app, undefined), /VITE_PUBLIC_URL/)                         // never silently localhost
})

test('cache file names are safe but still readable', () => {
  assert.equal(cacheName('Rajesh Shah.vcf'), 'Rajesh_Shah.vcf')
  assert.equal(cacheName('राजेश शाह.vcf'), 'राजेश_शाह.vcf')
  assert.equal(cacheName('a/b\\c:d?.csv'), 'a_b_c_d_.csv')
  assert.equal(cacheName('.vcf'), 'file.vcf')
})

function fakeNative({ cancel = false } = {}) {
  const calls = { written: [], shared: [] }
  return {
    calls,
    n: {
      writeCache: async (name, blob) => { calls.written.push({ name, size: blob.size }); return `file:///cache/${name}` },
      share: async (o) => { if (cancel) throw new Error('Share canceled'); calls.shared.push(o) },
    },
  }
}

test('app share: files are written to the cache and handed to the share sheet together', async () => {
  const { n, calls } = fakeNative()
  const nav = makeAppNav(n)
  assert.equal(nav.canShare({ files: [new File(['x'], 'a.vcf')] }), true)
  await nav.share({ title: 'Rajesh', text: 'hello', files: [new File(['BEGIN:VCARD'], 'Rajesh Shah.vcf', { type: 'text/x-vcard' })] })
  assert.deepEqual(calls.written.map((w) => w.name), ['Rajesh_Shah.vcf'])
  assert.deepEqual(calls.shared, [{ title: 'Rajesh', text: 'hello', files: ['file:///cache/Rajesh_Shah.vcf'] }])
})

test('app share: text alone goes straight to the share sheet', async () => {
  const { n, calls } = fakeNative()
  await makeAppNav(n).share({ title: 'Feedback', text: 'It works' })
  assert.equal(calls.written.length, 0)
  assert.deepEqual(calls.shared, [{ title: 'Feedback', text: 'It works', files: undefined }])
})

test('app share: closing the share sheet is a cancel (AbortError), like the browser', async () => {
  const { n } = fakeNative({ cancel: true })
  await assert.rejects(makeAppNav(n).share({ text: 'x' }), (e) => e.name === 'AbortError')
})

test('sign-in return: only our own callback with a code is exchanged', () => {
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback?code=abc123'), 'abc123')
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback?error=access_denied&error_description=cancelled'), null)
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback'), null)
  assert.equal(authCodeFromUrl('in.cardpulse.app://something-else?code=abc'), null)
  assert.equal(authCodeFromUrl('https://evil.example/auth/callback?code=abc'), null)
  assert.equal(authCodeFromUrl('not a url'), null)
})

test('status bar icons: light on indigo, the camera and dark mode; dark on the light wash', () => {
  assert.equal(statusBarIcons({ deepTop: true, dark: false, camera: false }), 'light')    // Home, Contacts, Events, My Card
  assert.equal(statusBarIcons({ deepTop: false, dark: false, camera: false }), 'dark')    // Insights, a contact, Settings
  assert.equal(statusBarIcons({ deepTop: false, dark: true, camera: false }), 'light')
  assert.equal(statusBarIcons({ deepTop: false, dark: false, camera: true }), 'light')
})
