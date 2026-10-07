// Run: node --test test/onboarding.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { TOUR_KEY, TIPS_KEY, TOUR, TIP_TEXT, lastAction, tourVariant, markTourSeen, tipDue, markTipSeen, tipForScreen, swipeStep, placeTip } from '../src/lib/onboarding.ts'

const mem = (init = {}) => { const m = new Map(Object.entries(init)); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)) }, m } }
const none = { cards: 0, photoCards: 0, events: 0, myCards: 0 }

test('a new install gets the new tour; once seen, none', () => {
  const s = mem()
  assert.equal(tourVariant(s, none), 'new')
  markTourSeen(s)
  assert.equal(s.m.get(TOUR_KEY), '1')
  assert.equal(tourVariant(s, none), null)
})
test('someone with cards or events gets the rename wording', () => {
  assert.equal(tourVariant(mem(), { ...none, cards: 3, photoCards: 3 }), 'existing')
  assert.equal(tourVariant(mem(), { ...none, events: 1 }), 'existing')
})
test('the first decision marks as seen the tips for features already used', () => {
  const s = mem()
  tourVariant(s, { cards: 500, photoCards: 480, events: 4, myCards: 1 })
  for (const id of ['scan-modes', 'events', 'contact', 'mycard']) assert.equal(tipDue(s, id), false, id)
  const t = mem()
  tourVariant(t, { cards: 2, photoCards: 0, events: 0, myCards: 0 })      // QR contacts only
  assert.equal(tipDue(t, 'scan-modes'), true)
  assert.equal(tipDue(t, 'contact'), false)
})
test('a new user keeps the contact tip after scanning a first card', () => {
  const s = mem()
  tourVariant(s, none)
  assert.equal(tipDue(s, 'contact'), true)
})
test('each tip once', () => {
  const s = mem()
  assert.equal(tipDue(s, 'events'), true)
  markTipSeen(s, 'events')
  assert.equal(tipDue(s, 'events'), false)
  assert.deepEqual(JSON.parse(s.m.get(TIPS_KEY)), ['events'])
})
test('storage that cannot be read shows nothing; one that cannot be written does not throw', () => {
  const blocked = { getItem: () => { throw new Error('blocked') }, setItem: () => { throw new Error('blocked') } }
  assert.equal(tourVariant(blocked, none), null)
  assert.equal(tipDue(blocked, 'events'), false)
  assert.doesNotThrow(() => { markTourSeen(blocked); markTipSeen(blocked, 'events') })
  const readOnly = { ...mem(), setItem: () => { throw new Error('full') } }
  assert.equal(tourVariant(readOnly, none), 'new')
})
test('a damaged tip list counts as none seen', () => {
  assert.equal(tipDue(mem({ [TIPS_KEY]: '{oops' }), 'mycard'), true)
})
test('which tip a screen may show', () => {
  assert.equal(tipForScreen({ tour: true, overlay: false, page: 'camera' }), null)
  assert.equal(tipForScreen({ tour: false, overlay: true, page: 'exhibition' }), null)
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'camera' }), 'scan-modes')
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'contact' }), 'contact')
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'exhibition' }), 'events')
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'mycard' }), 'mycard')
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'home' }), null)
  assert.equal(tipForScreen({ tour: false, overlay: false, page: 'detail' }), null)
})
test('a swipe is 48px, or a quick 24px fling; left moves on', () => {
  assert.equal(swipeStep(-60, 300), 1)
  assert.equal(swipeStep(60, 300), -1)
  assert.equal(swipeStep(-30, 40), 1)
  assert.equal(swipeStep(-30, 300), 0)
  assert.equal(swipeStep(-5, 10), 0)
})
test('a tip sits beside its target, never on it, inside the gutters', () => {
  const view = { w: 400, h: 800 }, bubble = { w: 280, h: 70 }
  const low = { top: 700, bottom: 744, left: 40, width: 320 }            // the camera's mode rail
  const a = placeTip(low, bubble, view)
  assert.equal(a.side, 'above')
  assert.ok(a.top + bubble.h <= low.top)
  const high = { top: 40, bottom: 84, left: 340, width: 44 }             // a header button at the right edge
  const b = placeTip(high, bubble, view)
  assert.equal(b.side, 'below')
  assert.ok(b.top >= high.bottom)
  assert.ok(b.left >= 16 && b.left + bubble.w <= view.w - 16)
  assert.ok(b.arrow >= 14 && b.arrow <= bubble.w - 14)
})
test('the tour copy', () => {
  assert.equal(TOUR.length, 4)
  assert.equal(TOUR[0].title('new'), 'Meet Pulse')
  assert.equal(TOUR[0].title('replay'), 'Meet Pulse')
  assert.equal(TOUR[0].title('existing'), 'CardPulse is now Pulse')
  assert.deepEqual(TOUR.slice(1).map((s) => s.title('new')), ['Several cards, one photo', 'Built for expos and exhibitions', "Follow up while it's warm"])
  assert.deepEqual([lastAction('new'), lastAction('existing'), lastAction('replay')], ['Scan your first card', "Let's go", 'Done'])
  assert.equal(TIP_TEXT.events, 'Create an event, and every card you scan is filed under it, ready to export.')
})
