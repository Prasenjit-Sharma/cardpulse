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
