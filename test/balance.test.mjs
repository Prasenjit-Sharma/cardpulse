// Run: node --test test/balance.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { parseBalance, cardsLine, cardsFigure, isLow, briefLine, shouldResume, setBalance, getBalance, forgetBalance } from '../src/lib/balance.ts'

const base = { tier: 'free', periodEnd: '2026-11-01T00:00:00+05:30', cards: { month: { used: 0, allowance: 20 }, pass: null, pack: 0, left: 20 }, briefs: { month: { used: 0, allowance: 0 }, extra: 0, trial: 3, left: 3 } }
const withCards = (left) => ({ ...base, cards: { ...base.cards, left } })

test('parseBalance accepts the server shape and refuses anything else', () => {
  assert.deepEqual(parseBalance(base), { ...base, canCollect: false }, 'a balance cached before 0007 has no canCollect: off')
  const pass = { ...base, cards: { ...base.cards, pass: { used: 3, allowance: 1000, endsAt: '2026-10-12T10:00:00Z' } } }
  assert.deepEqual(parseBalance(pass), { ...pass, canCollect: false })
  for (const tier of ['starter', 'plus', 'pro', 'unlimited']) assert.equal(parseBalance({ ...base, tier, canCollect: true })?.canCollect, true, tier)
  for (const bad of [null, {}, 'x', { ...base, tier: 'gold' }, { ...base, cards: { left: 'x' } }, { ...base, briefs: null }]) assert.equal(parseBalance(bad), null)
})

test('cards line and the low threshold', () => {
  assert.equal(cardsLine(withCards(132)), '132 cards left')
  assert.equal(cardsLine(withCards(1)), '1 card left')
  assert.equal(cardsLine(withCards(0)), 'No cards left')
  assert.equal(isLow(withCards(5)), true); assert.equal(isLow(withCards(6)), false)
})

test('brief line: trial on Free, the month on Pro, extra after it, nothing when none left', () => {
  assert.equal(briefLine(base), '3 of 3 trial briefs left')
  const pro = { ...base, tier: 'pro', briefs: { month: { used: 6, allowance: 20 }, extra: 0, trial: 0, left: 14 } }
  assert.equal(briefLine(pro), '14 briefs left this month')
  assert.equal(briefLine({ ...pro, briefs: { ...pro.briefs, extra: 9, left: 23 } }), '14 briefs left this month, 9 extra')
  assert.equal(briefLine({ ...base, briefs: { ...base.briefs, trial: 0, left: 0 } }), '')
})

test('waiting cards resume only when what they wait for has arrived', () => {
  assert.equal(shouldResume('offline', { signedIn: false, balance: null }), true)
  assert.equal(shouldResume(undefined, { signedIn: false, balance: null }), true)
  assert.equal(shouldResume('cards', { signedIn: true, balance: withCards(0) }), false)
  assert.equal(shouldResume('cards', { signedIn: true, balance: withCards(3) }), true)
  assert.equal(shouldResume('cards', { signedIn: true, balance: null }), false, 'unknown balance: wait for one')
  assert.equal(shouldResume('sign_in', { signedIn: false, balance: null }), false)
  assert.equal(shouldResume('sign_in', { signedIn: true, balance: null }), true)
})

test('a balance saved for one account is never shown for another', () => {
  setBalance(withCards(7), 'user-a')
  assert.equal(getBalance('user-a').cards.left, 7)
  assert.equal(getBalance('user-b'), null)
  forgetBalance()
  assert.equal(getBalance('user-a'), null)
})

test('scanGate: ask to sign in only once the session is known to be empty', async () => {
  const { scanGate } = await import('../src/lib/balance.ts')
  const base = { accounts: true, ownKey: false, sessionKnown: true, signedIn: false }
  assert.equal(scanGate(base), 'sign_in')
  assert.equal(scanGate({ ...base, sessionKnown: false }), 'wait', 'still loading: a signed-in user must not be asked to sign in')
  assert.equal(scanGate({ ...base, signedIn: true }), 'open')
  assert.equal(scanGate({ ...base, accounts: false }), 'open')
  assert.equal(scanGate({ ...base, ownKey: true }), 'open')
})

test('v2: Unlimited shows as unlimited, and every paid plan counts its month of briefs', () => {
  const unl = { ...base, tier: 'unlimited', canCollect: true, cards: { ...base.cards, month: { used: 40, allowance: 1000000 }, left: 999960 } }
  assert.equal(cardsLine(unl), 'Unlimited cards')
  assert.equal(isLow(unl), false)
  const starter = { ...base, tier: 'starter', briefs: { month: { used: 2, allowance: 3 }, extra: 0, trial: 0, left: 1 } }
  assert.equal(briefLine(starter), '1 brief left this month')
  assert.equal(briefLine({ ...starter, tier: 'pro', briefs: { month: { used: 0, allowance: 20 }, extra: 0, trial: 0, left: 20 } }), '20 briefs left this month')
})

test('the Home figure: a count, or Unlimited (never 1000000)', () => {
  assert.equal(cardsFigure(withCards(132)), '132')
  assert.equal(cardsFigure({ ...base, tier: 'unlimited', cards: { ...base.cards, left: 1000012 } }), 'Unlimited')
})
