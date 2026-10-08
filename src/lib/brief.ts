import type { BriefInput, BriefLink, BriefResult } from '../../shared/brief-core.ts'
import { splitAddress } from './address.ts'
import type { Contact } from './types.ts'

// Pulse Brief on the phone: what is sent, the call, the text that is copied or shared, and the links added to a contact.

/** A brief as kept on the contact: the server's answer, when it was made and by which model. */
/** `unchecked`: written without a web search (the server asked twice), so it has nothing behind it to check. */
export interface Brief extends BriefResult { at: number; model: string; unchecked?: boolean }
export type Section = 'person' | 'company' | 'starters'

/** Google's terms let the user keep their own grounded results for up to two years. */
export const BRIEF_KEEP_MS = 2 * 365 * 86_400_000

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'rediffmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'zohomail.in'])

/** What the server needs to find this person: who they are on the card. Never phones, notes, tags or the log. */
export function briefInput(c: Contact): BriefInput {
  const domains = [...new Set(c.emails.map((e) => e.split('@')[1]?.trim().toLowerCase() ?? '').filter((d) => d && !FREE_MAIL.has(d)))].slice(0, 3)
  return { name: c.name.trim(), title: c.title.trim(), company: c.company.trim(), address: c.address.trim(), website: c.website.trim(), domains, gstin: c.gstin.trim() }
}
export const canBrief = (c: Contact): boolean => !!(c.name.trim() || c.company.trim())

/** The contact's brief, unless it is past the two years it may be kept. */
export const freshBrief = (c: Contact, now: number = Date.now()): Brief | undefined => (c.brief && now - c.brief.at < BRIEF_KEEP_MS ? c.brief : undefined)

/* ---------- the text that is copied and shared ---------- */

const HEADING: Record<Section, string> = { person: 'About the person', company: 'About the company', starters: 'Conversation starters' }
const body = (b: Brief, s: Section) => (s === 'starters' ? b.starters.map((x) => `• ${x}`).join('\n') : b[s])

/** WhatsApp-friendly plain text: who, the sections (all, or one), the sources, and where it came from. */
export function briefText(c: Contact, b: Brief, only?: Section): string {
  const name = c.name.trim(), company = c.company.trim(), city = splitAddress(c.address).city
  const head = `*${name || company}*${[name ? company : '', city].filter(Boolean).map((x) => `, ${x}`).join('')}`
  const sections = (only ? [only] : (['person', 'company', 'starters'] as Section[])).filter((s) => body(b, s)).map((s) => `*${HEADING[s]}*\n${body(b, s)}`)
  const sources = [...new Set(b.sources.map((s) => s.title))].slice(0, 5)
  return [head, ...sections, `${sources.length ? `Sources: ${sources.join(', ')}\n` : ''}via Pulse Brief`].join('\n\n')
}

/* ---------- links found by the search ---------- */

const LABEL: Record<BriefLink['kind'], string> = { linkedin: 'LinkedIn profile', website: 'Website', indiamart: 'IndiaMART', facebook: 'Facebook', instagram: 'Instagram', justdial: 'Justdial', tradeindia: 'TradeIndia', other: 'Web page' }
export const linkLabel = (l: BriefLink): string => (l.kind === 'linkedin' && /\/company\//i.test(l.url) ? 'LinkedIn page' : LABEL[l.kind])
const same = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
export const hasLink = (c: Contact, url: string): boolean => [c.website, ...c.social].some((x) => x && same(x) === same(url))

/** A found link added to the contact: a website fills an empty website field, anything else joins the social links. */
export function addLink(c: Contact, l: BriefLink): Contact {
  if (hasLink(c, l.url)) return c
  if (l.kind === 'website' && !c.website.trim()) return { ...c, website: l.url }
  return { ...c, social: [...c.social, l.url] }
}

/* ---------- the call ---------- */

export type FailureCode = 'sign_in' | 'daily_limit' | 'offline' | 'failed' | 'plan_needed' | 'no_briefs'
export class BriefFailure extends Error {
  code: FailureCode
  constructor(code: FailureCode, message: string) { super(message); this.code = code }
}
const MESSAGE: Record<FailureCode, string> = {
  sign_in: 'Sign in to use Pulse Brief.', daily_limit: "You've used today's 10 fresh briefs. Saved briefs still open. Resets at 5:30 am.",
  offline: 'Pulse Brief needs a connection.', failed: "Couldn't make the brief. Try again.",
  plan_needed: 'Pulse Brief comes with every plan.', no_briefs: 'No briefs left this month.',
}
const SERVER_CODES = new Set<FailureCode>(['daily_limit', 'sign_in', 'plan_needed', 'no_briefs'])

/** Asks the server for a brief. Every failure becomes a BriefFailure the page can show as it is. */
/**
 * `onBalance` gets what the account has left, from every answer that carries it (it is never saved on the contact).
 * `fresh` (Refresh) asks for new company research instead of what was found at this company before.
 */
export async function requestBrief(c: Contact, deps: { url: string; token: string | undefined; online: boolean; fetch: typeof fetch; now?: number; onBalance?: (b: unknown) => void; fresh?: boolean }): Promise<Brief> {
  if (!deps.online) throw new BriefFailure('offline', MESSAGE.offline)
  if (!deps.token) throw new BriefFailure('sign_in', MESSAGE.sign_in)
  let res: Response
  try {
    res = await deps.fetch(`${deps.url}/v1/brief`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: briefInput(c), auth: deps.token, ...(deps.fresh ? { fresh: true } : {}) }), signal: AbortSignal.timeout(60_000) })
  } catch { throw new BriefFailure('failed', MESSAGE.failed) }
  const json = await res.json().catch(() => ({})) as Partial<Brief> & { error?: { code?: string; message?: string }; balance?: unknown }
  if (json.balance != null) deps.onBalance?.(json.balance)
  if (!res.ok) {
    const code: FailureCode = SERVER_CODES.has(json.error?.code as FailureCode) ? json.error!.code as FailureCode : 'failed'
    throw new BriefFailure(code, code === 'failed' ? MESSAGE.failed : json.error?.message || MESSAGE[code])
  }
  return {
    person: json.person ?? '', company: json.company ?? '', starters: json.starters ?? [], links: json.links ?? [], sources: json.sources ?? [],
    suggestions: json.suggestions ?? '', model: json.model ?? '', at: deps.now ?? Date.now(),
    ...((json as { unchecked?: unknown }).unchecked === true ? { unchecked: true } : {}),
  }
}

/* ---------- one search per contact, surviving the page being closed ---------- */

const pending = new Map<string, Promise<Brief>>()
/** Starts a search for `key` (card id and person), or joins the one already running. */
export function runBrief(key: string, start: () => Promise<Brief>): Promise<Brief> {
  let p = pending.get(key)
  if (!p) { p = start().finally(() => pending.delete(key)); pending.set(key, p) }
  return p
}
export const pendingBrief = (key: string): Promise<Brief> | undefined => pending.get(key)
