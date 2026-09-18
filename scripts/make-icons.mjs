// Generates PWA icons with no dependencies: an indigo tile, a white card and a pulse line.
// Rendered 4x and box-filtered down so edges are smooth.
import { deflateSync } from 'node:zlib'
import { writeFileSync } from 'node:fs'

function crc32(buf) {
  let c, crc = ~0
  for (let n = 0; n < buf.length; n++) {
    c = (crc ^ buf[n]) & 0xff
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    crc = (crc >>> 8) ^ c
  }
  return ~crc >>> 0
}
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data])
  const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

const SS = 4
const TOP = [86, 104, 240], BOT = [52, 66, 200], WHITE = [255, 255, 255]

// Returns [r,g,b,a] for a point in unit space (0..1)
function shade(u, v, { rounded, pad }) {
  // tile
  if (rounded) {
    const r = 0.22, cx = Math.min(Math.max(u, r), 1 - r), cy = Math.min(Math.max(v, r), 1 - r)
    if ((u - cx) ** 2 + (v - cy) ** 2 > r * r) return [0, 0, 0, 0]
  }
  const t = (u + v) / 2
  let px = TOP.map((c, i) => c + (BOT[i] - c) * t)
  // card
  const x0 = pad, x1 = 1 - pad, y0 = pad + 0.08, y1 = 1 - pad - 0.08, cr = 0.055
  const cx = Math.min(Math.max(u, x0 + cr), x1 - cr), cy = Math.min(Math.max(v, y0 + cr), y1 - cr)
  if (u >= x0 && u <= x1 && v >= y0 && v <= y1 && (u - cx) ** 2 + (v - cy) ** 2 <= cr * cr) {
    px = WHITE
    // pulse line
    const s = (u - x0) / (x1 - x0), mid = (y0 + y1) / 2, h = (y1 - y0) * 0.26
    const f = s < 0.32 ? 0 : s < 0.42 ? -(s - 0.32) / 0.1 : s < 0.58 ? -1 + (s - 0.42) / 0.16 * 2 : s < 0.68 ? 1 - (s - 0.58) / 0.1 : 0
    const df = s < 0.32 ? 0 : s < 0.42 ? -10 : s < 0.58 ? 12.5 : s < 0.68 ? -10 : 0 // slope of f, to keep stroke width even on diagonals
    const slope = (h / (x1 - x0)) * df
    const onLine = Math.abs(v - (mid + f * h)) < 0.016 * Math.sqrt(1 + slope * slope) && s > 0.14 && s < 0.86
    if (onLine) px = BOT.map((c, i) => c * 0.9 + TOP[i] * 0.1)
  }
  return [...px, 255]
}

function png(size, opts) {
  const raw = Buffer.alloc((size * 4 + 1) * size)
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      let r = 0, g = 0, b = 0, a = 0
      for (let sy = 0; sy < SS; sy++) for (let sx = 0; sx < SS; sx++) {
        const [pr, pg, pb, pa] = shade((x + (sx + 0.5) / SS) / size, (y + (sy + 0.5) / SS) / size, opts)
        r += pr * pa; g += pg * pa; b += pb * pa; a += pa
      }
      const o = row + 1 + x * 4
      raw[o] = a ? Math.round(r / a) : 0; raw[o + 1] = a ? Math.round(g / a) : 0; raw[o + 2] = a ? Math.round(b / a) : 0
      raw[o + 3] = Math.round(a / (SS * SS))
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

const out = (name, size, opts) => writeFileSync(`public/${name}`, png(size, opts))
out('pwa-192x192.png', 192, { rounded: true, pad: 0.17 })
out('pwa-512x512.png', 512, { rounded: true, pad: 0.17 })
out('pwa-maskable-512x512.png', 512, { rounded: false, pad: 0.27 }) // full-bleed; safe zone keeps the mark inside the mask
out('apple-touch-icon.png', 180, { rounded: false, pad: 0.2 })
out('favicon.png', 64, { rounded: true, pad: 0.14 })
