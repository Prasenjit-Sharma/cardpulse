// Run: node --test test/visitorpack.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_FILES, MAX_FILE_BYTES, checkFile, checkLink, fileSize, isEmptyPack, packPath, readPack, removedPaths } from '../src/lib/visitorpack.ts'

const f = (name, size = 1000, type = 'application/pdf') => ({ name, size, type })

test('files: PDF and pictures up to 10 MB are accepted; anything else says why', () => {
  assert.equal(checkFile(f('Profile.pdf')), null)
  for (const [n, t] of [['a.jpg', 'image/jpeg'], ['a.png', 'image/png'], ['a.webp', 'image/webp']]) assert.equal(checkFile(f(n, 10, t)), null)
  assert.match(checkFile(f('big.pdf', MAX_FILE_BYTES + 1)), /10 MB/)
  assert.match(checkFile(f('deck.pptx', 10, 'application/vnd.openxmlformats-officedocument.presentationml.presentation')), /PDF or a picture/)
  assert.match(checkFile(f('empty.pdf', 0)), /empty/)
  assert.equal(MAX_FILES, 3)
})
test('the link: a bare address gets https, anything that is not a web address is refused', () => {
  assert.deepEqual(checkLink(''), { url: '' })
  assert.deepEqual(checkLink(' example.in/products '), { url: 'https://example.in/products' })
  assert.deepEqual(checkLink('http://example.in'), { url: 'http://example.in' })
  assert.ok(checkLink('javascript:alert(1)').error)
  assert.ok(checkLink('not a link').error)
  assert.ok(checkLink('https://' + 'a'.repeat(500) + '.in').error)
})
test('a stored file lives in the owner\'s folder for that event, under an unguessable, safe name', () => {
  const p = packPath('owner-1', 'ev 1', 'Our Profile (2026).pdf', 'r4nd0m')
  assert.equal(p, 'owner-1/ev_1/r4nd0m-Our-Profile-2026-.pdf')
})
test('saving removes only the files taken out of the pack', () => {
  const before = [{ name: 'a', path: 'o/e/1-a', size: 1, type: 'application/pdf' }, { name: 'b', path: 'o/e/2-b', size: 1, type: 'application/pdf' }]
  assert.deepEqual(removedPaths(before, [before[1]]), ['o/e/1-a'])
  assert.deepEqual(removedPaths(before, before), [])
})
test('an empty pack is one with nothing a visitor would see', () => {
  assert.equal(isEmptyPack({ note: ' ', linkUrl: '', linkLabel: 'x', files: [] }), true)
  assert.equal(isEmptyPack({ note: 'Hi', linkUrl: '', linkLabel: '', files: [] }), false)
})
test('the pack from the server is read defensively: bad files and links are dropped', () => {
  const p = readPack({ note: 'Thanks', link_url: 'javascript:x', link_label: 'Site', files: [{ name: 'a.pdf', path: 'o/e/1-a.pdf', size: 5, type: 'application/pdf' }, { name: 'x' }, 'junk'] })
  assert.equal(p.note, 'Thanks'); assert.equal(p.linkUrl, ''); assert.equal(p.files.length, 1)
  assert.equal(readPack(null), null)
})
test('sizes read naturally', () => {
  assert.equal(fileSize(900), '1 KB'); assert.equal(fileSize(250_000), '244 KB'); assert.equal(fileSize(3_400_000), '3.2 MB')
})
