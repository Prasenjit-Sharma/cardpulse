// Run: node --test test/icons.test.mjs   (after `npm run icons`)
// Every icon and splash the app and the stores need is there, at its size.
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'

const RES = 'android/app/src/main/res'
const head = (f) => { const b = readFileSync(f); assert.equal(b.toString('latin1', 1, 4), 'PNG', f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] } }
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }

test('web icons', () => {
  for (const [f, s] of [['favicon.png', 64], ['apple-touch-icon.png', 180], ['pwa-192x192.png', 192], ['pwa-512x512.png', 512], ['pwa-maskable-512x512.png', 512]]) {
    const { w, h } = head(`public/${f}`); assert.deepEqual([w, h], [s, s], f)
  }
})
test('Android launcher icons at every density, themed layer included', () => {
  for (const [d, k] of Object.entries(DENSITY)) {
    for (const n of ['ic_launcher', 'ic_launcher_round']) assert.equal(head(`${RES}/mipmap-${d}/${n}.png`).w, 48 * k)
    for (const n of ['ic_launcher_foreground', 'ic_launcher_monochrome']) assert.equal(head(`${RES}/mipmap-${d}/${n}.png`).w, 108 * k)
  }
  for (const f of ['ic_launcher.xml', 'ic_launcher_round.xml']) assert.match(readFileSync(`${RES}/mipmap-anydpi-v26/${f}`, 'utf8'), /<monochrome android:drawable="@mipmap\/ic_launcher_monochrome"\/>/)
  assert.match(readFileSync(`${RES}/values/ic_launcher_background.xml`, 'utf8'), /#3B2FC9/)
})
test('splash screens, light and dark, portrait and landscape', () => {
  for (const night of ['', '-night']) {
    const base = head(`${RES}/drawable${night}/splash.png`); assert.deepEqual([base.w, base.h], [480, 320])
    for (const [d, [w, h]] of Object.entries(SPLASH)) {
      const p = head(`${RES}/drawable-port${night}-${d}/splash.png`); assert.deepEqual([p.w, p.h], [w, h])
      const l = head(`${RES}/drawable-land${night}-${d}/splash.png`); assert.deepEqual([l.w, l.h], [h, w])
    }
  }
  assert.match(readFileSync(`${RES}/values/splash_ground.xml`, 'utf8'), /#F4F4FA/)
  assert.match(readFileSync(`${RES}/values-night/splash_ground.xml`, 'utf8'), /#0F0F17/)
  assert.match(readFileSync(`${RES}/values/styles.xml`, 'utf8'), /<item name="windowSplashScreenBackground">@color\/splash_ground<\/item>/)
})
test('store icons: Play 512, App Store 1024 with no alpha channel (Apple rejects one)', () => {
  assert.equal(head('store/play-icon-512.png').w, 512)
  const a = head('store/appstore-icon-1024.png')
  assert.equal(a.w, 1024)
  assert.equal(a.type, 2, 'colour type 2 = RGB, no alpha')
})
