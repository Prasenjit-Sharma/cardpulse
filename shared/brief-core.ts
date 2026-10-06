// Pulse Brief: the prompt, the request to Gemini (from what it knows, or with Google Search on a paid key), and the
// checks on what comes back. Shared by the server, which makes the call, and the tests. No network and no storage here.

export interface BriefInput { name: string; title: string; company: string; address: string; website: string; domains: string[]; gstin: string }
export type LinkKind = 'linkedin' | 'website' | 'indiamart' | 'facebook' | 'instagram' | 'justdial' | 'tradeindia' | 'other'
export interface BriefLink { kind: LinkKind; url: string }
export interface BriefSource { title: string; uri: string }
export interface BriefResult { person: string; company: string; starters: string[]; links: BriefLink[]; sources: BriefSource[]; suggestions: string }

export class BriefError extends Error {}

const FIELD_MAX = 300
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
const SCALARS = ['name', 'title', 'company', 'address', 'website', 'gstin'] as const

/** What the app sent, checked: strings only, trimmed and bounded; the name or the company is needed. Null when unusable. */
export function validBriefInput(v: unknown): BriefInput | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out: BriefInput = { name: '', title: '', company: '', address: '', website: '', domains: [], gstin: '' }
  for (const k of SCALARS) {
    const x = o[k] ?? ''
    if (typeof x !== 'string') return null
    out[k] = x.trim().slice(0, FIELD_MAX)
  }
  if (o.domains !== undefined) {
    if (!Array.isArray(o.domains)) return null
    out.domains = o.domains.filter((d): d is string => typeof d === 'string' && d.length <= 100 && DOMAIN.test(d)).map((d) => d.toLowerCase()).slice(0, 3)
  }
  return out.name || out.company ? out : null
}

/**
 * The instructions. Without search (the default), the model writes only from what it already knows and says plainly
 * when it does not know this company or person: small firms are rarely in its training, and invented facts are worse
 * than none. With search (a paid key), facts come from the search results.
 */
export function briefPrompt(i: BriefInput, search = false): string {
  const card = ([
    ['Name', i.name], ['Title', i.title], ['Company', i.company], ['Address', i.address], ['Website', i.website],
    ['Email domain', i.domains.join(', ')], ['GSTIN', i.gstin],
  ] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
  if (!search) return [
    'You help a salesperson in India get ready to call or meet a business contact. You have no web access: use only what you already know.',
    '',
    'From their business card:',
    ...card,
    '',
    'Reply with a JSON object: {"person": string, "company": string, "starters": string[]}',
    'person: only if you genuinely know this specific person, 1 to 3 sentences about them. Otherwise write exactly: "No specific information on this person."',
    'company: if you genuinely know this specific company (match the name with the city, website or GSTIN), 2 to 4 sentences of what you know. Otherwise start with "No specific information on this company." and add 1 or 2 sentences on what a business like this usually does, judging only from its name, title and address (for example a "Woven Sack" firm in Surat makes PP woven sacks and bags for packaging), worded as general context, not as facts about them.',
    'starters: 2 or 3 short openers or questions the salesperson could use, based on their line of business and role.',
    'Rules: Never invent facts about this company or person: no founding years, sizes, customers, awards, people, certifications or URLs. No praise words (renowned, leading, innovative, key player, commitment to excellence). Plain Indian English.',
  ].join('\n')
  return [
    'You research a business contact for a salesperson in India who is about to call or meet them.',
    'Always run Google Search before you answer, even if you think you know them; never answer from memory alone.',
    'Search for the company (by name with the city, the website or email domain, and the GSTIN).',
    'Search for this person using their name together with their designation, company, city and website: first on LinkedIn (for example: site:linkedin.com/in "<name>" "<company>"), then elsewhere. Prefer their LinkedIn profile, and the company\'s LinkedIn page, as sources and links.',
    '',
    'From their business card:',
    ...card,
    '',
    'Reply with ONLY a JSON object, in this shape: {"person": string, "company": string, "starters": string[], "links": [{"kind": string, "url": string}]}',
    'person: 2 to 4 sentences of facts about this person at this company: their role, how long, anything public (interviews, associations, awards). If you find nothing specific about the person, write exactly: "Little public information found about this person."',
    'company: 2 to 5 sentences of facts: what they make or trade, where, since when, size, group companies, certifications, markets. If you find nothing, write exactly: "Little public information found about this company."',
    'starters: 2 or 3 short openers the salesperson could say, each tied to a fact you found (a product line, an expansion, a trade fair, a certification). With no facts found, 2 openers about their line of business, never invented facts.',
    'links: at most 5 pages from the search results that belong to this person or company, their LinkedIn profile first when found. kind is one of linkedin, website, indiamart, facebook, instagram, justdial, tradeindia, other. Only list a LinkedIn profile whose name, company and designation match this card. Never guess or build a URL.',
    'Rules: only facts from the search results. If different companies share the name, use the one matching the city, website or GSTIN, and say so if unsure. No praise words (renowned, leading, innovative, key player, commitment to excellence). Plain Indian English.',
  ].join('\n')
}

export type Thinking = 'minimal' | 'low' | 'medium' | 'high'

/** Without search the answer is plain JSON; with it, Google Search is on and JSON is only asked for in the prompt. */
export function buildBriefRequest(i: BriefInput, search = false, thinking: Thinking = 'low') {
  const contents = [{ role: 'user', parts: [{ text: briefPrompt(i, search) }] }]
  return search
    ? { contents, tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, thinkingConfig: { thinkingLevel: thinking } } }
    : { contents, generationConfig: { temperature: 0.2, responseMimeType: 'application/json' } }
}

/* ---------- the shared company store ---------- */
// What a search found about a company is public business information, so it is kept on the server for a while and
// reused for the next brief at the same company, from any account; a brief then searches only for the person. Nothing
// about a person is ever kept or shared. Only strong matches share: a GSTIN, the company's own domain, or the company's
// name with its pincode. A name alone could be a different firm in another city.

const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][A-Z\d]Z[A-Z\d]$/
const NOT_THE_COMPANY = ['linkedin.com', 'indiamart.com', 'facebook.com', 'instagram.com', 'justdial.com', 'tradeindia.com', 'google.com', 'wa.me', 'whatsapp.com', 'youtube.com', 'twitter.com', 'x.com']
const SUFFIX = /\b(m\/s|messrs|pvt|private|ltd|limited|llp|inc|the|co)\b/g

const companyName = (s: string) => s.toLowerCase().replace(SUFFIX, ' ').replace(/&/g, ' and ').replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
const siteHost = (w: string) => hostOf(/^https?:\/\//i.test(w) ? w : `https://${w}`)

/** The store keys this card's company can be found under, strongest first; empty when nothing is strong enough. */
export function companyKeys(i: BriefInput): string[] {
  const keys: string[] = []
  const g = i.gstin.toUpperCase().replace(/\s+/g, '')
  if (GSTIN.test(g)) keys.push(`gst:${g}`)
  for (const d of [siteHost(i.website), ...i.domains]) {
    if (d && DOMAIN.test(d) && !NOT_THE_COMPANY.some((x) => d === x || d.endsWith('.' + x))) keys.push(`dom:${d}`)
  }
  const pin = i.address.match(/\b(\d{3})\s?(\d{3})\b/)
  const name = companyName(i.company)
  if (pin && name) keys.push(`name:${name}|${pin[1]}${pin[2]}`)
  return [...new Set(keys)].map((k) => `co1:${k}`)
}

export interface CompanyEntry { company: string; sources: BriefSource[]; links: BriefLink[] }

/** The part of a finished brief that is about the company only, for the store. */
export function companyEntry(r: BriefResult): CompanyEntry {
  return {
    company: r.company,
    sources: r.sources.filter((x) => !onHost(x.title.toLowerCase().replace(/^www\./, ''), 'linkedin.com')),
    links: r.links.filter((l) => !(l.kind === 'linkedin' && /linkedin\.com\/in\//i.test(l.url))),
  }
}

/** The request when the company is already known: research only the person, in one search. */
export function buildPersonRequest(i: BriefInput, company: string, thinking: Thinking = 'low') {
  const card = ([['Name', i.name], ['Title', i.title], ['Company', i.company], ['Address', i.address], ['Website', i.website]] as const)
    .filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
  const text = [
    'You research a business contact for a salesperson in India who is about to call or meet them.',
    'The company has already been researched; do not search for it again. What is known about the company:',
    company,
    '',
    'Run exactly ONE Google Search, for this person: "<name>" "<company>" (LinkedIn results first). Never answer about the person from memory alone.',
    '',
    'From their business card:',
    ...card,
    '',
    'Reply with ONLY a JSON object, in this shape: {"person": string, "starters": string[], "links": [{"kind": string, "url": string}]}',
    'person: 2 to 4 sentences of facts about this person at this company: their role, how long, anything public. If you find nothing specific, write exactly: "Little public information found about this person."',
    'starters: 2 or 3 short openers the salesperson could say, each tied to a fact about the person or the company above. Never invent facts.',
    'links: at most 3 pages from your search that belong to this person, their LinkedIn profile first. kind is one of linkedin, website, indiamart, facebook, instagram, justdial, tradeindia, other. Only a LinkedIn profile whose name, company and designation match this card. Never guess or build a URL.',
    'Rules: only facts from the search results. No praise words (renowned, leading, innovative, key player). Plain Indian English.',
  ].join('\n')
  return { contents: [{ role: 'user', parts: [{ text }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2, thinkingConfig: { thinkingLevel: thinking } } }
}

/** A brief from the person-only answer and the stored company. */
export function mergeCompany(entry: CompanyEntry, fresh: BriefResult): BriefResult {
  const sources = [...fresh.sources]
  for (const x of entry.sources) if (!sources.some((y) => y.title === x.title) && sources.length < 10) sources.push(x)
  const links = [...fresh.links]
  for (const l of entry.links) if (!links.some((y) => y.url === l.url) && links.length < 5) links.push(l)
  return { ...fresh, company: entry.company, sources, links }
}

/** "in.linkedin.com" from a URL; empty when it is not an http(s) URL. */
export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase().replace(/^www\./, '') : ''
  } catch { return '' }
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const KIND_BY_HOST: [string, LinkKind][] = [['linkedin.com', 'linkedin'], ['indiamart.com', 'indiamart'], ['facebook.com', 'facebook'], ['instagram.com', 'instagram'], ['justdial.com', 'justdial'], ['tradeindia.com', 'tradeindia']]
const onHost = (host: string, domain: string) => host === domain || host.endsWith('.' + domain)

/**
 * The model's links, kept only when the search actually visited that site (its domain is one of the sources). The kind
 * comes from the host, not the model; a LinkedIn link must be a person's or a company's page.
 */
export function checkLinks(raw: unknown[], sources: BriefSource[]): BriefLink[] {
  const searched = sources.map((s) => s.title.toLowerCase().replace(/^www\./, '')).filter(Boolean)
  const out: BriefLink[] = []
  for (const x of raw) {
    if (out.length >= 5 || !x || typeof x !== 'object') continue
    const { kind, url } = x as { kind?: unknown; url?: unknown }
    if (typeof url !== 'string' || url.length > 300) continue
    const host = hostOf(url)
    if (!host || !searched.some((d) => onHost(host, d))) continue
    const byHost = KIND_BY_HOST.find(([d]) => onHost(host, d))?.[1]
    if (byHost === 'linkedin' && !/linkedin\.com\/(in|company)\/[^/?#]+/i.test(url)) continue
    const k: LinkKind = byHost ?? (kind === 'website' ? 'website' : 'other')
    if (!out.some((l) => l.url === url)) out.push({ kind: k, url })
  }
  return out
}

interface Grounding { groundingChunks?: { web?: { title?: unknown; uri?: unknown } }[]; searchEntryPoint?: { renderedContent?: unknown } }

/** Reads Gemini's grounded answer. The JSON may come inside prose or a code fence; a missing or empty answer throws. */
export function parseBriefResponse(json: unknown): BriefResult {
  const cand = (json as { candidates?: { content?: { parts?: { text?: unknown }[] }; groundingMetadata?: Grounding }[] } | null)?.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new BriefError('No answer')
  let o: Record<string, unknown>
  try { o = JSON.parse(text.slice(a, b + 1)) } catch { throw new BriefError('Unreadable answer') }
  const person = clean(o.person, 1200), company = clean(o.company, 1500)
  if (!person && !company) throw new BriefError('Empty answer')
  const starters = Array.isArray(o.starters) ? o.starters.map((s) => clean(s, 400)).filter(Boolean).slice(0, 3) : []
  const meta = cand?.groundingMetadata ?? {}
  const sources: BriefSource[] = []
  for (const c of Array.isArray(meta.groundingChunks) ? meta.groundingChunks : []) {
    const w = c?.web
    if (!w || typeof w.uri !== 'string' || !/^https:\/\//.test(w.uri)) continue
    const title = clean(w.title, 120) || hostOf(w.uri)
    if (!sources.some((s) => s.title === title) && sources.length < 10) sources.push({ title, uri: w.uri })
  }
  const rendered = meta.searchEntryPoint?.renderedContent
  return { person, company, starters, links: checkLinks(Array.isArray(o.links) ? o.links : [], sources), sources, suggestions: typeof rendered === 'string' ? rendered.slice(0, 20_000) : '' }
}
