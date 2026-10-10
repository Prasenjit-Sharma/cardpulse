// Run: node --test test/plans.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { ALLOWANCE, MY_CARDS, PASS_MY_CARDS, TRIAL_BRIEFS, PASS, PACKS, PLANS, EXTRA_BRIEFS, DAILY, isUnlimited, rupees } from '../shared/plans.ts'

test('prices and allowances agreed on 9 Oct', () => {
  assert.deepEqual(ALLOWANCE, {
    free: { cards: 20, briefs: 0 }, starter: { cards: 100, briefs: 3 }, plus: { cards: 250, briefs: 5 },
    pro: { cards: 400, briefs: 20 }, unlimited: { cards: 3000, briefs: 30 },
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

test('digital cards by plan: 1 free, 2 up to ₹100, 3 up to ₹200, 5 above', async () => {
  assert.deepEqual(MY_CARDS, { free: 1, starter: 2, plus: 3, pro: 5, unlimited: 5 })
  for (const p of PLANS) assert.equal(MY_CARDS[p.tier], p.monthly <= 100 ? 2 : p.monthly <= 200 ? 3 : 5, p.tier)
  const { MAX_CARDS } = await import('../src/lib/mycards.ts')
  assert.equal(Math.max(...Object.values(MY_CARDS)), MAX_CARDS)
  const sql = readFileSync(new URL('../supabase/migrations/0008_my_cards_limit.sql', import.meta.url), 'utf8')
  const m = sql.match(/case p_tier when 'unlimited' then (\d+) when 'pro' then (\d+) when 'plus' then (\d+) when 'starter' then (\d+) else (\d+) end/)
  assert.deepEqual(m.slice(1).map(Number), ['unlimited', 'pro', 'plus', 'starter', 'free'].map((t) => MY_CARDS[t]), 'migration 0008 matches')
  assert.equal(PASS_MY_CARDS, 5)
  const pass = readFileSync(new URL('../supabase/migrations/0009_pass_my_cards.sql', import.meta.url), 'utf8')
  assert.match(pass, new RegExp(`_active_pass\\(v_uid\\)\\)\\.id is not null then ${PASS_MY_CARDS} else 0`), 'migration 0009 matches')
})

test('the latest _allow (migration 0011) and the 0007 brakes use the same numbers as shared/plans.ts', () => {
  const sql = readFileSync(new URL('../supabase/migrations/0011_unlimited_fair_use.sql', import.meta.url), 'utf8')
  const brakes = readFileSync(new URL('../supabase/migrations/0007_plans_v2.sql', import.meta.url), 'utf8')
  const tiers = ['unlimited', 'pro', 'plus', 'starter']
  const cards = sql.match(/v_cards := case p_tier when 'unlimited' then (\d+) when 'pro' then (\d+) when 'plus' then (\d+) when 'starter' then (\d+) else (\d+) end/)
  assert.deepEqual(cards.slice(1).map(Number), [...tiers.map((t) => ALLOWANCE[t].cards), ALLOWANCE.free.cards])
  const briefs = sql.match(/v_briefs := case p_tier when 'unlimited' then (\d+) when 'pro' then (\d+) when 'plus' then (\d+) when 'starter' then (\d+) else 0 end/)
  assert.deepEqual(briefs.slice(1).map(Number), tiers.map((t) => ALLOWANCE[t].briefs))
  assert.match(brakes, new RegExp(`'unlimited' then ${DAILY.unlimitedReads} else ${DAILY.reads} end`))
  assert.match(brakes, new RegExp(`v_limit constant integer := ${DAILY.briefs};`))
  const s5 = readFileSync(new URL('../supabase/migrations/0005_plans_balances.sql', import.meta.url), 'utf8')
  assert.match(s5, new RegExp(`trial_briefs integer not null default ${TRIAL_BRIEFS}`))
  assert.match(s5, new RegExp(`interval '${PASS.days} days', ${PASS.cards}\\)`))
})
