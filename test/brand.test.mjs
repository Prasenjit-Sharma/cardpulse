// Run: node --test test/brand.test.mjs
// The app is called Pulse. The old name may survive only in identifiers users never see (storage keys, the app ID,
// the backup's inner file), and all of those are lowercase "cardpulse".
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync, readdirSync, statSync } from 'node:fs'
import { join } from 'node:path'

const walk = (dir) => readdirSync(dir).flatMap((n) => { const p = join(dir, n); return statSync(p).isDirectory() ? walk(p) : [p] })
const read = (f) => readFileSync(f, 'utf8')
const FILES = [
  ...walk('src').filter((p) => /\.(ts|tsx|css)$/.test(p)),
  'index.html', 'vite.config.ts', 'capacitor.config.ts', 'public/privacy.html',
  'android/app/src/main/res/values/strings.xml', 'server/worker.ts',
  ...walk('shared').filter((p) => p.endsWith('.ts')),
  ...walk('android/app/src/main/java').filter((p) => p.endsWith('.java')),
  'android/app/src/main/AndroidManifest.xml',
]

test('no file users read from says CardPulse', () => {
  const hits = FILES.flatMap((f) => read(f).split('\n').flatMap((l, i) => (/CardPulse/.test(l) ? [`${f}:${i + 1}`] : [])))
  assert.deepEqual(hits, [])
})
test('the app is named Pulse on the phone, in the browser and in the store title', () => {
  assert.match(read('capacitor.config.ts'), /appName: 'Pulse'/)
  // each build names itself in build.gradle: the store app Pulse, the others Pulse Dev / Pulse Staging
  assert.match(read('android/app/build.gradle'), /prod \{[^}]*resValue "string", "app_name", "Pulse"/)
  assert.match(read('index.html'), /<title>Pulse - Business Card Reader<\/title>/)
  assert.match(read('vite.config.ts'), /name: 'Pulse - Business Card Reader'/)
  assert.match(read('vite.config.ts'), /short_name: 'Pulse'/)
})
test('exports are named for Pulse', () => {
  const s = read('src/components/SettingsPage.tsx')
  assert.ok(s.includes('pulse-contacts-') && !s.includes('cardpulse-contacts-'))
})
test('the app id is in.pulsecardscanner.app (decided 2026-10-10), with .dev and .staging builds; the old id lives on only as the legacy build', () => {
  assert.match(read('capacitor.config.ts'), /appId: 'in\.pulsecardscanner\.app'/)
  const g = read('android/app/build.gradle')
  assert.match(g, /applicationId "in\.pulsecardscanner\.app"/)
  assert.match(g, /dev \{[^}]*applicationIdSuffix "\.dev"/)
  assert.match(g, /staging \{[^}]*applicationIdSuffix "\.staging"/)
  assert.match(g, /legacy \{[^}]*applicationId "in\.cardpulse\.app"/)
  assert.match(read('android/app/src/main/AndroidManifest.xml'), /android:scheme="\$\{applicationId\}"/, 'sign-in returns to whichever build started it')
  for (const [mode, id] of [['dev', 'in.pulsecardscanner.app.dev'], ['staging', 'in.pulsecardscanner.app.staging'], ['prod', 'in.pulsecardscanner.app']]) {
    assert.match(read(`.env.${mode}`), new RegExp(`VITE_APP_ID=${id.replace(/\./g, '\\.')}\n`), `.env.${mode} matches its Android build`)
  }
})
