// Run: node --test test/wipe.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { wipeContactData } from '../src/lib/wipe.ts'

function fakeStore() {
  const s = { cards: ['c1', 'c2'], events: [{ id: 'e1', name: 'Plast India', createdAt: 1 }], active: 'e1' }
  return {
    s,
    deps: {
      cardIds: () => s.cards,
      deleteCard: async (id) => { s.cards = s.cards.filter((x) => x !== id) },
      saveEvents: (list) => { s.events = list },
      setActiveEvent: (id) => { s.active = id },
    },
  }
}

test('Delete all data removes the events too, not only the cards', async () => {
  const { s, deps } = fakeStore()
  await wipeContactData(deps)
  assert.deepEqual(s.cards, [])
  assert.deepEqual(s.events, [])
  assert.equal(s.active, '')           // new scans no longer go into a deleted event
})
