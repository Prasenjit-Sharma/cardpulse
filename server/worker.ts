// CardPulse API — a thin, locked-down proxy in front of Gemini.
// The app sends card photos; the prompt, schema and API key live here, so this endpoint cannot be used as a general Gemini gateway.
import { buildRequest, GeminiError, MAX_IMAGES, parseResponse, type ImageInput, type Layout } from '../shared/extract-core.ts'

export interface Env {
  GEMINI_API_KEY: string
  GEMINI_MODEL?: string
  /** Comma-separated exact origins allowed to call this API, e.g. https://you.github.io */
  ALLOWED_ORIGINS?: string
  /** "1" also allows localhost and private-LAN origins (local development only). */
  ALLOW_LAN?: string
  /** Override the upstream, used by tests. */
  GEMINI_BASE?: string
  /** With both set, a signed-in user's reads are counted per account (see consume_scan in migration 0002). */
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

/** The quota check must never hold up a scan for long: past this, fall back to the per-IP limit. */
const QUOTA_TIMEOUT_MS = 3000

/** The account id inside a token Supabase has just accepted. Only read after Supabase validated the token. */
function tokenSubject(token: string): string | null {
  try {
    const part = token.split('.')[1]!.replace(/-/g, '+').replace(/_/g, '/')
    const sub = JSON.parse(atob(part.padEnd(part.length + ((4 - (part.length % 4)) % 4), '='))).sub
    return typeof sub === 'string' ? sub : null
  } catch { return null }
}

export type Quota = { kind: 'account'; userId: string } | { kind: 'over'; limit: number } | { kind: 'none' }

/**
 * Counts one read against the signed-in user's daily quota, using the user's own token (the Worker holds no
 * Supabase secret). Anything that goes wrong — no token, a bad or expired token, Supabase slow or down, the function
 * not deployed — is `none`, and the caller falls back to the per-IP limit: a quota outage never stops a scan.
 */
export async function checkQuota(token: unknown, env: Env): Promise<Quota> {
  if (typeof token !== 'string' || !token || token.length > 4096 || !env.SUPABASE_URL || !env.SUPABASE_PUBLISHABLE_KEY) return { kind: 'none' }
  try {
    const res = await fetch(`${env.SUPABASE_URL.replace(/\/$/, '')}/rest/v1/rpc/consume_scan`, {
      method: 'POST',
      headers: { apikey: env.SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: '{}',
      signal: AbortSignal.timeout(QUOTA_TIMEOUT_MS),
    })
    if (!res.ok) return { kind: 'none' }
    const body = await res.json() as unknown
    const row = (Array.isArray(body) ? body[0] : body) as { allowed?: unknown; day_limit?: unknown } | undefined
    if (!row || typeof row.allowed !== 'boolean') return { kind: 'none' }
    if (!row.allowed) return { kind: 'over', limit: Number(row.day_limit) || 0 }
    const userId = tokenSubject(token)
    return userId ? { kind: 'account', userId } : { kind: 'none' }
  } catch { return { kind: 'none' } }
}

/** A read is normally 3 to 10 s. Past this the request is stuck upstream; fail fast so the app can retry. */
const UPSTREAM_TIMEOUT_MS = 40_000

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

    // Signed in: counted per account (so a stall's reps on one hall Wi-Fi don't share one limit). Otherwise per IP.
    const quota = await checkQuota(body.auth, env)
    if (quota.kind === 'over') return fail(429, 'daily_limit', `You have reached today's limit of ${quota.limit} scans. It resets at midnight UTC.`, origin)
    const wait = checkRate(quota.kind === 'account' ? `account:${quota.userId}` : req.headers.get('cf-connecting-ip') ?? 'local')
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

    if (upstream.status === 429) return fail(429, 'busy', 'The reading service is busy. Try again in a moment.', origin, { 'Retry-After': '20' })
    // Anything else from upstream (bad key, quota, outage) is our problem, not the user's: don't leak details.
    if (!upstream.ok) return fail(502, 'upstream_error', 'The reading service had a problem. Try again.', origin)

    try {
      const parsed = parseResponse(await upstream.json())
      return json({ ...parsed, model }, 200, origin)
    } catch (e) {
      return fail(502, 'unreadable', e instanceof GeminiError ? 'Could not read that photo. Try a clearer one.' : 'Unexpected response.', origin)
    }
  },
}
