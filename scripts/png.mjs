// PNG without an alpha channel (colour type 2). Stores reject or crop images that carry one: the App Store icon, and
// Google Play's screenshots and feature graphic. Used by make-icons.mjs and store-render.mjs.
import { Resvg } from '@resvg/resvg-js'
import { deflateSync } from 'node:zlib'

function crc32(buf) { let c = ~0; for (const b of buf) { c ^= b; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1 } return ~c >>> 0 }
function chunk(type, data) {
  const len = Buffer.alloc(4); len.writeUInt32BE(data.length)
  const td = Buffer.concat([Buffer.from(type), data]); const crc = Buffer.alloc(4); crc.writeUInt32BE(crc32(td))
  return Buffer.concat([len, td, crc])
}

/** RGB PNG bytes from RGBA pixels (alpha dropped; the images are opaque). */
export function encodeRgb(w, h, rgba) {
  const raw = Buffer.alloc((w * 3 + 1) * h)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) for (let c = 0; c < 3; c++) raw[y * (w * 3 + 1) + 1 + x * 3 + c] = rgba[(y * w + x) * 4 + c]
  const ihdr = Buffer.alloc(13); ihdr.writeUInt32BE(w, 0); ihdr.writeUInt32BE(h, 4); ihdr[8] = 8; ihdr[9] = 2
  return Buffer.concat([Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]), chunk('IHDR', ihdr), chunk('IDAT', deflateSync(raw)), chunk('IEND', Buffer.alloc(0))])
}

/** Renders an SVG and returns RGB PNG bytes. */
export function rgbFromSvg(svg) {
  const img = new Resvg(svg, { fitTo: { mode: 'original' } }).render()
  return encodeRgb(img.width, img.height, img.pixels)
}

/** Re-encodes any PNG (a browser screenshot, which carries alpha) as RGB, at its own size. */
export function rgbFromPng(png) {
  const w = png.readUInt32BE(16), h = png.readUInt32BE(20)
  return rgbFromSvg(`<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}"><image width="${w}" height="${h}" href="data:image/png;base64,${png.toString('base64')}"/></svg>`)
}
