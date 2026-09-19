// Run: node --test test/crop.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cropRect, CARD_GUIDE } from '../src/lib/crop.ts'

const close = (a, b, eps = 0.01) => assert.ok(Math.abs(a - b) <= eps, `${a} vs ${b}`)

test('portrait phone, portrait video: card-shaped crop, centred, inside the frame', () => {
  const view = { w: 360, h: 560 }, video = { w: 1080, h: 1920 }
  const r = cropRect(view, video, CARD_GUIDE)
  close(r.w / r.h, CARD_GUIDE.aspect, 0.02)            // crop has the card's shape
  close(r.x + r.w / 2, video.w / 2, 1)                  // centred horizontally
  close(r.y + r.h / 2, video.h / 2, 1)                  // centred vertically
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= video.w && r.y + r.h <= video.h)
})

test('the saved crop is much tighter than the whole frame (the bug: card was a small strip)', () => {
  const r = cropRect({ w: 360, h: 560 }, { w: 1080, h: 1920 }, CARD_GUIDE)
  assert.ok(r.w * r.h < 0.4 * 1080 * 1920, 'crop should be a small part of the frame (was 100%)')
})

test('no guide (many cards): exactly what the viewfinder shows, same shape as the viewfinder', () => {
  const view = { w: 360, h: 560 }
  const r = cropRect(view, { w: 1080, h: 1920 })
  close(r.w / r.h, view.w / view.h, 0.01)
  close(r.w, 1080, 1)                                    // full width is visible; top/bottom are trimmed by cover
  assert.ok(r.h < 1920)
})

test('landscape video in a portrait viewfinder: sides are cut, guide still fits', () => {
  const r = cropRect({ w: 360, h: 560 }, { w: 1920, h: 1080 }, CARD_GUIDE)
  close(r.w / r.h, CARD_GUIDE.aspect, 0.02)
  assert.ok(r.x >= 0 && r.x + r.w <= 1920)
})

test('never returns something outside the video, even with an oversized guide', () => {
  const r = cropRect({ w: 360, h: 200 }, { w: 640, h: 480 }, { widthFrac: 1.4, aspect: 1.75, pad: 0.1 })
  assert.ok(r.x >= 0 && r.y >= 0 && r.x + r.w <= 640 && r.y + r.h <= 480 && r.w > 0 && r.h > 0)
})

test('view and video with the same shape: crop is the guide scaled to video pixels', () => {
  const r = cropRect({ w: 400, h: 300 }, { w: 800, h: 600 }, { widthFrac: 0.5, aspect: 2, pad: 0 })
  close(r.w, 400); close(r.h, 200); close(r.x, 200); close(r.y, 200)
})
