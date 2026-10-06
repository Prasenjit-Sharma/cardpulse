// The one price list. The app's screens read it; migration 0005 must use the same numbers (test/plans.test.mjs).
// Prices are hypotheses to test with real users (ROADMAP section 5): change them here and nowhere else.
export type Tier = 'free' | 'plus' | 'pro'

export const ALLOWANCE: Record<Tier, { cards: number; briefs: number }> = {
  free: { cards: 20, briefs: 0 },
  plus: { cards: 150, briefs: 0 },
  pro: { cards: 400, briefs: 20 },
}
export const TRIAL_BRIEFS = 3
export const PASS = { cards: 1000, days: 7, price: 499 }
export const PLANS: { tier: Exclude<Tier, 'free'>; name: string; monthly: number; yearly: number; gives: string }[] = [
  { tier: 'plus', name: 'Plus', monthly: 99, yearly: 999, gives: '150 cards a month' },
  { tier: 'pro', name: 'Pro', monthly: 399, yearly: 3499, gives: '400 cards and 20 Pulse Briefs a month' },
]
export const PACKS = [
  { id: 'pack50', cards: 50, price: 59 },
  { id: 'pack100', cards: 100, price: 99 },
  { id: 'pack200', cards: 200, price: 179 },
] as const
export const EXTRA_BRIEFS = { id: 'briefs10', briefs: 10, price: 149 }
/** Abuse brakes per account per day, not prices. */
export const DAILY = { reads: 300, briefs: 10 }
/** At or below this many cards left, Home shows the figure in amber. */
export const LOW_CARDS = 5

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
