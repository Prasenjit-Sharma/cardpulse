// Run: node --test test/plans.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALLOWANCE, TRIAL_BRIEFS, PASS, PACKS, PLANS, EXTRA_BRIEFS, DAILY, isUnlimited, rupees } from '../shared/plans.ts'

test('prices and allowances agreed on 9 Oct', () => {
  assert.deepEqual(ALLOWANCE, {
    free: { cards: 20, briefs: 0 }, starter: { cards: 100, briefs: 3 }, plus: { cards: 250, briefs: 5 },
    pro: { cards: 400, briefs: 20 }, unlimited: { cards: 1_000_000, briefs: 30 },
  })
  assert.deepEqual(PLANS.map((p) => [p.tier, p.monthly, p.yearly]), [['starter', 99, 999], ['plus', 199, 1999], ['pro', 399, 3499], ['unlimited', 799, 6999]])
  for (const p of PLANS) assert.ok(p.yearly < p.monthly * 12, `${p.tier} yearly saves`)
  assert.equal(TRIAL_BRIEFS, 3)
  assert.deepEqual(PASS, { cards: 1000, days: 7, price: 499 })
  assert.deepEqual(PACKS.map((p) => [p.cards, p.price]), [[50, 59], [100, 99], [200, 179]])
  assert.deepEqual([EXTRA_BRIEFS.briefs, EXTRA_BRIEFS.price], [10, 149])
  assert.deepEqual(DAILY, { reads: 300, briefs: 10, unlimitedReads: 200 })
  assert.equal(isUnlimited('unlimited'), true); assert.equal(isUnlimited('pro'), false)
  assert.equal(rupees(6999), '₹6,999')
})

test('migration 0005 uses the same numbers as shared/plans.ts', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0005_plans_balances.sql', import.meta.url), 'utf8')
  const cards = sql.match(/v_cards := case p_tier when 'pro' then (\d+) when 'plus' then (\d+) else (\d+) end/)
  assert.deepEqual(cards.slice(1).map(Number), [ALLOWANCE.pro.cards, ALLOWANCE.plus.cards, ALLOWANCE.free.cards])
  const briefs = sql.match(/v_briefs := case p_tier when 'pro' then (\d+) else 0 end/)
  assert.equal(Number(briefs[1]), ALLOWANCE.pro.briefs)
  assert.match(sql, new RegExp(`trial_briefs integer not null default ${TRIAL_BRIEFS}`))
  assert.match(sql, new RegExp(`interval '${PASS.days} days', ${PASS.cards}\\)`))
  assert.match(sql, new RegExp(`v_limit constant integer := ${DAILY.reads};`))
  assert.match(sql, new RegExp(`v_limit constant integer := ${DAILY.briefs};`))
})
