// What the account has left, as the server last said (migration 0005's balance). Kept in memory and localStorage so
// Home and Pulse Brief can show it offline; every read and brief answer brings a newer one. Pure apart from the small
// store at the bottom; the fetching hook is in useBalance.ts.
import { isUnlimited, LOW_CARDS, TRIAL_BRIEFS, type Tier } from '../../shared/plans.ts'

export interface Balance {
  tier: Tier
  periodEnd: string
  /** Lead capture and brochures: an active paid plan or Exhibition pass (migration 0007). */
  canCollect: boolean
  cards: { month: { used: number; allowance: number }; pass: { used: number; allowance: number; endsAt: string } | null; pack: number; left: number }
  briefs: { month: { used: number; allowance: number }; extra: number; trial: number; left: number }
}

const num = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x)
const pair = (x: unknown) => !!x && typeof x === 'object' && num((x as { used?: unknown }).used) && num((x as { allowance?: unknown }).allowance)

/** The balance from a server answer, or null if it is missing or not in the expected shape. */
export function parseBalance(x: unknown): Balance | null {
  const b = x as Partial<Balance> | null
  if (!b || typeof b !== 'object' || !['free', 'starter', 'plus', 'pro', 'unlimited'].includes(b.tier as string) || typeof b.periodEnd !== 'string') return null
  const c = b.cards, r = b.briefs
  if (!c || !pair(c.month) || !num(c.pack) || !num(c.left) || (c.pass !== null && !(pair(c.pass) && typeof c.pass?.endsAt === 'string'))) return null
  if (!r || !pair(r.month) || !num(r.extra) || !num(r.trial) || !num(r.left)) return null
  // a balance cached before 0007 has no canCollect: off until the server says otherwise
  return { ...(b as Balance), canCollect: b.canCollect === true }
}

export const cardsLine = (b: Balance) => (isUnlimited(b.tier) ? 'Unlimited cards' : b.cards.left === 0 ? 'No cards left' : `${b.cards.left} ${b.cards.left === 1 ? 'card' : 'cards'} left`)
/** The figure Home shows: the count, or "Unlimited" (Unlimited's allowance is a large number, never shown). */
export const cardsFigure = (b: Balance) => (isUnlimited(b.tier) ? 'Unlimited' : String(b.cards.left))
export const isLow = (b: Balance) => !isUnlimited(b.tier) && b.cards.left <= LOW_CARDS

/** The line under Pulse Brief: a paid plan's month (and extra), or the trial; empty when none are left. */
export function briefLine(b: Balance): string {
  if (b.briefs.left === 0) return ''
  const month = Math.max(b.briefs.month.allowance - b.briefs.month.used, 0)
  if (b.tier !== 'free') return `${month} ${month === 1 ? 'brief' : 'briefs'} left this month${b.briefs.extra ? `, ${b.briefs.extra} extra` : ''}`
  if (b.briefs.extra) return `${b.briefs.extra} extra briefs left`
  return `${b.briefs.trial} of ${TRIAL_BRIEFS} trial briefs left`
}

export type Waiting = 'offline' | 'retry' | 'cards' | 'sign_in' | undefined
/** A parked card goes back in the queue only once what it waits for has arrived: cards, or a sign-in. */
export function shouldResume(w: Waiting, s: { signedIn: boolean; balance: Balance | null }): boolean {
  if (w === 'cards') return s.signedIn && !!s.balance && s.balance.cards.left > 0
  if (w === 'sign_in') return s.signedIn
  return true
}

/**
 * What the Scan key does: open the camera, ask to sign in (reading needs an account), or wait while the session is
 * still loading at app start, so a signed-in user is never asked to sign in.
 */
export function scanGate(s: { accounts: boolean; ownKey: boolean; sessionKnown: boolean; signedIn: boolean }): 'open' | 'sign_in' | 'wait' {
  if (!s.accounts || s.ownKey || s.signedIn) return 'open'
  return s.sessionKnown ? 'sign_in' : 'wait'
}

/* ---------- the store ---------- */

const KEY = 'cardpulse.balance'
let current: { owner?: string; b: Balance } | null = null
try {
  const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null') as { owner?: string; b?: unknown } | null
  const b = parseBalance(raw?.b)
  if (b) current = { owner: raw?.owner, b }
} catch { /* no storage here */ }
const subs = new Set<() => void>()

/** The last balance seen for this account; a different account's balance is never returned. */
export const getBalance = (owner?: string): Balance | null => (current && (!owner || current.owner === owner) ? current.b : null)
export function setBalance(b: Balance | null, owner?: string) {
  current = b ? { owner, b } : null
  try { if (current) localStorage.setItem(KEY, JSON.stringify(current)); else localStorage.removeItem(KEY) } catch { /* ignore */ }
  subs.forEach((f) => f())
}
export const forgetBalance = () => setBalance(null)
export function subscribe(fn: () => void): () => void { subs.add(fn); return () => { subs.delete(fn) } }
