// Run: node --test test/cardphoto.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { photoTarget } from '../src/lib/cardphoto.ts'
test('a large photo shrinks to 512 on its long side, keeping proportions', () => {
  assert.deepEqual(photoTarget(4000, 3000), { w: 512, h: 384 }); assert.deepEqual(photoTarget(3000, 4000), { w: 384, h: 512 })
})
test('a small photo is never enlarged', () => assert.deepEqual(photoTarget(200, 100), { w: 200, h: 100 }))
test('a degenerate size does not divide by zero', () => assert.deepEqual(photoTarget(0, 0), { w: 1, h: 1 }))
