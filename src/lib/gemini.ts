import { GeminiError, type ImageInput, type Layout, type Parsed } from '../../shared/extract-core'
import { tokens } from './token'

export { GeminiError }
/** Set at build time (VITE_API_URL): the Pulse reading service. Every build has one (dev, staging and production each their own). */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
export const serverMode = API_URL !== ''

export interface ExtractionResult extends Parsed {
  latencyMs: number
  model?: string
  /** What the account has left after this read (our server only; null when it could not be counted). */
  balance?: unknown
}

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** One read normally takes 3 to 10 seconds; past this it is stuck, so give up on that attempt. */
const ATTEMPT_TIMEOUT_MS = 55_000

/** Retries rate limits and transient server errors with backoff (free tiers are tight). A stuck read is retried once. */
async function withRetry(send: (signal: AbortSignal) => Promise<Response>): Promise<{ res: Response; json: any; ms: number }> {
  let lastErr: GeminiError | undefined
  let timeouts = 0
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** (attempt - 1))
    const t0 = performance.now()
    let res: Response
    try {
      res = await send(AbortSignal.timeout(ATTEMPT_TIMEOUT_MS))
    } catch (e) {
      if ((e as Error)?.name === 'TimeoutError') {
        lastErr = new GeminiError('The reading is taking too long. Try again.')
        if (++timeouts > 1) break
      } else lastErr = new GeminiError('Network error. Are you online?')
      continue
    }
    const json = await res.json().catch(() => ({}))
    const ms = Math.round(performance.now() - t0)
    if (res.ok) return { res, json, ms }
    lastErr = new GeminiError(json?.error?.message ?? `HTTP ${res.status}`, res.status, { code: json?.error?.code, balance: json?.balance, retryAfter: Number(json?.error?.retryAfter) || Number(res.headers.get('Retry-After')) || undefined })
    if (json?.error?.code === 'daily_limit') throw lastErr            // waiting seconds will not help; it resets tomorrow
    if (json?.error?.code === 'no_cards' || json?.error?.code === 'sign_in') throw lastErr   // nor here: it needs cards or a sign-in
    if (json?.error?.code === 'rate_limited') throw lastErr   // our own brake: minutes, scheduled by the app (retry.ts)
    if (res.status === 429 || res.status >= 500) continue
    throw lastErr
  }
  throw lastErr ?? new GeminiError('Extraction failed')
}

/**
 * `layout`: 'sides' reads 1-2 photos as one card; 'batch' reads up to 6 photos as different cards, in a single call.
 * `rid` (requestIdFor the card ids) is the same on every retry of these photos, so the server never charges them twice.
 */
export async function extractCard(blobs: Blob[], layout: Layout = 'sides', rid?: string): Promise<ExtractionResult> {
  const images: ImageInput[] = await Promise.all(blobs.map(async (b) => ({ mime: b.type || 'image/jpeg', data: await toBase64(b) })))

  if (!serverMode) throw new GeminiError('Reading is not set up in this build (no VITE_API_URL).')
  const send = (auth: string | undefined) => withRetry((signal) =>
    fetch(`${API_URL}/v1/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, layout, ...(auth ? { auth } : {}), ...(rid ? { rid } : {}) }), signal }))
  let r: Awaited<ReturnType<typeof send>>
  try { r = await send(await tokens.get()) } catch (e) {
    // the server refused an old token, but this phone is signed in: renew once and send again, never "signed out"
    if (!(e instanceof GeminiError && e.code === 'sign_in' && tokens.signedIn())) throw e
    const fresh = await tokens.renew()
    try { r = await send(fresh) } catch (e2) {
      if (e2 instanceof GeminiError && e2.code === 'sign_in' && tokens.signedIn()) throw new GeminiError('Reconnecting your sign-in. Trying again shortly.', 503, { code: 'reconnect' })
      throw e2
    }
  }
  const { json, ms } = r
  return { ...(json as Parsed), latencyMs: ms, model: json.model, balance: json.balance }
}
