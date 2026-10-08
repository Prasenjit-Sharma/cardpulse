// Renders every Pulse icon and splash from the one mark in src/lib/brandMark.ts. Run: npm run icons
// Output is committed; the app build never runs this.
import { Resvg } from '@resvg/resvg-js'
import { mkdirSync, writeFileSync } from 'node:fs'
import { dirname } from 'node:path'
import { rgbFromSvg } from './png.mjs'
import { ADAPTIVE_SCALE, MARK, MASKABLE_ART, markSvg, layerSvg } from '../src/lib/brandMark.ts'

const RES = 'android/app/src/main/res'
const DENSITY = { mdpi: 1, hdpi: 1.5, xhdpi: 2, xxhdpi: 3, xxxhdpi: 4 }
const SPLASH = { mdpi: [320, 480], hdpi: [480, 800], xhdpi: [720, 1280], xxhdpi: [960, 1600], xxxhdpi: [1280, 1920] }
const GROUND = { '': '#F4F4FA', '-night': '#0F0F17' }   // the app's own grounds, for the preview sheet
const SPLASH_GROUND = { '': ['#4A3FDA', '#2A1F9E'], '-night': ['#2A1F9E', '#15104F'] }   // indigo, light and dark

const write = (path, data) => { mkdirSync(dirname(path), { recursive: true }); writeFileSync(path, data) }
const render = (svg) => new Resvg(svg, { fitTo: { mode: 'original' } }).render()
const png = (path, svg) => write(path, render(svg).asPng())
const inner = (svg) => svg.replace(/^<svg[^>]*>/, '').replace(/<\/svg>$/, '')

// the App Store icon has no alpha channel: Apple rejects icons that have one (scripts/png.mjs)
const rgbPng = (path, svg) => write(path, rgbFromSvg(svg))

/** The mark alone (white frame, teal beat, people) centred on an indigo gradient: on indigo the tile would vanish. */
function splashSvg(w, h, [from, to]) {
  const m = Math.round(Math.min(w, h) * 0.42)   // the layer's 108 units hold the art in the middle 72
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${from}"/><stop offset="1" stop-color="${to}"/></linearGradient></defs>` +
    `<rect width="${w}" height="${h}" fill="url(#g)"/>` +
    layerSvg({ size: m }).replace('<svg ', `<svg x="${(w - m) / 2}" y="${(h - m) / 2}" `) + '</svg>'
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

// Android splash (11 and older; 12+ draws its own from splash_ground and the foreground layer), light and dark
for (const [night, ground] of Object.entries(SPLASH_GROUND)) {
  png(`${RES}/drawable${night}/splash.png`, splashSvg(480, 320, ground))
  for (const [d, [w, h]] of Object.entries(SPLASH)) {
    png(`${RES}/drawable-port${night}-${d}/splash.png`, splashSvg(w, h, ground))
    png(`${RES}/drawable-land${night}-${d}/splash.png`, splashSvg(h, w, ground))
  }
}

// Android 12+ splash icon, animated: the beat draws itself, the three people pop in, then the mark beats once (lub-dub).
// The system plays it on the indigo ground (splash_ground) for at most a second.
const A = 'xmlns:android="http://schemas.android.com/apk/res/android" xmlns:aapt="http://schemas.android.com/aapt"'
const circle = ([x, y]) => `M${x - MARK.dotR},${y} a${MARK.dotR},${MARK.dotR} 0 1,0 ${MARK.dotR * 2},0 a${MARK.dotR},${MARK.dotR} 0 1,0 ${-MARK.dotR * 2},0`
const anim = (target, body) => `  <target android:name="${target}"><aapt:attr name="android:animation">${body}</aapt:attr></target>`
const scaleIn = (offset) => `<set>${['scaleX', 'scaleY'].map((p) => `<objectAnimator android:propertyName="${p}" android:duration="220" android:startOffset="${offset}" android:valueFrom="0" android:valueTo="1" android:valueType="floatType" android:interpolator="@android:interpolator/overshoot"/>`).join('')}</set>`
const beat = `<set>${['scaleX', 'scaleY'].map((p) => `<objectAnimator android:propertyName="${p}" android:duration="1000"><propertyValuesHolder android:propertyName="${p}">` +
  [[0, 1], [0.72, 1], [0.8, 1.08], [0.87, 1], [0.93, 1.05], [1, 1]].map(([f, v]) => `<keyframe android:fraction="${f}" android:value="${v}"/>`).join('') +
  `</propertyValuesHolder></objectAnimator>`).join('')}</set>`
write(`${RES}/drawable/splash_animated.xml`, `<?xml version="1.0" encoding="utf-8"?>
<!-- Generated by scripts/make-icons.mjs from src/lib/brandMark.ts. Do not edit by hand. -->
<animated-vector ${A}>
  <aapt:attr name="android:drawable">
    <vector android:width="108dp" android:height="108dp" android:viewportWidth="108" android:viewportHeight="108">
      <group android:name="art" android:pivotX="54" android:pivotY="54">
        <group android:translateX="18" android:translateY="18" android:scaleX="${ADAPTIVE_SCALE}" android:scaleY="${ADAPTIVE_SCALE}">
          <path android:pathData="${MARK.frame}" android:strokeColor="#FFFFFF" android:strokeWidth="${MARK.frameW}" android:strokeLineCap="round"/>
          <path android:name="beat" android:pathData="${MARK.beat}" android:strokeColor="${MARK.teal}" android:strokeWidth="${MARK.beatW}" android:strokeLineCap="round" android:strokeLineJoin="round" android:trimPathEnd="0"/>
${MARK.dots.map(([x, y], n) => `          <group android:name="dot${n}" android:pivotX="${x}" android:pivotY="${y}" android:scaleX="0" android:scaleY="0"><path android:pathData="${circle([x, y])}" android:fillColor="#FFFFFF"/></group>`).join('\n')}
        </group>
      </group>
    </vector>
  </aapt:attr>
${anim('beat', '<objectAnimator android:propertyName="trimPathEnd" android:duration="560" android:startOffset="120" android:valueFrom="0" android:valueTo="1" android:valueType="floatType" android:interpolator="@android:interpolator/fast_out_slow_in"/>')}
${MARK.dots.map((_, n) => anim(`dot${n}`, scaleIn(460 + n * 90))).join('\n')}
${anim('art', beat)}
</animated-vector>
`)

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
