import type { Contact } from './types'

const BASE = 'https://generativelanguage.googleapis.com/v1beta'
export const DEFAULT_MODEL = 'gemini-2.5-flash'

const str = { type: 'STRING' }
const strList = { type: 'ARRAY', items: str }

const responseSchema = {
  type: 'OBJECT',
  properties: {
    languages: { ...strList, description: 'Scripts/languages seen on the card, e.g. English, Hindi, Tamil' },
    notes: { type: 'STRING', description: 'Anything unreadable, cut off or ambiguous. Empty if none.' },
    contacts: {
      type: 'ARRAY',
      items: {
        type: 'OBJECT',
        properties: {
          name: str, title: str, company: str,
          phones: strList, emails: strList,
          website: str, address: str, gstin: str, social: strList,
        },
        required: ['name', 'title', 'company', 'phones', 'emails', 'website', 'address', 'gstin', 'social'],
      },
    },
  },
  required: ['languages', 'notes', 'contacts'],
}

const PROMPT = `You extract contact details from a photo of a business card (or a page/sticker/board showing several cards).

Rules:
- If two images are given, they are the FRONT and BACK of the SAME card. Merge them: the back often has a second language, extra offices, more phone numbers or a tagline. Do not duplicate a person or number that appears on both sides.
- Return ONE entry in "contacts" per person. If the card lists several people (partners, directors, branch heads), return each of them, copying shared details (company, address, website) onto every person. Personal phone/email belong only to that person; generic ones printed once for the whole company go on everyone.
- If the image contains several separate cards, return every person on every card.
- Never invent or guess. Use "" for missing strings and [] for missing lists. Do not fix typos you are unsure of.
- Indian cards: mobile numbers are 10 digits starting 6-9; format them as "+91 XXXXX XXXXX" when no country code is printed. Landlines keep their STD code, e.g. "+91 22 2345 6789". Numbers with a printed non-Indian country code keep it. Ignore labels like M:, T:, Ph:, Cell, Off. — output only the number. Split "98765 43210 / 98765 43211" into two phones.
- "gstin" is the 15-character GST number if printed, else "".
- Text may be in Hindi, Tamil, Telugu, Bengali, Marathi, Gujarati, Kannada, Malayalam, Punjabi, Urdu, etc. Output name/title/company/address transliterated or translated to English (Latin script) when the card has both scripts, use the English version. If only a regional script is present, transliterate.
- "title" is the job designation only. "company" is the organisation only (no tagline). "address" is one line, comma-separated, including pincode.
- "social" holds LinkedIn/Twitter/Instagram URLs or handles.
- Emails lowercase. Websites as printed.
- "notes": mention anything you could not read or were unsure about.`

export interface ExtractionResult {
  contacts: Contact[]
  languages: string[]
  notes: string
  latencyMs: number
  tokensIn?: number
  tokensOut?: number
}

export class GeminiError extends Error {
  status?: number
  constructor(message: string, status?: number) {
    super(message)
    this.status = status
  }
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

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
const s = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

export async function extractCard(images: Blob[], apiKey: string, model: string): Promise<ExtractionResult> {
  const imageParts = await Promise.all(images.map(async (img, i) => [
    { text: images.length > 1 ? (i === 0 ? 'Image 1 — FRONT of the card:' : 'Image 2 — BACK of the card:') : 'The card:' },
    { inline_data: { mime_type: img.type || 'image/jpeg', data: await toBase64(img) } },
  ]))
  const body = {
    contents: [{ parts: [{ text: PROMPT }, ...imageParts.flat()] }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema },
  }

  let lastErr: GeminiError | undefined
  for (let attempt = 0; attempt < 4; attempt++) {
    if (attempt) await sleep(2000 * 2 ** (attempt - 1)) // 2s, 4s, 8s — free tier rate limits
    const t0 = performance.now()
    let res: Response
    try {
      res = await fetch(`${BASE}/models/${encodeURIComponent(model)}:generateContent`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
        body: JSON.stringify(body),
      })
    } catch {
      lastErr = new GeminiError('Network error — are you online?')
      continue
    }
    const json = await res.json().catch(() => ({}))
    if (!res.ok) {
      lastErr = new GeminiError(json?.error?.message ?? `HTTP ${res.status}`, res.status)
      if (res.status === 429 || res.status >= 500) continue
      throw lastErr
    }
    const text: string | undefined = json?.candidates?.[0]?.content?.parts?.map((p: { text?: string }) => p.text ?? '').join('')
    if (!text) {
      throw new GeminiError(json?.promptFeedback?.blockReason ? `Blocked: ${json.promptFeedback.blockReason}` : 'Empty response from model')
    }
    let parsed: { contacts?: Record<string, unknown>[]; languages?: unknown; notes?: unknown }
    try {
      parsed = JSON.parse(text)
    } catch {
      throw new GeminiError('Model returned invalid JSON')
    }
    return {
      contacts: (parsed.contacts ?? []).map((c) => ({
        name: s(c.name), title: s(c.title), company: s(c.company),
        phones: strs(c.phones), emails: strs(c.emails).map((e) => e.toLowerCase()),
        website: s(c.website), address: s(c.address), gstin: s(c.gstin).toUpperCase(), social: strs(c.social),
      })),
      languages: strs(parsed.languages),
      notes: s(parsed.notes),
      latencyMs: Math.round(performance.now() - t0),
      tokensIn: json?.usageMetadata?.promptTokenCount,
      tokensOut: json?.usageMetadata?.candidatesTokenCount,
    }
  }
  throw lastErr ?? new GeminiError('Extraction failed')
}

/** Lists models that support generateContent, so we never depend on a stale hard-coded name. */
export async function listModels(apiKey: string): Promise<string[]> {
  const res = await fetch(`${BASE}/models?pageSize=200`, { headers: { 'x-goog-api-key': apiKey } })
  const json = await res.json().catch(() => ({}))
  if (!res.ok) throw new GeminiError(json?.error?.message ?? `HTTP ${res.status}`, res.status)
  return (json.models as { name: string; supportedGenerationMethods?: string[] }[])
    .filter((m) => m.supportedGenerationMethods?.includes('generateContent') && /gemini/.test(m.name))
    .map((m) => m.name.replace(/^models\//, ''))
    .sort()
}
