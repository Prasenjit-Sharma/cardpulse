// CardPulse API — a thin, locked-down proxy in front of Gemini.
// The app sends card photos; the prompt, schema and API key live here, so this endpoint cannot be used as a general Gemini gateway.
import { buildRequest, GeminiError, MAX_IMAGES, parseResponse, type ImageInput, type Layout } from '../shared/extract-core.ts'
import { BriefError, buildBriefRequest, parseBriefResponse, THINKING, validBriefInput, type Thinking } from '../shared/brief-core.ts'

export interface Env {
  GEMINI_API_KEY: string
  GEMINI_MODEL?: string
  /** The model for Pulse Brief. Falls back to GEMINI_MODEL. */
  BRIEF_MODEL?: string
  /** "1" turns on Google Search for Pulse Brief. Needs a key whose plan allows Search grounding (a paid key). */
  BRIEF_SEARCH?: string
  /** Thinking level for a searched brief: minimal, low (default), medium or high. Thinking is billed as output. */
  BRIEF_THINKING?: string
  /** Optional key for Pulse Brief alone (a paid project's), so card reading stays on GEMINI_API_KEY's free tier. */
  BRIEF_API_KEY?: string
  /** Comma-separated exact origins allowed to call this API, e.g. https://you.github.io */
  ALLOWED_ORIGINS?: string
  /** "1" also allows localhost and private-LAN origins (local development only). */
  ALLOW_LAN?: string
  /** Override the upstream, used by tests. */
  GEMINI_BASE?: string
  /** With both set, reading needs sign-in, and reads and briefs are checked and charged against the account (migration 0005). */
  SUPABASE_URL?: string
  SUPABASE_PUBLISHABLE_KEY?: string
}

const DEFAULT_MODEL = 'gemini-2.5-flash'
const UPSTREAM = 'https://generativelanguage.googleapis.com/v1beta'
// Size caps per layout. The free Workers plan allows ~10 ms of CPU per request and handling a request costs roughly
// 1 ms per MB of base64, so a six-photo batch is capped well below what two front/back photos may use.
const MAX_BASE64_CHARS: Record<Layout, number> = { sides: 8_000_000, batch: 4_400_000 }
const MIMES = new Set(['image/jpeg', 'image/png', 'image/webp'])
const WINDOW_MS = 10 * 60_000
const MAX_PER_WINDOW = 30 // per client IP, per isolate: a best-effort brake, not a billing guarantee

const LAN = /^https?:\/\/(localhost|127\.0\.0\.1|192\.168\.\d+\.\d+|10\.\d+\.\d+\.\d+)(:\d+)?$/
const hits = new Map<string, number[]>()

/** Seconds until the caller may retry, or 0 if under the limit. */
export function checkRate(ip: string, now = Date.now()): number {
  const recent = (hits.get(ip) ?? []).filter((t) => now - t < WINDOW_MS)
  if (recent.length >= MAX_PER_WINDOW) { hits.set(ip, recent); return Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000) }
  recent.push(now)
  hits.set(ip, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k)
  return 0
}

function originAllowed(origin: string | null, env: Env): boolean {
  if (!origin) return false
  if ((env.ALLOWED_ORIGINS ?? '').split(',').map((s) => s.trim()).filter(Boolean).includes(origin)) return true
  return env.ALLOW_LAN === '1' && LAN.test(origin)
}

function json(body: unknown, status: number, origin: string | null, extra: Record<string, string> = {}): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      'Cache-Control': 'no-store',
      ...(origin ? { 'Access-Control-Allow-Origin': origin, Vary: 'Origin' } : {}),
      ...extra,
    },
  })
}
const fail = (status: number, code: string, message: string, origin: string | null, extra?: Record<string, string>) =>
  json({ error: { code, message } }, status, origin, extra)

function validImages(v: unknown, layout: Layout): ImageInput[] | null {
  if (!Array.isArray(v) || v.length < 1 || v.length > MAX_IMAGES[layout]) return null
  let total = 0
  const out: ImageInput[] = []
  for (const x of v) {
    if (!x || typeof x !== 'object') return null
    const { mime, data } = x as { mime?: unknown; data?: unknown }
    if (typeof mime !== 'string' || !MIMES.has(mime) || typeof data !== 'string' || !/^[A-Za-z0-9+/=]+$/.test(data)) return null
    total += data.length
    out.push({ mime, data })
  }
  return total <= MAX_BASE64_CHARS[layout] ? out : null
}

/** The balance check must never hold up a scan for long: past this, go ahead uncharged under the per-IP limit. */
const QUOTA_TIMEOUT_MS = 3000

/** The account id inside a token Supabase has just accepted. Only read after Supabase validated the token. */
function tokenSubject(token: string): string | null {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const sub = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))).sub
    return typeof sub === 'string' ? sub : null
  } catch { return null }
}

export type Use =
  | { kind: 'account'; userId: string; balance: unknown }
  | { kind: 'over'; reason: string; limit: number; balance: unknown }
  | { kind: 'none' }
  /** Supabase refused the token (made up, expired): the caller is not signed in. */
  | { kind: 'refused' }

/** Supabase answered 401 or 403: the token is not a valid sign-in. Kept apart from an outage, which reads uncharged. */
const REFUSED = Symbol('refused')

/** One Supabase function, called with the user's own token (the Worker holds no Supabase secret). null on any failure. */
async function rpc(fn: string, token: string, env: Env, args: Record<string, unknown> = {}): Promise<unknown | typeof REFUSED> {
  try {
    const res = await fetch(`${env.SUPABASE_URL!.replace(/\/$/, '')}/rest/v1/rpc/${fn}`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY!, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(args),
      signal: AbortSignal.timeout(QUOTA_TIMEOUT_MS),
    })
    if (res.status === 401 || res.status === 403) return REFUSED
    return res.ok ? await res.json() : null
  } catch { return null }
}

const usable = (token: unknown, env: Env): token is string =>
  typeof token === 'string' && !!token && token.length <= 4096 && !!env.SUPABASE_URL && !!env.SUPABASE_PUBLISHABLE_KEY

/**
 * Before a read or a brief (migration 0005's begin_read / begin_brief): is a card or brief left, and is the account
 * under today's brake? Anything that goes wrong — no token, a bad or expired token, Supabase slow or down, 0005 not
 * applied — is `none`: the caller goes ahead uncharged under the per-IP brake. Losing a card at a stall is worse.
 */
export async function beginUse(token: unknown, env: Env, what: 'read' | 'brief'): Promise<Use> {
  if (!usable(token, env)) return { kind: 'none' }
  const body = await rpc(what === 'read' ? 'begin_read' : 'begin_brief', token, env)
  if (body === REFUSED) return { kind: 'refused' }
  const row = (Array.isArray(body) ? body[0] : body) as { allowed?: unknown; reason?: unknown; day_limit?: unknown; balance?: unknown } | null | undefined
  if (!row || typeof row.allowed !== 'boolean') return { kind: 'none' }
  if (!row.allowed) return { kind: 'over', reason: typeof row.reason === 'string' ? row.reason : 'daily_limit', limit: Number(row.day_limit) || 0, balance: row.balance ?? null }
  const userId = tokenSubject(token)
  return userId ? { kind: 'account', userId, balance: row.balance ?? null } : { kind: 'none' }
}

/** After a good answer: the new balance, or null if the charge did not land (logged; the answer still goes back). */
async function charge(token: string, env: Env, fn: 'charge_reads' | 'charge_brief', args: Record<string, unknown> = {}): Promise<unknown> {
  const b = await rpc(fn, token, env, args)
  if (b === REFUSED) { console.log(`${fn} refused: the token expired during the call, not charged`); return null }
  if (b == null) console.log(`${fn} failed: not charged`)
  return b
}

/** charge_reads refuses more than this in one call. */
const MAX_CHARGE = 200

/** A read is normally 3 to 10 s. Past this the request is stuck upstream; fail fast so the app can retry. */
const UPSTREAM_TIMEOUT_MS = 40_000
const BRIEF_BODY_MAX = 16_384

/**
 * One log line of what a call is billed for: tokens in, tokens out (thinking is billed as output, so it is shown apart),
 * and the Google searches it ran (Gemini 3 bills each query). `wrangler tail` shows it; nothing reaches the app.
 */
export function usageLine(json: unknown): string {
  const r = json as { usageMetadata?: Record<string, unknown>; candidates?: { groundingMetadata?: { webSearchQueries?: unknown } }[] } | null
  const u = r?.usageMetadata ?? {}
  const n = (k: string) => (typeof u[k] === 'number' ? (u[k] as number) : 0)
  const queries = r?.candidates?.[0]?.groundingMetadata?.webSearchQueries
  return `in=${n('promptTokenCount') + n('toolUsePromptTokenCount')} out=${n('candidatesTokenCount')} thinking=${n('thoughtsTokenCount')} searches=${Array.isArray(queries) ? queries.length : 0}`
}

/** Pulse Brief: a short brief on one contact. Signed-in only, with its own daily limit; nothing is stored here. */
async function brief(req: Request, env: Env, origin: string | null): Promise<Response> {
  if (!originAllowed(origin, env)) return fail(403, 'forbidden_origin', 'This origin is not allowed.', null)
  const key = env.BRIEF_API_KEY || env.GEMINI_API_KEY
  if (!key) return fail(500, 'not_configured', 'The service is not configured.', origin)
  if (Number(req.headers.get('content-length') ?? 0) > BRIEF_BODY_MAX) return fail(413, 'too_large', 'Request too large.', origin)
  let body: { contact?: unknown; auth?: unknown }
  try { body = await req.json() } catch { return fail(400, 'bad_request', 'Invalid request.', origin) }
  const input = validBriefInput(body?.contact)
  if (!input) return fail(400, 'bad_contact', "Add the contact's name or company first.", origin)
  if (typeof body.auth !== 'string' || !body.auth) return fail(401, 'sign_in', 'Sign in to use Pulse Brief.', origin)

  // Each fresh brief is a model call (and, with search on, paid Google searches): checked against the account's briefs
  // (Pro's month, extra, trial) and its daily brake. A balance outage falls back to the per-IP brake, uncharged.
  const use = await beginUse(body.auth, env, 'brief')
  if (use.kind === 'refused') return fail(401, 'sign_in', 'Sign in to use Pulse Brief.', origin)
  if (use.kind === 'over') {
    if (use.reason === 'pro_only') return json({ error: { code: 'pro_only', message: 'Pulse Brief is part of Pro.' }, balance: use.balance }, 402, origin)
    if (use.reason === 'no_briefs') return json({ error: { code: 'no_briefs', message: 'No briefs left this month.' }, balance: use.balance }, 402, origin)
    return fail(429, 'daily_limit', `You've used today's ${use.limit} fresh briefs. Saved briefs still open. Resets at 5:30 am.`, origin)
  }
  const wait = checkRate(use.kind === 'account' ? `brief:${use.userId}` : `brief-ip:${req.headers.get('cf-connecting-ip') ?? 'local'}`)
  if (wait) return fail(429, 'rate_limited', `Too many briefs. Try again in ${Math.ceil(wait / 60)} min.`, origin, { 'Retry-After': String(wait) })

  const model = env.BRIEF_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL
  let upstream: Response
  try {
    upstream = await fetch(`${env.GEMINI_BASE ?? UPSTREAM}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify(buildBriefRequest(input, env.BRIEF_SEARCH === '1', THINKING.includes(env.BRIEF_THINKING as Thinking) ? env.BRIEF_THINKING as Thinking : 'low')),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return fail(502, 'upstream_unreachable', 'The service is unavailable. Try again.', origin)
  }
  if (!upstream.ok) {
    // Google's own reason goes to the Worker's log (wrangler tail), never to the app: it can name the key or the plan
    console.log(`brief upstream ${upstream.status} ${model}: ${(await upstream.text().catch(() => '')).slice(0, 600)}`)
    if (upstream.status === 429) return fail(429, 'busy', 'The service is busy. Try again in a moment.', origin, { 'Retry-After': '20' })
    return fail(502, 'upstream_error', "Couldn't make the brief. Try again.", origin)
  }
  try {
    const raw = await upstream.json()
    const parsed = parseBriefResponse(raw)
    // the model decides whether to search: this line in the log shows how often it does, and so what a brief costs
    console.log(`brief ok ${model}: ${usageLine(raw)} sources=${parsed.sources.length}`)
    const balance = use.kind === 'account' ? (await charge(body.auth as string, env, 'charge_brief')) ?? use.balance : null
    return json({ ...parsed, model, balance }, 200, origin)
  } catch (e) {
    return fail(502, 'bad_output', e instanceof BriefError ? "Couldn't make the brief. Try again." : 'Unexpected response.', origin)
  }
}

export default {
  async fetch(req: Request, env: Env): Promise<Response> {
    const url = new URL(req.url)
    const origin = req.headers.get('Origin')

    if (req.method === 'OPTIONS') {
      if (!originAllowed(origin, env)) return new Response(null, { status: 403 })
      return new Response(null, { status: 204, headers: {
        'Access-Control-Allow-Origin': origin!, Vary: 'Origin', 'Access-Control-Allow-Methods': 'POST, GET, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type', 'Access-Control-Max-Age': '86400',
      } })
    }

    if (url.pathname === '/health' && req.method === 'GET') return json({ ok: true }, 200, originAllowed(origin, env) ? origin : null)

    if (url.pathname === '/v1/brief' && req.method === 'POST') return brief(req, env, origin)
    if (url.pathname !== '/v1/extract' || req.method !== 'POST') return fail(404, 'not_found', 'Not found', null)
    if (!originAllowed(origin, env)) return fail(403, 'forbidden_origin', 'This origin is not allowed.', null)
    if (!env.GEMINI_API_KEY) return fail(500, 'not_configured', 'The reading service is not configured.', origin)

    if (Number(req.headers.get('content-length') ?? 0) > MAX_BASE64_CHARS.sides + 2048) return fail(413, 'too_large', 'Photo is too large.', origin)
    let body: { images?: unknown; layout?: unknown; auth?: unknown }
    try { body = await req.json() } catch { return fail(400, 'bad_request', 'Invalid request.', origin) }
    const layout: Layout | null = body.layout === undefined || body.layout === 'sides' ? 'sides' : body.layout === 'batch' ? 'batch' : null
    if (!layout) return fail(400, 'bad_layout', 'Unknown layout.', origin)
    const images = validImages(body.images, layout)
    if (!images) return fail(400, 'bad_images', layout === 'batch' ? 'Send 1 to 6 JPEG, PNG or WebP photos, under 3 MB in total.' : 'Send 1 or 2 JPEG, PNG or WebP photos, under 6 MB in total.', origin)

    // Reading needs an account once accounts are configured: each contact read uses one card from its plan, pass or
    // packs. Checked here, charged after a good read. The burst limit follows the account, not the hall Wi-Fi.
    const auth = typeof body.auth === 'string' && body.auth ? body.auth : null
    if (env.SUPABASE_URL && !auth) return fail(401, 'sign_in', 'Sign in to read cards. You get 20 free each month.', origin)
    const use = await beginUse(auth, env, 'read')
    if (use.kind === 'refused') return fail(401, 'sign_in', 'Sign in to read cards. You get 20 free each month.', origin)
    if (use.kind === 'over') {
      if (use.reason === 'no_cards') return json({ error: { code: 'no_cards', message: 'No cards left. Add a pack or a plan to keep reading.' }, balance: use.balance }, 402, origin)
      return fail(429, 'daily_limit', `You have reached today's limit of ${use.limit} scans. It resets at midnight UTC.`, origin)
    }
    const wait = checkRate(use.kind === 'account' ? `account:${use.userId}` : req.headers.get('cf-connecting-ip') ?? 'local')
    if (wait) return fail(429, 'rate_limited', `Too many scans. Try again in ${Math.ceil(wait / 60)} min.`, origin, { 'Retry-After': String(wait) })

    const model = env.GEMINI_MODEL || DEFAULT_MODEL
    let upstream: Response
    try {
      upstream = await fetch(`${env.GEMINI_BASE ?? UPSTREAM}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
        body: JSON.stringify(buildRequest(images, layout)),
        signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
      })
    } catch {
      return fail(502, 'upstream_unreachable', 'The reading service is unavailable. Try again.', origin)
    }

    if (!upstream.ok) console.log(`extract upstream ${upstream.status} ${model}: ${(await upstream.clone().text().catch(() => '')).slice(0, 600)}`)
    if (upstream.status === 429) return fail(429, 'busy', 'The reading service is busy. Try again in a moment.', origin, { 'Retry-After': '20' })
    // Anything else from upstream (bad key, quota, outage) is our problem, not the user's: don't leak details.
    if (!upstream.ok) return fail(502, 'upstream_error', 'The reading service had a problem. Try again.', origin)

    try {
      const raw = await upstream.json()
      const parsed = parseResponse(raw)
      console.log(`extract ok ${model} ${layout} images=${images.length} contacts=${parsed.contacts.length}: ${usageLine(raw)}`)
      let balance: unknown = use.kind === 'account' ? use.balance : null
      // A batch whose people cannot all be matched to a photo is thrown away by the app and read again card by card,
      // so it is not charged here; the re-reads are.
      const usable = layout !== 'batch' || parsed.contacts.every((c) => Number.isInteger(c.image) && c.image! >= 1 && c.image! <= images.length)
      if (use.kind === 'account' && parsed.contacts.length && usable) balance = (await charge(auth!, env, 'charge_reads', { n: Math.min(parsed.contacts.length, MAX_CHARGE) })) ?? balance
      else if (use.kind === 'none' && auth) console.log('extract uncharged: balance service unavailable')
      return json({ ...parsed, model, balance }, 200, origin)
    } catch (e) {
      return fail(502, 'unreadable', e instanceof GeminiError ? 'Could not read that photo. Try a clearer one.' : 'Unexpected response.', origin)
    }
  },
}
