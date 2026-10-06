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
