import { buildRequest, GeminiError, parseResponse, type ImageInput, type Layout, type Parsed } from '../../shared/extract-core'

export { GeminiError }
export const DEFAULT_MODEL = 'gemini-2.5-flash'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'

/** Set at build time (VITE_API_URL). When present, cards are read by our server and users need no API key. */
export const API_URL = ((import.meta.env.VITE_API_URL as string | undefined) ?? '').replace(/\/$/, '')
export const serverMode = API_URL !== ''

export interface ExtractionResult extends Parsed {
  latencyMs: number
  model?: string
}

export interface ReadOptions { apiKey: string; model: string; useOwnKey: boolean }

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms))

function toBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '')
    reader.onerror = () => reject(reader.error)
    reader.readAsDataURL(blob)
  })
}

/** Retries rate limits and transient server errors with backoff (free tiers are tight). */
async function withRetry(send: () => Promise<Response>): Promise<{ res: Response; json: any; ms: number }> {
  let lastErr: GeminiError | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** (attempt - 1))
    const t0 = performance.now()
    let res: Response
    try {
      res = await send()
    } catch {
      lastErr = new GeminiError('Network error. Are you online?')
      continue
    }
    const json = await res.json().catch(() => ({}))
    const ms = Math.round(performance.now() - t0)
    if (res.ok) return { res, json, ms }
    lastErr = new GeminiError(json?.error?.message ?? `HTTP ${res.status}`, res.status)
    if (res.status === 429 || res.status >= 500) continue
    throw lastErr
  }
  throw lastErr ?? new GeminiError('Extraction failed')
}

/** `layout`: 'sides' reads 1-2 photos as one card; 'batch' reads up to 6 photos as different cards, in a single call. */
export async function extractCard(blobs: Blob[], opts: ReadOptions, layout: Layout = 'sides'): Promise<ExtractionResult> {
  const images: ImageInput[] = await Promise.all(blobs.map(async (b) => ({ mime: b.type || 'image/jpeg', data: await toBase64(b) })))

  if (serverMode && !opts.useOwnKey) {
    const { json, ms } = await withRetry(() =>
      fetch(`${API_URL}/v1/extract`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ images, layout }) }))
    return { ...(json as Parsed), latencyMs: ms, model: json.model }
  }

  const { json, ms } = await withRetry(() =>
    fetch(`${BASE}/models/${encodeURIComponent(opts.model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': opts.apiKey },
      body: JSON.stringify(buildRequest(images, layout)),
    }))
  return { ...parseResponse(json), latencyMs: ms, model: opts.model }
}

/** Lists models that support generateContent, so we never depend on a stale hard-coded name. (Own-key mode only.) */
export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new GeminiError(json?.error?.message ?? `HTTP ${res.status}`, res.status)
  return (json.models as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort()
}
