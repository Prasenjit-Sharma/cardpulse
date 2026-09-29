// Pulse Brief: the prompt, the request to Gemini with Google Search, and the checks on what comes back. Shared by the
// server, which makes the call, and the tests. No network and no storage here.

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

/** The instructions: facts from the search only, said plainly, and a short honest line when little is public. */
export function briefPrompt(i: BriefInput): string {
  const card = ([
    ['Name', i.name], ['Title', i.title], ['Company', i.company], ['Address', i.address], ['Website', i.website],
    ['Email domain', i.domains.join(', ')], ['GSTIN', i.gstin],
  ] as const).filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
  return [
    'You research a business contact for a salesperson in India who is about to call or meet them. Use Google Search:',
    'search for the company (by name with the city, the website or email domain, and the GSTIN) and for this person at that company.',
    '',
    'From their business card:',
    ...card,
    '',
    'Reply with ONLY a JSON object, in this shape: {"person": string, "company": string, "starters": string[], "links": [{"kind": string, "url": string}]}',
    'person: 2 to 4 sentences of facts about this person at this company: their role, how long, anything public (interviews, associations, awards). If you find nothing specific about the person, write exactly: "Little public information found about this person."',
    'company: 2 to 5 sentences of facts: what they make or trade, where, since when, size, group companies, certifications, markets. If you find nothing, write exactly: "Little public information found about this company."',
    'starters: 2 or 3 short openers the salesperson could say, each tied to a fact you found (a product line, an expansion, a trade fair, a certification). With no facts found, 2 openers about their line of business, never invented facts.',
    'links: at most 5 pages from the search results that belong to this person or company. kind is one of linkedin, website, indiamart, facebook, instagram, justdial, tradeindia, other. Never guess or build a URL.',
    'Rules: only facts from the search results. If different companies share the name, use the one matching the city, website or GSTIN, and say so if unsure. No praise words (renowned, leading, innovative, key player, commitment to excellence). Plain Indian English.',
  ].join('\n')
}

export function buildBriefRequest(i: BriefInput) {
  return { contents: [{ role: 'user', parts: [{ text: briefPrompt(i) }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }
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
