# Pulse rename and new mark Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** The app is called Pulse everywhere a user reads it, and the D1 mark (a scan frame around a teal beat with people-dots) replaces the old icon on every surface.

**Architecture:** One TypeScript module, `src/lib/brandMark.ts`, holds the mark's geometry and builds SVG strings. The in-app `Logo` component reads it, and `scripts/make-icons.mjs` imports it (Node runs `.ts` directly, as the tests do) to render every PNG with `@resvg/resvg-js` and to write the SVG masters into `src/assets/brand/`. The rename is a text sweep, guarded by a test. Storage keys, the app ID and the backup's inner file name keep the old lowercase name.

**Tech Stack:** React 19 + TypeScript + Vite, Capacitor Android, Node 26 test runner (`node --test`, imports `.ts` directly), `@resvg/resvg-js` (new dev dependency, Mac only).

**Spec:** `docs/superpowers/specs/2026-10-06-pulse-brand-design.md`

**One deviation from the spec, on purpose:** the spec calls `pulse-mark.svg` the master. Here the master is the geometry in `src/lib/brandMark.ts`, and the `.svg` files are written from it by the script. Both the app and the icons then read one source, so the two can never drift apart.

## Global Constraints

- Brand name in the UI: "Pulse". Store/page title: "Pulse - Business Card Reader". Tagline: "The pulse of your network".
- Tile gradient #5A4FE0 → #3B2FC9 (top-left to bottom-right), rx 7.5 on a 32-unit grid; frame white, stroke 2; beat #5DD6C8, stroke 1.8; three white dots r 1.85 at (13.9, 11.9), (16.9, 20.7), (18.9, 15.5).
- Frame path `M6.5 11.5v-3a2 2 0 0 1 2-2h3M20.5 6.5h3a2 2 0 0 1 2 2v3M25.5 20.5v3a2 2 0 0 1-2 2h-3M11.5 25.5h-3a2 2 0 0 1-2-2v-3`; beat path `M9 16.5h3l1.9-4.6 3 8.8 2-5.2 1.3 1h3.8`.
- These keep their names: app ID `in.cardpulse.app`, the custom URL scheme, the Android namespace and Java package, every `cardpulse.*` localStorage key, the IndexedDB names, `cardpulse-backup.json` inside the zip and its `app: 'cardpulse'` marker, the Worker `cardpulse-api`, the Supabase names.
- The adaptive icon background is flat #3B2FC9. The splash ground is #F4F4FA (light) and #0F0F17 (dark).
- Don't launch a browser or emulator to check things: the user checks the APK on the phone.

## Review Focus

- The launcher's circle or squircle mask clipping the scan frame's corners. Test the artwork's reach against the 66 dp safe circle and the 80% maskable zone (Task 1).
- A backup made by the new version restoring on an old install, and the reverse. The inner `cardpulse-backup.json` and `app: 'cardpulse'` must stay (Task 4).
- The App Store rejecting the 1024 icon for having an alpha channel. Write it as RGB, without alpha, and test the PNG colour type (Task 2).
- Two `Logo`s on one screen sharing a gradient id, so one renders without its tile. Use a per-instance `useId` (Task 3).
- The Pulse Brief share text reading "via Pulse Pulse Brief" after a blind find-and-replace. Pin the exact credit line (Task 4).

---

### Task 1: The mark's geometry (`src/lib/brandMark.ts`)

**Files:**
- Create: `src/lib/brandMark.ts`
- Test: `test/brandmark.test.mjs`
- Modify: `package.json` (add `test/brandmark.test.mjs` to the `test` script)

**Interfaces:**
- Produces: `MARK` (geometry and colours), `ART_RADIUS: number`, `ADAPTIVE_SCALE: number`, `MASKABLE_ART: number`, `markSvg({ size, tile?, art? }): string`, `layerSvg({ size, mono? }): string`. Task 2 (script) and Task 3 (Logo) use these.

- [ ] **Step 1: Write the failing test**

```js
// Run: node --test test/brandmark.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MARK, ART_RADIUS, ADAPTIVE_SCALE, MASKABLE_ART, markSvg, layerSvg } from '../src/lib/brandMark.ts'

test('the mark is the agreed D1 geometry', () => {
  assert.equal(MARK.frame, 'M6.5 11.5v-3a2 2 0 0 1 2-2h3M20.5 6.5h3a2 2 0 0 1 2 2v3M25.5 20.5v3a2 2 0 0 1-2 2h-3M11.5 25.5h-3a2 2 0 0 1-2-2v-3')
  assert.equal(MARK.beat, 'M9 16.5h3l1.9-4.6 3 8.8 2-5.2 1.3 1h3.8')
  assert.deepEqual(MARK.dots, [[13.9, 11.9], [16.9, 20.7], [18.9, 15.5]])
  assert.equal(MARK.teal, '#5DD6C8')
})
test('the artwork stays inside the Android adaptive safe circle (66 dp of a 108 dp layer)', () => {
  assert.ok(ART_RADIUS * ADAPTIVE_SCALE <= 33, `${ART_RADIUS * ADAPTIVE_SCALE} > 33`)
})
test('the maskable PWA icon keeps the artwork inside the 80% safe zone', () => {
  assert.ok((ART_RADIUS * MASKABLE_ART) / 32 <= 0.4)
})
test('a tile SVG carries the size, the tile shape, the frame, the beat and three people', () => {
  const s = markSvg({ size: 48 })
  assert.match(s, /^<svg xmlns="http:\/\/www.w3.org\/2000\/svg" width="48" height="48" viewBox="0 0 32 32">/)
  assert.match(s, /<rect width="32" height="32" rx="7.5"/)
  assert.ok(s.includes(MARK.frame) && s.includes(MARK.beat))
  assert.equal(s.match(/<circle /g).length, 3)
  assert.match(markSvg({ size: 512, tile: 'square' }), /rx="0"/)
  assert.match(markSvg({ size: 48, tile: 'circle' }), /<circle cx="16" cy="16" r="16"/)
})
test('the adaptive layer has no tile and, for the themed icon, one colour', () => {
  const fg = layerSvg({ size: 432 })
  assert.match(fg, /viewBox="0 0 108 108"/)
  assert.ok(!fg.includes('<rect'))
  assert.ok(fg.includes(MARK.teal))
  const mono = layerSvg({ size: 432, mono: '#000000' })
  assert.ok(!mono.includes(MARK.teal) && !mono.includes('#FFFFFF'))
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/brandmark.test.mjs`
Expected: FAIL, cannot find module `src/lib/brandMark.ts`

- [ ] **Step 3: Write the module**

```ts
/**
 * The Pulse mark on a 32-unit grid: a scan frame around a beat whose peaks are people. The one source for the in-app
 * Logo and for scripts/make-icons.mjs, so the app icon and the logo inside the app cannot drift apart.
 */
export const MARK = {
  frame: 'M6.5 11.5v-3a2 2 0 0 1 2-2h3M20.5 6.5h3a2 2 0 0 1 2 2v3M25.5 20.5v3a2 2 0 0 1-2 2h-3M11.5 25.5h-3a2 2 0 0 1-2-2v-3',
  beat: 'M9 16.5h3l1.9-4.6 3 8.8 2-5.2 1.3 1h3.8',
  dots: [[13.9, 11.9], [16.9, 20.7], [18.9, 15.5]] as [number, number][],
  dotR: 1.85,
  frameW: 2,
  beatW: 1.8,
  rx: 7.5,
  indigoLite: '#5A4FE0',
  indigo: '#3B2FC9',
  teal: '#5DD6C8',
  white: '#FFFFFF',
}

/** Farthest reach of the artwork from the tile's centre (16,16): a frame corner's arc centre, its radius, half the stroke. */
export const ART_RADIUS = 7.5 * Math.SQRT2 + 2 + MARK.frameW / 2
/** Android adaptive layers are 108 dp, of which the launcher shows the middle 72: the 32-unit tile maps onto those 72. */
export const ADAPTIVE_SCALE = 72 / 32
/** The maskable PWA icon shrinks the artwork so it sits inside the 80% circle any mask keeps. */
export const MASKABLE_ART = 0.85

type Colours = { frame: string; beat: string; dots: string }
const COLOURS: Colours = { frame: MARK.white, beat: MARK.teal, dots: MARK.white }

const art = (c: Colours) =>
  `<path d="${MARK.frame}" fill="none" stroke="${c.frame}" stroke-width="${MARK.frameW}" stroke-linecap="round"/>` +
  `<path d="${MARK.beat}" fill="none" stroke="${c.beat}" stroke-width="${MARK.beatW}" stroke-linecap="round" stroke-linejoin="round"/>` +
  MARK.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${MARK.dotR}" fill="${c.dots}"/>`).join('')

/** The mark on its indigo tile. `square` is for the stores, which round icons themselves; `art` scales the artwork about the centre. */
export function markSvg({ size, tile = 'rounded', art: k = 1 }: { size: number; tile?: 'rounded' | 'square' | 'circle'; art?: number }): string {
  const shape = tile === 'circle'
    ? '<circle cx="16" cy="16" r="16" fill="url(#pulse-tile)"/>'
    : `<rect width="32" height="32" rx="${tile === 'rounded' ? MARK.rx : 0}" fill="url(#pulse-tile)"/>`
  const body = k === 1 ? art(COLOURS) : `<g transform="translate(16 16) scale(${k}) translate(-16 -16)">${art(COLOURS)}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    `<defs><linearGradient id="pulse-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MARK.indigoLite}"/><stop offset="1" stop-color="${MARK.indigo}"/></linearGradient></defs>` +
    `${shape}${body}</svg>`
}

/** An Android adaptive-icon layer: the artwork alone on a transparent 108 dp canvas. `mono` draws it in one colour for the themed icon. */
export function layerSvg({ size, mono }: { size: number; mono?: string }): string {
  const c = mono ? { frame: mono, beat: mono, dots: mono } : COLOURS
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">` +
    `<g transform="translate(18 18) scale(${ADAPTIVE_SCALE})">${art(c)}</g></svg>`
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `node --test test/brandmark.test.mjs`
Expected: PASS, 5 tests. (ART_RADIUS ≈ 13.61; × 2.25 ≈ 30.6 ≤ 33; × 0.85 / 32 ≈ 0.36 ≤ 0.4.)

- [ ] **Step 5: Add it to `npm test` and commit**

In `package.json`, add ` test/brandmark.test.mjs` to the `test` script, just before ` server/test/worker.test.mjs`.

```bash
git add src/lib/brandMark.ts test/brandmark.test.mjs package.json
git commit -m "The Pulse mark as one geometry module: scan frame, teal beat, three people; the artwork stays inside the adaptive and maskable safe zones"
```

---

### Task 2: Render every icon and splash from the mark

**Files:**
- Rewrite: `scripts/make-icons.mjs`
- Create (generated): `src/assets/brand/pulse-mark.svg`, `pulse-mark-square.svg`, `pulse-foreground.svg`, `pulse-monochrome.svg`; `store/play-icon-512.png`, `store/appstore-icon-1024.png`, `store/preview.png`
- Regenerate: `public/{favicon,apple-touch-icon,pwa-192x192,pwa-512x512,pwa-maskable-512x512}.png`; `android/app/src/main/res/mipmap-{mdpi,hdpi,xhdpi,xxhdpi,xxxhdpi}/ic_launcher{,_round,_foreground,_monochrome}.png`; `android/app/src/main/res/drawable{,-port-*,-land-*}/splash.png` and the new `drawable-night{,-port-*,-land-*}/splash.png`
- Modify: `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml`, `ic_launcher_round.xml`; `android/app/src/main/res/values/ic_launcher_background.xml`; `android/app/src/main/res/values/styles.xml`
- Create: `android/app/src/main/res/values/splash_ground.xml`, `android/app/src/main/res/values-night/splash_ground.xml`
- Modify: `package.json` (dev dependency, `icons` script, test list)
- Test: `test/icons.test.mjs`

**Interfaces:**
- Consumes: `MARK`, `MASKABLE_ART`, `markSvg`, `layerSvg` from Task 1.
- Produces: the files above. Nothing in code imports them; Android and the PWA pick them up by path.

- [ ] **Step 1: Install the renderer**

Run: `npm install --save-dev @resvg/resvg-js`
Expected: added to `devDependencies`. Check with `node -e "require('@resvg/resvg-js')"` (no output means it loaded).

- [ ] **Step 2: Write the failing test**

```js
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
    assert.deepEqual(Object.values(head(`${RES}/drawable${night}/splash.png`)).slice(0, 2), [480, 320])
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
```

- [ ] **Step 3: Run it to make sure it fails**

Run: `node --test test/icons.test.mjs`
Expected: FAIL, no `ic_launcher_monochrome.png` (and the old icons have the wrong sizes or files).

- [ ] **Step 4: Rewrite `scripts/make-icons.mjs`**

```js
// Renders every Pulse icon and splash from the one mark in src/lib/brandMark.ts. Run: npm run icons
// Output is committed; the app build never runs this.
import { Resvg } from '@resvg/resvg-js'
import { deflateSync } from 'node:zlib'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { MARK, MASKABLE_ART, markSvg, layerSvg } from '../src/lib/brandMark.ts'

const RES = 'android/app/src/main/res'
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }
const GROUND = { '': '#F4F4FA', '-night': '#0F0F17' }

const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data) }
const render = (svg) => new Resvg(svg, { fitTo: { mode: 'original' } }).render()
const png = (path, svg) => write(path, render(svg).asPng())
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

// PNG without alpha (colour type 2), for the App Store icon: Apple rejects icons that have an alpha channel
function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 } return ~c >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}
function rgbPng(path, svg) {
  const img = render(svg), w = img.width, h = img.height, px = img.pixels
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = px[(y * w + x) * 4 + c]
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  write(path, Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))]))
}

/** The mark centred on a flat ground, about a quarter of the short side wide. */
function splashSvg(w, h, ground) {
  const m = Math.round(Math.min(w, h) * 0.28)
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}"><rect width="${w}" height="${h}" fill="${ground}"/>` +
    markSvg({ size: m }).replace('<svg ', `<svg x="${(w - m) / 2}" y="${(h - m) / 2}" `) + '</svg>'
}

// SVG masters, for design tools and the store listing work in part 3
write('src/assets/brand/pulse-mark.svg', markSvg({ size: 512 }))
write('src/assets/brand/pulse-mark-square.svg', markSvg({ size: 512, tile: 'square' }))
write('src/assets/brand/pulse-foreground.svg', layerSvg({ size: 432 }))
write('src/assets/brand/pulse-monochrome.svg', layerSvg({ size: 432, mono: '#000000' }))

// Web
png('public/favicon.png', markSvg({ size: 64 }))
png('public/apple-touch-icon.png', markSvg({ size: 180, tile: 'square' }))
png('public/pwa-192x192.png', markSvg({ size: 192 }))
png('public/pwa-512x512.png', markSvg({ size: 512 }))
png('public/pwa-maskable-512x512.png', markSvg({ size: 512, tile: 'square', art: MASKABLE_ART }))

// Android launcher: legacy tiles, and the adaptive foreground and themed layers (the background is a colour)
for (const [d, k] of Object.entries(DENSITY)) {
  png(`${RES}/mipmap-${d}/ic_launcher.png`, markSvg({ size: 48 * k }))
  png(`${RES}/mipmap-${d}/ic_launcher_round.png`, markSvg({ size: 48 * k, tile: 'circle' }))
  png(`${RES}/mipmap-${d}/ic_launcher_foreground.png`, layerSvg({ size: 108 * k }))
  png(`${RES}/mipmap-${d}/ic_launcher_monochrome.png`, layerSvg({ size: 108 * k, mono: '#FFFFFF' }))
}

// Android splash, light and dark
for (const [night, ground] of Object.entries(GROUND)) {
  png(`${RES}/drawable${night}/splash.png`, splashSvg(480, 320, ground))
  for (const [d, [w, h]] of Object.entries(SPLASH)) {
    png(`${RES}/drawable-port${night}-${d}/splash.png`, splashSvg(w, h, ground))
    png(`${RES}/drawable-land${night}-${d}/splash.png`, splashSvg(h, w, ground))
  }
}

// Store icons: square, the stores round them
png('store/play-icon-512.png', markSvg({ size: 512, tile: 'square' }))
rgbPng('store/appstore-icon-1024.png', markSvg({ size: 1024, tile: 'square' }))

// A contact sheet to review before building the APK: sizes, launcher masks, themed icon, both grounds
let n = 0
function adaptive(size, shape, themed) {
  const id = `m${n++}`
  const clip = shape === 'circle' ? '<circle cx="54" cy="54" r="36"/>' : '<rect x="18" y="18" width="72" height="72" rx="22"/>'
  const layer = inner(layerSvg({ size: 108, mono: themed ? MARK.indigo : undefined }))
  return `<svg width="${size}" height="${size}" viewBox="18 18 72 72"><defs><clipPath id="${id}">${clip}</clipPath></defs>` +
    `<g clip-path="url(#${id})"><rect width="108" height="108" fill="${themed ? '#E6E2F8' : MARK.indigo}"/>${layer}</g></svg>`
}
const at = (x, y, svg) => svg.replace('<svg ', `<svg x="${x}" y="${y}" `)
const row = (y, ground) => [
  `<rect x="0" y="${y}" width="880" height="200" fill="${ground}"/>`,
  at(30, y + 52, markSvg({ size: 96 })), at(150, y + 76, markSvg({ size: 48 })), at(220, y + 88, markSvg({ size: 24 })),
  at(280, y + 52, adaptive(96, 'circle')), at(400, y + 52, adaptive(96, 'squircle')),
  at(520, y + 52, adaptive(96, 'circle', true)), at(640, y + 52, adaptive(96, 'squircle', true)),
  at(760, y + 52, markSvg({ size: 96, tile: 'square', art: MASKABLE_ART })),
].join('')
png('store/preview.png', `<svg xmlns="http://www.w3.org/2000/svg" width="880" height="400" viewBox="0 0 880 400">${row(0, GROUND[''])}${row(200, GROUND['-night'])}</svg>`)

console.log('Icons written.')
```

- [ ] **Step 5: Point Android at the new layers and grounds**

`android/app/src/main/res/mipmap-anydpi-v26/ic_launcher.xml` and `ic_launcher_round.xml` (same content in both):

```xml
<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@color/ic_launcher_background"/>
    <foreground android:drawable="@mipmap/ic_launcher_foreground"/>
    <monochrome android:drawable="@mipmap/ic_launcher_monochrome"/>
</adaptive-icon>
```

`android/app/src/main/res/values/ic_launcher_background.xml`: change `#FFFFFF` to `#3B2FC9`.

`android/app/src/main/res/values/splash_ground.xml`:

```xml
<?xml version="1.0" encoding="utf-8"?>
<resources>
    <!-- Android 12+ splash: the app's light ground; values-night holds the dark one -->
    <color name="splash_ground">#F4F4FA</color>
</resources>
```

`android/app/src/main/res/values-night/splash_ground.xml`: the same file with `#0F0F17`.

In `android/app/src/main/res/values/styles.xml`, inside `AppTheme.NoActionBarLaunch`, after the `android:background` item:

```xml
        <item name="windowSplashScreenBackground">@color/splash_ground</item>
```

- [ ] **Step 6: Add the script, generate, run the test**

In `package.json` scripts add `"icons": "node scripts/make-icons.mjs",` after `"test:db"`, and add ` test/icons.test.mjs` to the `test` script after `test/brandmark.test.mjs`.

Run: `npm run icons && node --test test/icons.test.mjs`
Expected: "Icons written." then PASS, 4 tests.

- [ ] **Step 7: Look at the contact sheet**

Open `store/preview.png` with the Read tool. Check that nothing is clipped in the circle and squircle masks, that the themed icon reads clearly, that the 24 px mark still shows three dots, and that the mark shows on both grounds. If something is clipped, fix it in `brandMark.ts` (Task 1's tests must still pass), regenerate, and look again. Then show the user the preview and wait for their OK before you commit.

- [ ] **Step 8: Commit**

```bash
git add scripts/make-icons.mjs src/assets/brand store public/*.png android/app/src/main/res package.json package-lock.json test/icons.test.mjs
git commit -m "Every icon from the Pulse mark: Android launcher with a themed layer on an indigo background, splash in light and dark, web icons, Play 512 and App Store 1024 (RGB, no alpha), and a preview sheet; npm run icons"
```

---

### Task 3: The in-app logo

**Files:**
- Rewrite: `src/components/Logo.tsx`

**Interfaces:**
- Consumes: `MARK` from Task 1 (import `'../lib/brandMark'`).
- Produces: `Logo({ size?, tone? })`, the same props as today, so Home, Settings and PublicCard need no change.

- [ ] **Step 1: Rewrite the component**

```tsx
import { useId } from 'react'
import { MARK } from '../lib/brandMark'

/**
 * Brand mark: a scan frame around a beat whose peaks are people, the same geometry as the app icon (lib/brandMark).
 * The tile follows the accent colour. `light` is for indigo ground (the Home masthead): a translucent white tile instead
 * of the indigo one, so the mark does not vanish into its own colour.
 */
export default function Logo({ size = 28, tone = 'brand' }: { size?: number; tone?: 'brand' | 'light' }) {
  // One gradient id per logo: two logos on a screen sharing one id can lose a tile when the first unmounts
  const id = `pulse-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const light = tone === 'light'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--brand-base) 82%, white)' }} /><stop offset="1" style={{ stopColor: 'var(--brand-base)' }} /></linearGradient>
      </defs>
      <rect width="32" height="32" rx={MARK.rx} fill={light ? 'rgba(255,255,255,.16)' : `url(#${id})`} />
      <path d={MARK.frame} fill="none" stroke="#fff" strokeWidth={MARK.frameW} strokeLinecap="round" />
      <path d={MARK.beat} fill="none" stroke={MARK.teal} strokeWidth={MARK.beatW} strokeLinecap="round" strokeLinejoin="round" />
      {MARK.dots.map(([cx, cy]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={MARK.dotR} fill="#fff" />)}
    </svg>
  )
}
```

- [ ] **Step 2: Type-check and build**

Run: `npm run build`
Expected: succeeds with no TypeScript errors.

- [ ] **Step 3: Commit**

```bash
git add src/components/Logo.tsx
git commit -m "The logo inside the app is the Pulse mark, drawn from the same geometry as the app icon; it follows the accent colour and keeps its light tone on the masthead"
```

---

### Task 4: Rename CardPulse to Pulse wherever users read it

**Files:**
- Test: `test/brand.test.mjs` (new); modify `test/backup.test.mjs`, `test/brief.test.mjs`, `test/feedback.test.mjs`
- Modify: `capacitor.config.ts`, `android/app/src/main/res/values/strings.xml`, `index.html`, `vite.config.ts`, `public/privacy.html`, `server/worker.ts`, `server/README.md`, `server/dev-server.mjs`, `android/app/src/main/java/in/cardpulse/app/SaveContactPlugin.java` (comment), and in `src/`: `styles.css`, `components/{QrResult,Dictation,PublicCard,AccountSection,Home,SettingsPage,QrScanner,ErrorBoundary}.tsx`, `lib/{speech,qrcontact,followups,zip,brief,platform,backup,feedback,db}.ts`
- Modify: `package.json` (test list)

**Interfaces:**
- Produces: `backupFileName(now)` now returns `pulse-backup-YYYY-MM-DD.zip`. Nothing else changes signature.

- [ ] **Step 1: Write the failing tests**

`test/brand.test.mjs`:

```js
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
]

test('no file users read from says CardPulse', () => {
  const hits = FILES.flatMap((f) => read(f).split('\n').flatMap((l, i) => (/CardPulse/.test(l) ? [`${f}:${i + 1}`] : [])))
  assert.deepEqual(hits, [])
})
test('the app is named Pulse on the phone, in the browser and in the store title', () => {
  assert.match(read('capacitor.config.ts'), /appName: 'Pulse'/)
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="app_name">Pulse<\/string>/)
  assert.match(read('index.html'), /<title>Pulse - Business Card Reader<\/title>/)
  assert.match(read('vite.config.ts'), /name: 'Pulse - Business Card Reader'/)
  assert.match(read('vite.config.ts'), /short_name: 'Pulse'/)
})
test('exports are named for Pulse', () => {
  const s = read('src/components/SettingsPage.tsx')
  assert.ok(s.includes('pulse-contacts-') && !s.includes('cardpulse-contacts-'))
})
test('identifiers that hold data keep the old name', () => {
  assert.match(read('capacitor.config.ts'), /appId: 'in\.cardpulse\.app'/)
  assert.match(read('android/app/src/main/res/values/strings.xml'), /<string name="package_name">in\.cardpulse\.app<\/string>/)
})
```

In `test/backup.test.mjs`: add `backupFileName` to the import from `'../src/lib/backup.ts'`, change both `/not a CardPulse backup/` to `/not a Pulse backup/`, and add:

```js
test('the backup file is named for Pulse, but keeps cardpulse-backup.json inside so old and new installs read each other', async () => {
  assert.equal(backupFileName(Date.UTC(2026, 9, 6, 12)), 'pulse-backup-2026-10-06.zip')
  const files = await readZip(await buildBackup([], [], 1_700_000_000_000))
  const main = files.find((f) => f.name === 'cardpulse-backup.json')
  assert.ok(main)
  assert.equal(JSON.parse(await text(main)).app, 'cardpulse')
})
```

In `test/brief.test.mjs` line 33: `'Sources: indiamart.com, vivacitygroup.in\nvia Pulse Brief',`

In `test/feedback.test.mjs` line 14: `'CardPulse v1.2.0 (installed)'` → `'Pulse v1.2.0 (installed)'`.

Add ` test/brand.test.mjs` to the `test` script in `package.json`, after `test/icons.test.mjs`.

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/brand.test.mjs test/backup.test.mjs test/brief.test.mjs test/feedback.test.mjs`
Expected: FAIL. brand lists about 40 `file:line` hits; backup, brief and feedback fail on the old wording.

- [ ] **Step 3: Rename the app's own names**

- `capacitor.config.ts`: `appName: 'Pulse',`
- `strings.xml`: `app_name` and `title_activity_main` → `Pulse` (`package_name` and `custom_url_scheme` stay).
- `index.html`:
  - `<title>Pulse - Business Card Reader</title>`
  - `<meta name="description" content="Pulse is a business card reader and card scanner: scan several business cards in one photo, file them by expo or exhibition, and call or WhatsApp the people. The pulse of your network." />`
  - `apple-mobile-web-app-title` → `Pulse`
  - `<noscript>Pulse needs JavaScript to run.</noscript>`
- `vite.config.ts` manifest:
  - `name: 'Pulse - Business Card Reader'`
  - `short_name: 'Pulse'`
  - `description: 'Business card reader and card scanner: several cards per photo, built for expos and exhibitions.'`
  - `theme_color: '#3B2FC9'`

- [ ] **Step 4: Rename the text in `src/`, the server and Android**

Change every line `grep -rn "CardPulse" src server/worker.ts server/README.md server/dev-server.mjs android/app/src/main/java` lists. Change these exactly; everywhere else (comments) "CardPulse" simply becomes "Pulse":

| File | New text |
|---|---|
| `lib/brief.ts:38` | `` `…via Pulse Brief` `` (not "Pulse Pulse Brief") |
| `lib/backup.ts:34,37` | `'This is not a Pulse backup file.'` (keep `manifest.app !== 'cardpulse'` and `'cardpulse-backup.json'` exactly) |
| `lib/backup.ts:38` | `'This backup was made by a newer version of Pulse. Update the app and try again.'` |
| `lib/backup.ts:83` | `` `pulse-backup-${…}.zip` `` |
| `lib/backup.ts:92` | `title: 'Pulse backup'` |
| `lib/zip.ts:71,87` | `'This is not a Pulse backup file.'`, `'This backup uses compression that Pulse cannot open.'` |
| `lib/feedback.ts:26,42,45` | `App: Pulse v…`, `'Pulse feedback'` (both) |
| `lib/followups.ts:117` | `'PRODID:-//Pulse//Follow-up//EN'` |
| `lib/speech.ts:52` | `'…Allow it in Settings, Apps, Pulse, Permissions.'` |
| `components/QrResult.tsx:44` | `'This is a Pulse card link. Connect to the internet to open it.'` |
| `components/PublicCard.tsx:144` | `<span>Made with Pulse</span>` |
| `components/AccountSection.tsx:42` | `'Everything Pulse keeps for your account…'` |
| `components/AccountSection.tsx:76` | `…kept in Pulse's cloud under…` |
| `components/Home.tsx:141` | `<Logo size={24} tone="light" />Pulse` |
| `components/Home.tsx:193` | `<strong>Install Pulse</strong>` |
| `components/SettingsPage.tsx:130` | `'Add Pulse to your home screen'` |
| `components/SettingsPage.tsx:204` | `<span>Pulse v{__APP_VERSION__}</span>` |
| `components/SettingsPage.tsx:208,210` | `` `pulse-contacts-${stamp}.csv` ``, `` `pulse-contacts-${stamp}.vcf` `` |
| `components/ErrorBoundary.tsx:13` | `Reload Pulse` |
| `styles.css:2` | `Pulse — interface system: the trading desk` |
| `server/worker.ts:1` | `// Pulse API — a thin, locked-down proxy in front of Gemini.` |
| `server/README.md:1` | `# Pulse API` |
| `server/dev-server.mjs:21` | `` `Pulse API on http://localhost:…` `` |

- [ ] **Step 5: Rename the privacy page**

In `public/privacy.html`, replace every "CardPulse" with "Pulse". The title becomes `<title>Pulse — Privacy policy</title>`. Leave the "Last updated" date as it is: the policy's terms haven't changed, only the name.

- [ ] **Step 6: Run the tests**

Run: `npm test`
Expected: all pass, the new brand, backup, brandmark and icons tests included.

- [ ] **Step 7: Build and commit**

Run: `npm run build`
Expected: succeeds.

```bash
git add -A src server/worker.ts server/README.md server/dev-server.mjs android/app/src/main/java android/app/src/main/res/values/strings.xml capacitor.config.ts index.html vite.config.ts public/privacy.html test package.json
git commit -m "CardPulse is now Pulse wherever people read it: the name under the icon, the title (Pulse - Business Card Reader), the masthead, messages, the privacy policy, exports and backups (pulse-…); storage keys, the app ID and the backup's inner file keep the old name, so nothing is lost and old backups still restore"
```

---

### Task 5: Docs and the phone build

**Files:**
- Modify: `PRODUCT.md`, `DESIGN.md`, `README.md`, `ROADMAP.md`

- [ ] **Step 1: Update the docs**

- `DESIGN.md` front matter: `name: Pulse`, and description `Pulse (store: "Pulse - Business Card Reader"), a business-card scanner and digital card, laid out as a trading desk where contacts read like a watchlist`. Add a "Mark" section: the D1 geometry, its colours, where it is defined (`src/lib/brandMark.ts`), `npm run icons`, and the tagline "The pulse of your network".
- `PRODUCT.md`: add a line under the title saying the product is called Pulse (store title "Pulse - Business Card Reader", tagline "The pulse of your network"), renamed from CardPulse on 2026-10-06; target searches: business card reader, card scanner, card reader, expo, exhibition.
- `README.md`: the title and first line say Pulse; add `npm run icons` to the commands.
- `ROADMAP.md`: record the rebrand plan: part 1 (rename and mark) done on `pulse-brand`; parts 2 to 4 (welcome and tips, SEO and store listing, native IAP) to come.

- [ ] **Step 2: Full verification**

Run: `npm test && npm run build && npm run build:android`
Expected: tests pass, the web build succeeds, Gradle prints `BUILD SUCCESSFUL`, and the APK is at `android/app/build/outputs/apk/debug/app-debug.apk`.

- [ ] **Step 3: Commit**

```bash
git add PRODUCT.md DESIGN.md README.md ROADMAP.md
git commit -m "Docs: the product is Pulse (Pulse - Business Card Reader, the pulse of your network); the mark and npm run icons in DESIGN.md; the rebrand's four parts in the roadmap"
```

- [ ] **Step 4: Hand the phone check to the user**

Give the user `npm run apk:install` and this checklist. Don't run an emulator or browser yourself.

1. The home-screen icon: the scan frame, teal beat and dots on indigo, nothing clipped. Also check it in the app drawer.
2. The name under the icon is "Pulse".
3. With themed icons on (long-press the home screen, Wallpaper & style, Themed icons), the icon turns into a single-colour version.
4. Opening the app: the splash shows the mark on a light ground (and on a dark ground with the phone in dark mode).
5. The Home masthead shows the new mark and "Pulse". Settings' footer reads "Pulse v…".
6. Export contacts as CSV: the file is named `pulse-contacts-…`. A backup is named `pulse-backup-…zip`, and it restores.
