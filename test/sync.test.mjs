// Run: node --test test/sync.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cardToWire, chunk, diffEvents, isNewer, leadCardId, parseKey, photoPath, recordChange, settle, wireToCard } from '../src/lib/synccore.ts'

test('the outbox keeps only the newest change per record, deletions included', () => {
  let o = recordChange({}, 'card', 'a', 10)
  o = recordChange(o, 'card', 'a', 20)
  assert.deepEqual(o, { 'card:a': { updatedAt: 20 } })
  o = recordChange(o, 'card', 'a', 15, true)
  assert.deepEqual(o, { 'card:a': { updatedAt: 20 } }, 'an older delete does not replace a newer edit')
  o = recordChange(o, 'card', 'a', 30, true)
  assert.deepEqual(o, { 'card:a': { updatedAt: 30, deleted: true } })
  o = recordChange(o, 'card', 'a', 40)
  assert.deepEqual(o, { 'card:a': { updatedAt: 40 } }, 'a record written again after a delete is live again')
})

test('settling drops what was sent, but keeps a record changed again while the push was in flight', () => {
  const o = { 'card:a': { updatedAt: 10 }, 'card:b': { updatedAt: 25 }, 'event:e': { updatedAt: 5 } }
  assert.deepEqual(settle(o, { 'card:a': 10, 'card:b': 20 }), { 'card:b': { updatedAt: 25 }, 'event:e': { updatedAt: 5 } })
})

test('keys with colons in the id survive a round trip', () => {
  assert.deepEqual(parseKey('card:lead-1:2'), { kind: 'card', id: 'lead-1:2' })
})

test('only a strictly newer remote copy replaces the local one; our own change coming back is ignored', () => {
  assert.equal(isNewer(20, 10), true)
  assert.equal(isNewer(10, 10), false)
  assert.equal(isNewer(5, 10), false)
  assert.equal(isNewer(5, undefined), true)
})

test('events: new and renamed ones are stamped, unchanged ones keep their stamp, removals are listed', () => {
  const prev = [{ id: 'a', name: 'Expo', createdAt: 1, updatedAt: 3 }, { id: 'b', name: 'Fair', createdAt: 2 }, { id: 'c', name: 'Gone', createdAt: 2 }]
  const next = [{ id: 'n', name: 'New', createdAt: 9 }, { id: 'a', name: 'Expo', createdAt: 1 }, { id: 'b', name: 'Fair 2026', createdAt: 2 }]
  const { list, changed, removed } = diffEvents(prev, next, 100)
  assert.deepEqual(list, [{ id: 'n', name: 'New', createdAt: 9, updatedAt: 100 }, { id: 'a', name: 'Expo', createdAt: 1, updatedAt: 3 }, { id: 'b', name: 'Fair 2026', createdAt: 2, updatedAt: 100 }])
  assert.deepEqual(changed.map((e) => e.id), ['n', 'b'])
  assert.deepEqual(removed, ['c'])
  assert.deepEqual(diffEvents(list, list, 200).changed, [], 'saving the same list again changes nothing')
})

const blob = (s) => new Blob([s], { type: 'image/jpeg' })
const card = (o = {}) => ({ id: 'c1', createdAt: 1, updatedAt: 50, status: 'done', reviewed: false, image: blob('front'), back: blob('back'), original: blob('orig'), waiting: 'retry', attempts: 2, corrected: [{ name: 'Asha' }], extracted: [{ name: 'Asa' }], eventId: 'e1', ...o })

test('a contact on the wire has no photos, undo copies, retry state or local stamp — just the photo hashes', () => {
  const wire = cardToWire(card(), { image: 'h1', back: 'h2' })
  for (const k of ['image', 'back', 'original', 'originalBack', 'waiting', 'attempts', 'updatedAt']) assert.equal(k in wire, false, k)
  assert.deepEqual(wire.photos, { image: 'h1', back: 'h2' })
  assert.deepEqual(wire.corrected, [{ name: 'Asha' }])
  assert.equal(wire.eventId, 'e1')
  assert.doesNotThrow(() => JSON.stringify(wire))
})

test('a card still being read (or failed) does not sync, so two phones never both pay to read it', () => {
  for (const status of ['pending', 'running', 'error']) assert.equal(cardToWire(card({ status }), {}), null, status)
})

test('a remote contact takes the remote fields and stamp, and keeps this phone\'s undo copy', () => {
  const local = card()
  const remote = { ...cardToWire(card({ corrected: [{ name: 'Asha Rao' }] }), { image: 'h1' }) }
  const merged = wireToCard(remote, 99, local)
  assert.deepEqual(merged.corrected, [{ name: 'Asha Rao' }])
  assert.equal(merged.updatedAt, 99)
  assert.equal(merged.original, local.original)
  assert.equal('photos' in merged, false)
  assert.equal(merged.image, undefined, 'photos are the caller\'s job (they need downloading)')
  assert.equal(wireToCard(remote, 99, undefined).original, undefined)
})

test('photo paths live in the user\'s own folder (what the Storage policy checks)', () => {
  assert.equal(photoPath('u1', 'card', 'c1', 'image'), 'u1/card-c1-image.jpg')
  assert.equal(photoPath('u1', 'card', 'c1', 'image').split('/')[0], 'u1')
})

test('a lead always maps to the same contact id', () => {
  assert.equal(leadCardId('abc'), 'lead-abc')
  assert.equal(leadCardId('abc'), leadCardId('abc'))
})

test('chunk splits into batches the server accepts', () => {
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]])
  assert.deepEqual(chunk([], 2), [])
})
