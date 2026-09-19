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

// ---- Real-world regression: frames built from a real phone screenshot (carpet texture, real card colour, a phone in the corner).
// The original bug: on textured carpet the detector reported "no card" while the card was plainly in view.
import { readFileSync } from 'node:fs'
import { gunzipSync } from 'node:zlib'
const meta = JSON.parse(readFileSync(new URL('./fixtures/meta.json', import.meta.url), 'utf8'))
for (const [name, m] of Object.entries(meta)) {
  test(`real carpet frame: ${name}`, () => {
    const px = new Uint8ClampedArray(gunzipSync(readFileSync(new URL(`./fixtures/${name}.rgba.gz`, import.meta.url))))
    const d = detectCard(px, m.w, m.h)
    assert.ok(d, 'the card must be found')
    assert.ok(Math.hypot(d.cx - m.cx, d.cy - m.cy) < 6, `centre off: (${d.cx.toFixed(0)},${d.cy.toFixed(0)}) vs (${m.cx.toFixed(0)},${m.cy.toFixed(0)})`)
    if (!m.clipped) {
      assert.ok(Math.abs(d.w - m.cardW) < m.cardW * 0.1, `width ${d.w.toFixed(0)} vs ${m.cardW.toFixed(0)}`)
      assert.ok(Math.abs(d.h - m.cardH) < m.cardH * 0.12, `height ${d.h.toFixed(0)} vs ${m.cardH.toFixed(0)}`)
    }
    assert.ok(d.w / d.h > 1.5 && d.w / d.h < 1.95, `proportions ${(d.w / d.h).toFixed(2)}`)
    assert.ok(angDiff(d.angle, m.tilt) < 0.06, `angle ${(d.angle * 180 / Math.PI).toFixed(1)} vs ${(m.tilt * 180 / Math.PI).toFixed(1)}`)
  })
}

test('real carpet with NO card in view: nothing is reported', () => {
  // the same carpet frame with the card painted out (uniform carpet colour patch) must not produce a detection
  const px = new Uint8ClampedArray(gunzipSync(readFileSync(new URL('./fixtures/carpet-far-and-steep.rgba.gz', import.meta.url))))
  const m = meta['carpet-far-and-steep']
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) if (Math.hypot(x - m.cx, y - m.cy) < 70) { const i = (y * m.w + x) * 4; px[i] = 140; px[i + 1] = 125; px[i + 2] = 100 }
  assert.equal(detectCard(px, m.w, m.h), null)
})

// ---- Corners, perspective, colour fallback, several cards ----
import { detectCards } from '../src/lib/detect.ts'
import { quadToUnit, warpQuad } from '../src/lib/warp.ts'

/** A frame with cards painted into arbitrary quads (so perspective is possible). */
function quadScene(quads, { card = [225, 225, 225], bg = [95, 95, 95], noise = 12, text = true } = {}) {
  const px = new Uint8ClampedArray(W * H * 4)
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let col = bg.map((c, k) => c + (x / W) * 25 * (k === 0 ? 1 : 0.6) + (rnd() - 0.5) * 2 * noise)
    for (const q of quads) {
      const [u, v] = quadToUnit(q, x + 0.5, y + 0.5)
      if (u >= 0 && u <= 1 && v >= 0 && v <= 1) {
        col = card.map((c) => c + (rnd() - 0.5) * 6)
        if (text && Math.floor(v * 12) % 2 === 0 && v > 0.12 && v < 0.85 && u > 0.08 && u < 0.85 - (Math.floor(v * 12) % 3) * 0.15) col = col.map((c) => c * 0.25)
      }
    }
    const i = (y * W + x) * 4; px[i] = col[0]; px[i + 1] = col[1]; px[i + 2] = col[2]; px[i + 3] = 255
  }
  return px
}
const matchCorners = (got, want) => want.map((w) => Math.min(...got.map((g) => Math.hypot(g[0] - w[0], g[1] - w[1]))))   // rotation-agnostic

test('quad: the four corners of a tilted card are found', () => {
  const q = [[45, 30], [140, 45], [128, 100], [33, 86]]
  const d = detectCard(quadScene([q]), W, H)
  assert.ok(d)
  const err = matchCorners(d.quad, q)
  assert.ok(Math.max(...err) < 5, `corner errors (px): ${err.map((e) => e.toFixed(1)).join(', ')}`)
})

test('quad: a card seen at an angle (perspective) keeps its trapezoid shape', () => {
  const q = [[38, 30], [125, 24], [140, 104], [26, 90]]   // wider at the bottom, like a phone tilted over the card
  const d = detectCard(quadScene([q]), W, H)
  assert.ok(d, 'perspective card must be found')
  const err = matchCorners(d.quad, q)
  assert.ok(Math.max(...err) < 6, `corner errors (px): ${err.map((e) => e.toFixed(1)).join(', ')}`)
})

test('detect then flatten: the perspective card comes out square-on and matches the original', () => {
  // Build a high-resolution frame (4x) with a known card in perspective, detect on the small version, warp the big one.
  const S = 4, BW = W * S, BH = H * S
  const q = [[38, 30], [125, 24], [140, 104], [26, 90]]
  const cw = 160, ch = 92, original = new Uint8ClampedArray(cw * ch * 4)
  for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { const i = (y * cw + x) * 4, t = (Math.floor(y / 8) % 2 === 0 && x > 12 && x < 120) ? 0.25 : 1; original[i] = 225 * t; original[i + 1] = 222 * t; original[i + 2] = 230 * t; original[i + 3] = 255 }
  const big = new Uint8ClampedArray(BW * BH * 4), small = new Uint8ClampedArray(W * H * 4)
  for (const [buf, w, h, s] of [[big, BW, BH, S], [small, W, H, 1]]) for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    const [u, v] = quadToUnit(q, (x + 0.5) / s, (y + 0.5) / s), o = (y * w + x) * 4
    const table = 95 + (x / w) * 25 + (rnd() - 0.5) * 20
    if (u >= 0 && u <= 1 && v >= 0 && v <= 1) { const a = ((Math.min(ch - 1, v * ch | 0)) * cw + Math.min(cw - 1, u * cw | 0)) * 4; buf[o] = original[a]; buf[o + 1] = original[a + 1]; buf[o + 2] = original[a + 2] } else { buf[o] = table; buf[o + 1] = table * 0.85; buf[o + 2] = table * 0.7 }
    buf[o + 3] = 255
  }
  const d = detectCard(small, W, H); assert.ok(d)
  // order the detected corners to match the original (rotation-agnostic), then scale up and flatten
  let best = null
  for (let r = 0; r < 4; r++) { const cand = [0, 1, 2, 3].map((i) => d.quad[(i + r) % 4]); const e = matchCorners(cand, q).reduce((a, b) => a + b, 0); if (!best || e < best.e) best = { e, cand } }
  const bq = best.cand.map(([x, y]) => [x * S, y * S])
  const flat = warpQuad(big, BW, BH, bq, cw, ch)
  let sum = 0, n = 0
  for (let y = 6; y < ch - 6; y++) for (let x = 6; x < cw - 6; x++) for (let k = 0; k < 3; k++) { sum += Math.abs(flat[(y * cw + x) * 4 + k] - original[(y * cw + x) * 4 + k]); n++ }
  assert.ok(sum / n < 22, `mean abs error ${(sum / n).toFixed(1)} of 255 (a wrong shape gives 60+)`)
})

test('colour fallback: a blue card on a brown table with the SAME brightness is still found', () => {
  const q = [[35, 25], [130, 32], [122, 92], [28, 84]]
  const px = quadScene([q], { card: [85, 118, 150], bg: [150, 112, 82], noise: 10, text: true })
  const dbg = {}
  const d = detectCard(px, W, H, dbg)
  assert.ok(d, 'expected the colour path to find it ' + JSON.stringify(dbg))
  assert.ok(Math.max(...matchCorners(d.quad, q)) < 6)
})

test('colour fallback does not invent a card on plain textured table', () => {
  assert.equal(detectCard(quadScene([], { bg: [150, 112, 82], noise: 14 }), W, H), null)
})

test('shadow around a card does not inflate it (colour path ignores brightness-only changes)', () => {
  const q = [[40, 28], [125, 28], [125, 90], [40, 90]]
  const px = quadScene([q], { card: [85, 118, 150], bg: [150, 112, 82], noise: 8 })
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (x > 125 && x < 134 && y > 32 && y < 98) { const i = (y * W + x) * 4; px[i] *= 0.6; px[i + 1] *= 0.6; px[i + 2] *= 0.6 }   // drop shadow on the table, same hue
  const d = detectCard(px, W, H); assert.ok(d)
  assert.ok(Math.abs(d.w - 85) < 8, `width ${d.w.toFixed(1)} (true 85)`)
})

test('detectCards: counts cards (one card -> 1, a table of three -> 3)', () => {
  assert.equal(detectCards(quadScene([[[50, 30], [125, 30], [125, 88], [50, 88]]]), W, H).length, 1)
  const three = quadScene([[[8, 8], [70, 8], [70, 46], [8, 46]], [[86, 12], [150, 12], [150, 52], [86, 52]], [[40, 70], [110, 70], [110, 112], [40, 112]]])
  assert.equal(detectCards(three, W, H).length, 3)
})

test('detectCards on the real carpet frames finds exactly the one card', () => {
  for (const name of Object.keys(meta)) {
    const m = meta[name]; const px = new Uint8ClampedArray(gunzipSync(readFileSync(new URL(`./fixtures/${name}.rgba.gz`, import.meta.url))))
    assert.equal(detectCards(px, m.w, m.h).length, 1, name)
  }
})

test('speed with corners + colour fallback still fits a 15 fps loop', () => {
  const px = quadScene([[[38, 30], [125, 24], [140, 104], [26, 90]]], { card: [85, 118, 150], bg: [150, 112, 82] })
  detectCard(px, W, H); const t = performance.now(); for (let i = 0; i < 20; i++) detectCard(px, W, H)
  const per = (performance.now() - t) / 20; console.log(`  ~${per.toFixed(1)} ms per frame (worst path: brightness fails, colour succeeds)`)
  assert.ok(per < 30)
})
