// Run: node --test test/backup.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { crc32, createZip, readZip, readVerified } from '../src/lib/zip.ts'
import { backupDue, buildBackup, mergeEvents, parseBackup, planRestore } from '../src/lib/backup.ts'

const jpeg = (n) => new Blob([Uint8Array.from({ length: n }, (_, i) => (i * 7) & 255)], { type: 'image/jpeg' })
const text = async (f) => new TextDecoder().decode(await readVerified(f))

test('crc32 matches the standard check value', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926)
})
test('a zip round-trips text and binary files, names with spaces and non-latin letters included', async () => {
  const bin = jpeg(5000)
  const zip = await createZip([{ name: 'a b.txt', data: 'hello' }, { name: 'फोटो.jpg', data: bin }])
  const files = await readZip(zip)
  assert.deepEqual(files.map((f) => f.name), ['a b.txt', 'फोटो.jpg'])
  assert.equal(await text(files[0]), 'hello')
  assert.deepEqual([...(await readVerified(files[1]))], [...new Uint8Array(await bin.arrayBuffer())])
})
test('a damaged file is detected, not restored', async () => {
  const zip = new Uint8Array(await (await createZip([{ name: 'x.txt', data: 'important' }])).arrayBuffer())
  zip[35] ^= 0xff                                                                                     // flip a byte inside the file data
  const [f] = await readZip(new Blob([zip]))
  await assert.rejects(() => readVerified(f), /damaged/)
})
test('something that is not a zip is refused with a clear message', async () => {
  await assert.rejects(() => readZip(new Blob(['just some text'])), /not a CardPulse backup/)
})

const card = (id, extra = {}) => ({ id, createdAt: 1, status: 'done', reviewed: false, image: jpeg(300), corrected: [{ name: 'A ' + id, phones: [], emails: [] }], ...extra })

test('a backup restores every card with its photos and details intact', async () => {
  const cards = [card('c1', { back: jpeg(200), eventId: 'e1', opened: true }), card('c2', { image: undefined })]
  const events = [{ id: 'e1', name: 'Expo', createdAt: 5 }]
  const parsed = await parseBackup(await buildBackup(cards, events, 1_700_000_000_000))
  assert.equal(parsed.cards.length, 2)
  const [a, b] = parsed.cards
  assert.equal(a.corrected[0].name, 'A c1'); assert.equal(a.eventId, 'e1'); assert.equal(a.opened, true)
  assert.equal(a.image.size, 300); assert.equal(a.back.size, 200)
  assert.equal(b.image, undefined)
  assert.deepEqual(parsed.events, events)
  assert.equal(parsed.createdAt, 1_700_000_000_000)
})
test('restoring adds what is missing and never overwrites what is already here', () => {
  const plan = planRestore(['c1'], [card('c1'), card('c2')])
  assert.deepEqual(plan.add.map((c) => c.id), ['c2']); assert.equal(plan.skipped, 1)
  assert.deepEqual(mergeEvents([{ id: 'e1', name: 'Mine' }], [{ id: 'e1', name: 'Theirs' }, { id: 'e2', name: 'New' }]).map((e) => e.name), ['Mine', 'New'])
})
test('a file from another app, or a newer one, is refused', async () => {
  const other = await createZip([{ name: 'cardpulse-backup.json', data: JSON.stringify({ app: 'other', version: 1, cards: [] }) }])
  await assert.rejects(() => parseBackup(other), /not a CardPulse backup/)
  const newer = await createZip([{ name: 'cardpulse-backup.json', data: JSON.stringify({ app: 'cardpulse', version: 99, cards: [] }) }])
  await assert.rejects(() => parseBackup(newer), /newer version/)
})
test('the reminder waits until there is something to lose, and respects a snooze', () => {
  const day = 86_400_000, now = 100 * day
  assert.equal(backupDue(3, 0, 0, now), false)                     // too few cards
  assert.equal(backupDue(40, 0, 0, now), true)                     // never backed up
  assert.equal(backupDue(40, now - 5 * day, 0, now), false)        // backed up recently
  assert.equal(backupDue(40, now - 20 * day, 0, now), true)
  assert.equal(backupDue(40, 0, now + day, now), false)            // snoozed
})
