// The one price list. The app's screens read it; migration 0007 must use the same numbers (test/plans.test.mjs).
// Prices are hypotheses to test with real users (ROADMAP section 5): change them here and nowhere else.
export type Tier = 'free' | 'starter' | 'plus' | 'pro' | 'unlimited'
export type PaidTier = Exclude<Tier, 'free'>

export const ALLOWANCE: Record<Tier, { cards: number; briefs: number }> = {
  free: { cards: 20, briefs: 0 },
  starter: { cards: 100, briefs: 3 },
  plus: { cards: 250, briefs: 5 },
  pro: { cards: 400, briefs: 20 },
  unlimited: { cards: 3000, briefs: 30 },   // shown as "Unlimited": fair use 3,000 a month and DAILY.unlimitedReads a day
}
export const isUnlimited = (t: Tier) => t === 'unlimited'
/** Digital cards (My Card) a plan may hold: plans up to ₹100 a month get 2, up to ₹200 get 3, above that 5. */
export const MY_CARDS: Record<Tier, number> = { free: 1, starter: 2, plus: 3, pro: 5, unlimited: 5 }
/** While an Exhibition pass runs, the account keeps this many whatever its plan; when it ends the plan's own number returns. */
export const PASS_MY_CARDS = 5
export const TRIAL_BRIEFS = 3
export const PASS = { cards: 1000, days: 7, price: 499 }
export const PLANS: { tier: PaidTier; name: string; monthly: number; yearly: number; gives: string }[] = [
  { tier: 'starter', name: 'Starter', monthly: 99, yearly: 999, gives: '100 cards and 3 Pulse Briefs a month' },
  { tier: 'plus', name: 'Plus', monthly: 199, yearly: 1999, gives: '250 cards and 5 Pulse Briefs a month' },
  { tier: 'pro', name: 'Pro', monthly: 399, yearly: 3499, gives: '400 cards and 20 Pulse Briefs a month' },
  { tier: 'unlimited', name: 'Unlimited', monthly: 799, yearly: 6999, gives: 'Unlimited cards (fair use 200 a day, 3,000 a month) and 30 Pulse Briefs a month' },
]
export const PACKS = [
  { id: 'pack50', cards: 50, price: 59 },
  { id: 'pack100', cards: 100, price: 99 },
  { id: 'pack200', cards: 200, price: 179 },
] as const
export const EXTRA_BRIEFS = { id: 'briefs10', briefs: 10, price: 149 }
/** Abuse brakes per account per day, not prices; Unlimited's fair use is its own, lower read brake. */
export const DAILY = { reads: 300, briefs: 10, unlimitedReads: 200 }
/** At or below this many cards left, Home shows the figure in amber. */
export const LOW_CARDS = 5
/** Unlimited shows "Unlimited" until this little of its month's fair use is left, then the count, in amber. */
export const UNLIMITED_LOW = 300

export const rupees = (n: number) => `₹${n.toLocaleString('en-IN')}`
