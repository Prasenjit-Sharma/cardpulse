// Generates simple PWA icons (blue tile with a white "card" and a pulse line) with no dependencies.
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
function png(size, { maskable }) {
  const bg = [47, 111, 237], white = [255, 255, 255]
  const raw = Buffer.alloc((size * 4 + 1) * size)
  const pad = maskable ? 0.28 : 0.18
  const x0 = size * pad, x1 = size * (1 - pad), y0 = size * (pad + 0.06), y1 = size * (1 - pad - 0.06)
  const r = size * 0.06
  const rounded = (x, y) => {
    if (x < x0 || x > x1 || y < y0 || y > y1) return false
    const cx = Math.min(Math.max(x, x0 + r), x1 - r), cy = Math.min(Math.max(y, y0 + r), y1 - r)
    return (x - cx) ** 2 + (y - cy) ** 2 <= r * r
  }
  const cornerR = maskable ? 0 : size * 0.22
  for (let y = 0; y < size; y++) {
    const row = y * (size * 4 + 1)
    raw[row] = 0
    for (let x = 0; x < size; x++) {
      let px = bg, a = 255
      if (cornerR) {
        const cx = Math.min(Math.max(x, cornerR), size - cornerR), cy = Math.min(Math.max(y, cornerR), size - cornerR)
        if ((x - cx) ** 2 + (y - cy) ** 2 > cornerR * cornerR) a = 0
      }
      if (rounded(x, y)) {
        px = white
        // pulse line across the card
        const t = (x - x0) / (x1 - x0), mid = (y0 + y1) / 2, h = (y1 - y0) * 0.28
        const f = t < 0.35 ? 0 : t < 0.45 ? -(t - 0.35) / 0.1 : t < 0.6 ? -1 + (t - 0.45) / 0.15 * 2 : t < 0.7 ? 1 - (t - 0.6) / 0.1 : 0
        if (Math.abs(y - (mid + f * h)) < size * 0.018) px = bg
      }
      const o = row + 1 + x * 4
      raw[o] = px[0]; raw[o + 1] = px[1]; raw[o + 2] = px[2]; raw[o + 3] = a
    }
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(size, 0); ihdr.writeUInt32BE(size, 4); ihdr[8] = 8; ihdr[9] = 6
  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0)),
  ])
}
const out = (name, size, opts = {}) => writeFileSync(`public/${name}`, png(size, opts))
out('pwa-192x192.png', 192)
out('pwa-512x512.png', 512)
out('pwa-maskable-512x512.png', 512, { maskable: true })
out('apple-touch-icon.png', 180, { maskable: true })
out('favicon.png', 64)
