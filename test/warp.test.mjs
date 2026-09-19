// Run: node --test test/warp.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { growQuad, mapUnit, quadSize, quadToUnit, unitToQuad, warpQuad } from '../src/lib/warp.ts'

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)

test('unit square corners land exactly on the quad corners (rectangle, tilted and perspective)', () => {
  for (const q of [
    [[10, 10], [110, 10], [110, 70], [10, 70]],
    [[30, 5], [130, 35], [115, 95], [15, 65]],                    // rotated
    [[20, 20], [140, 30], [125, 100], [35, 90]],                  // trapezoid-ish (perspective)
  ]) {
    const m = unitToQuad(q)
    for (const [[u, v], i] of [[[0, 0], 0], [[1, 0], 1], [[1, 1], 2], [[0, 1], 3]]) { const [x, y] = mapUnit(m, u, v); close(x, q[i][0], 1e-6); close(y, q[i][1], 1e-6) }
  }
})

test('quadToUnit is the exact inverse', () => {
  const q = [[20, 20], [140, 30], [125, 100], [35, 90]]
  const m = unitToQuad(q)
  for (const [u, v] of [[0.2, 0.3], [0.5, 0.5], [0.9, 0.1], [0.05, 0.95]]) { const [x, y] = mapUnit(m, u, v); const [u2, v2] = quadToUnit(q, x, y); close(u2, u, 1e-6); close(v2, v, 1e-6) }
})

/** Source image whose colour encodes position: R = x, G = y. Lets us check EXACTLY where each output pixel came from. */
function positionImage(w, h) { const d = new Uint8ClampedArray(w * h * 4); for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) { const i = (y * w + x) * 4; d[i] = (x / (w - 1)) * 255; d[i + 1] = (y / (h - 1)) * 255; d[i + 2] = 0; d[i + 3] = 255 } return d }

test('full-image quad reproduces the image', () => {
  const w = 60, h = 40, src = positionImage(w, h)
  const out = warpQuad(src, w, h, [[0, 0], [w, 0], [w, h], [0, h]], w, h)
  let worst = 0; for (let i = 0; i < src.length; i++) worst = Math.max(worst, Math.abs(out[i] - src[i]))
  assert.ok(worst <= 6, `worst difference ${worst}`)
})

test('perspective quad: every output pixel samples the right source position', () => {
  const w = 200, h = 150, src = positionImage(w, h)
  const q = [[40, 30], [170, 45], [150, 125], [55, 110]]                    // a card seen at an angle
  const ow = 130, oh = 80, out = warpQuad(src, w, h, q, ow, oh), m = unitToQuad(q)
  for (const [i, j] of [[3, 3], [ow - 4, 4], [ow - 4, oh - 4], [4, oh - 4], [ow / 2 | 0, oh / 2 | 0], [30, 60]]) {
    const [x, y] = mapUnit(m, (i + 0.5) / ow, (j + 0.5) / oh)
    const o = (j * ow + i) * 4
    close(out[o] / 255 * (w - 1), x, 1.5); close(out[o + 1] / 255 * (h - 1), y, 1.5)
  }
})

test('round trip: paint a card into a perspective quad, warp it back, get the original', () => {
  const cw = 160, ch = 96
  const card = new Uint8ClampedArray(cw * ch * 4)                            // a "printed" card: gradient + blocks
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4; const block = (x >> 4) % 2 ^ (y >> 4) % 2; card[i] = 60 + x; card[i + 1] = 80 + y; card[i + 2] = block ? 220 : 40; card[i + 3] = 255 }
  const W = 320, H = 240, frame = new Uint8ClampedArray(W * H * 4).fill(128)
  const q = [[70, 50], [270, 75], [245, 190], [90, 165]]
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const [u, v] = quadToUnit(q, x + 0.5, y + 0.5)
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { const cx = Math.min(cw - 1, u * cw | 0), cy = Math.min(ch - 1, v * ch | 0), a = (cy * cw + cx) * 4, o = (y * W + x) * 4; for (let k = 0; k < 4; k++) frame[o + k] = card[a + k] }
  }
  const back = warpQuad(frame, W, H, q, cw, ch)
  let sum = 0, n = 0; for (let y = 4; y < ch - 4; y++) for (let x = 4; x < cw - 4; x++) for (let k = 0; k < 3; k++) { sum += Math.abs(back[(y * cw + x) * 4 + k] - card[(y * cw + x) * 4 + k]); n++ }
  assert.ok(sum / n < 14, `mean abs error ${(sum / n).toFixed(1)} (0 = identical)`)
})

test('quadSize and growQuad', () => {
  const s = quadSize([[0, 0], [100, 0], [100, 60], [0, 60]]); close(s.w, 100); close(s.h, 60)
  const g = growQuad([[0, 0], [100, 0], [100, 60], [0, 60]], 0.1); close(g[0][0], -5); close(g[2][0], 105); close(g[0][1], -3)
})
