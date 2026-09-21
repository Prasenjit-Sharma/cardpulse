// Run: node --test test/feedback.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildFeedback } from '../src/lib/feedback.ts'

const diag = { version: '1.2.0', userAgent: 'Pixel 7', online: false, installed: true, screen: '412x915', cards: { total: 40, failed: 2, waiting: 3 }, settings: { keepPhotos: 'full', theme: 'system', ownKey: false }, failures: ['No connection. It will be read when you are back online.'], recentLog: ['10:01 refresh: 40 cards'] }

test('the message alone is sent as written', () => {
  assert.equal(buildFeedback('  Search is slow  '), 'Search is slow')
  assert.equal(buildFeedback(''), '(no message)')
})
test('with diagnostics it adds the version, device, counts and recent errors, and says it holds no contact details', () => {
  const t = buildFeedback('It crashed', diag)
  for (const part of ['It crashed', 'no contact details', 'CardPulse v1.2.0 (installed)', 'Pixel 7', 'Online: no', '40 total, 2 failed, 3 waiting', 'own key=no', 'No connection', '10:01 refresh']) assert.ok(t.includes(part), part)
})
test('the report has no place for a key, name, phone or email', () => {
  const t = buildFeedback('x', diag)
  assert.ok(!/apiKey|AIza|@|\+91/.test(t))
})
