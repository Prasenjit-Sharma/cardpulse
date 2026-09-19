// Run: node --test test/detect.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { detectCard, isStable } from '../src/lib/detect.ts'

const W = 160, H = 120
let seed = 12345
const rnd = () => ((seed = (seed * 1664525 + 1013904223) >>> 0) / 2 ** 32)

/** Synthetic scene: textured background, a rotated card with "printing" on it. */
function scene({ cx = 80, cy = 60, w = 100, h = 58, deg = 0, card = 225, bg = 95, noise = 14, text = true, grad = 30 } = {}) {
  const px = new Uint8ClampedArray(W * H * 4)
  const a = (deg * Math.PI) / 180, ca = Math.cos(a), sa = Math.sin(a)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const dx = x - cx, dy = y - cy
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
    let val = bg + (x / W) * grad + (rnd() - 0.5) * 2 * noise           // uneven, noisy table
    if (Math.abs(u) <= w / 2 && Math.abs(v) <= h / 2) {
      val = card + (rnd() - 0.5) * 8
      if (text) {
        const ty = Math.floor((v + h / 2) / 5), tx = Math.floor((u + w / 2) / 3)
        if (ty % 2 === 0 && ty > 0 && ty < h / 5 - 1 && tx > 4 && tx < w / 3 - (ty % 3) * 4 && (tx + ty) % 5 !== 0) val = 50 // dark "text"
      }
    }
    const i = (y * W + x) * 4
    px[i] = px[i + 1] = px[i + 2] = Math.max(0, Math.min(255, val)); px[i + 3] = 255
  }
  return px
}
const angDiff = (a, b) => { let d = Math.abs(a - b) % Math.PI; return d > Math.PI / 2 ? Math.PI - d : d }

test('finds an upright card', () => {
  const d = detectCard(scene(), W, H)
  assert.ok(d, 'expected a detection')
  assert.ok(Math.hypot(d.cx - 80, d.cy - 60) < 3)
  assert.ok(Math.abs(d.w - 100) < 8 && Math.abs(d.h - 58) < 8, `size ${d.w.toFixed(1)}x${d.h.toFixed(1)}`)
  assert.ok(angDiff(d.angle, 0) < 0.06)
})

for (const deg of [-25, -10, 8, 20, 35]) {
  test(`finds a card rotated ${deg} degrees and reports the angle`, () => {
    const d = detectCard(scene({ deg }), W, H)
    assert.ok(d, 'expected a detection')
    assert.ok(Math.hypot(d.cx - 80, d.cy - 60) < 4)
    assert.ok(Math.abs(d.w - 100) < 10 && Math.abs(d.h - 58) < 10, `size ${d.w.toFixed(1)}x${d.h.toFixed(1)}`)
    assert.ok(angDiff(d.angle, (deg * Math.PI) / 180) < 0.08, `angle ${(d.angle * 180 / Math.PI).toFixed(1)}`)
  })
}

test('works for a dark card on a light table', () => {
  const d = detectCard(scene({ card: 45, bg: 190, text: false, deg: 12 }), W, H)
  assert.ok(d)
  assert.ok(Math.abs(d.w - 100) < 10)
})

test('works for a portrait-oriented card too (reported with the long side first)', () => {
  const d = detectCard(scene({ w: 58, h: 100 }), W, H)
  assert.ok(d)
  assert.ok(d.w > d.h && Math.abs(d.w - 100) < 10)
})

test('reports nothing when there is no card', () => {
  assert.equal(detectCard(scene({ w: 0, h: 0, text: false }), W, H), null)
})

test('rejects a blob that is the wrong shape (a long strip)', () => {
  assert.equal(detectCard(scene({ w: 150, h: 30, text: false }), W, H), null)
})

test('rejects something that fills the whole frame (that is the background)', () => {
  assert.equal(detectCard(scene({ w: 400, h: 400, text: false }), W, H), null)
})

test('rejects a speck', () => {
  assert.equal(detectCard(scene({ w: 20, h: 12, text: false }), W, H), null)
})

test('stability: same card is stable, a moved card is not', () => {
  const a = detectCard(scene({ deg: 5 }), W, H), b = detectCard(scene({ deg: 5 }), W, H)
  assert.ok(isStable(a, b, W))
  const moved = detectCard(scene({ deg: 5, cx: 100 }), W, H)
  assert.equal(isStable(a, moved, W), false)
})

test('is fast enough to run several times a second', () => {
  const px = scene({ deg: 10 })
  detectCard(px, W, H)
  const t = performance.now()
  for (let i = 0; i < 20; i++) detectCard(px, W, H)
  const per = (performance.now() - t) / 20
  console.log(`  ~${per.toFixed(1)} ms per frame`)
  assert.ok(per < 15)
})
