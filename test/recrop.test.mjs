// Run: node --test test/recrop.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { clamp01, defaultQuad, quadArea, quadUsable } from '../src/lib/recrop.ts'

test('the starting crop is the photo with a small margin, and is usable', () => {
  const q = defaultQuad(0.03)
  assert.ok(quadUsable(q)); assert.ok(Math.abs(quadArea(q) - 0.94 * 0.94) < 1e-9)
})
test('a tilted four-sided crop is usable', () => {
  assert.ok(quadUsable([[0.1, 0.2], [0.9, 0.1], [0.95, 0.8], [0.05, 0.9]]))
})
test('a bow-tie (corners dragged across each other) is refused', () => {
  assert.equal(quadUsable([[0.1, 0.1], [0.9, 0.9], [0.9, 0.1], [0.1, 0.9]]), false)
})
test('a sliver or a fold-back is refused', () => {
  assert.equal(quadUsable([[0.1, 0.1], [0.9, 0.1], [0.9, 0.12], [0.1, 0.12]]), false)
  assert.equal(quadUsable([[0.1, 0.1], [0.5, 0.5], [0.9, 0.1], [0.5, 0.2]]), false)
})
test('points are held inside the photo', () => {
  assert.equal(clamp01(-0.2), 0); assert.equal(clamp01(1.4), 1); assert.equal(clamp01(0.5), 0.5)
})

import { rotateQuadCCW, rotateQuadCW, turn } from '../src/lib/recrop.ts'
test('rotating the corners a quarter turn clockwise moves each to where the photo puts it, staying in reading order', () => {
  const q = [[0.1, 0.2], [0.8, 0.2], [0.8, 0.6], [0.1, 0.6]]           // a wide crop in the upper part
  const r = rotateQuadCW(q)
  assert.ok(quadUsable(r))
  // the top-left corner of a wide crop becomes the top-right corner once the photo is turned clockwise
  assert.deepEqual(r[1].map((n) => +n.toFixed(6)), [0.8, 0.1])
  assert.ok(Math.abs(quadArea(r) - quadArea(q)) < 1e-9)
})
test('clockwise then counter-clockwise gives the crop back; four quarter turns too', () => {
  const q = [[0.1, 0.2], [0.8, 0.25], [0.85, 0.6], [0.12, 0.62]]
  const same = (a, b) => a.every((p, i) => Math.abs(p[0] - b[i][0]) < 1e-9 && Math.abs(p[1] - b[i][1]) < 1e-9)
  assert.ok(same(rotateQuadCCW(rotateQuadCW(q)), q))
  assert.ok(same(rotateQuadCW(rotateQuadCW(rotateQuadCW(rotateQuadCW(q)))), q))
})
test('the photo turn wraps around', () => {
  assert.equal(turn(270, 90), 0); assert.equal(turn(0, -90), 270); assert.equal(turn(90, 90), 180)
})
