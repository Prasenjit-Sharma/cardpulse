// Run: node --test test/cardphoto.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { photoKind, photoTarget } from '../src/lib/cardphoto.ts'
test('a large photo shrinks to 512 on its long side, keeping proportions', () => {
  assert.deepEqual(photoTarget(4000, 3000), { w: 512, h: 384 }); assert.deepEqual(photoTarget(3000, 4000), { w: 384, h: 512 })
})
test('a small photo is never enlarged', () => assert.deepEqual(photoTarget(200, 100), { w: 200, h: 100 }))
test('a degenerate size does not divide by zero', () => assert.deepEqual(photoTarget(0, 0), { w: 1, h: 1 }))

// A logo is drawn whole on a white plate; a face fills a circle. Logos are wide, or sit on white or transparent ground.
test('a wide picture is a logo', () => assert.equal(photoKind(400, 120, [[0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255], [0, 0, 0, 255]]), 'logo'))
test('a square picture on white is a logo', () => assert.equal(photoKind(300, 300, [[255, 255, 255, 255], [252, 253, 250, 255], [255, 255, 255, 255], [248, 250, 252, 255]]), 'logo'))
test('a picture with transparent corners is a logo', () => assert.equal(photoKind(300, 280, [[0, 0, 0, 0], [0, 0, 0, 0], [10, 10, 10, 0], [0, 0, 0, 3]]), 'logo'))
test('a square photo with an ordinary background is a face', () => assert.equal(photoKind(300, 320, [[90, 80, 70, 255], [240, 240, 240, 255], [60, 70, 80, 255], [120, 110, 100, 255]]), 'face'))
