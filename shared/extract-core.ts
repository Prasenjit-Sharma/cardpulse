// Shared by the app (direct-key mode) and the server. One copy of the prompt, schema and parsing.
import type { Contact } from '../src/lib/types'

export interface ImageInput { mime: string; data: string } // data = base64, no data: prefix

const str = { type: 'STRING' }
const strList = { type: 'ARRAY', items: str }

export const responseSchema = {
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

export const PROMPT = `You extract contact details from a photo of a business card (or a page/sticker/board showing several cards).

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


export interface Parsed {
  contacts: Contact[]
  languages: string[]
  notes: string
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

/** Request body for Gemini generateContent. */
export function buildRequest(images: ImageInput[]) {
  const parts: unknown[] = [{ text: PROMPT }]
  images.forEach((img, i) => {
    parts.push({ text: images.length > 1 ? (i === 0 ? 'Image 1 — FRONT of the card:' : 'Image 2 — BACK of the card:') : 'The card:' })
    parts.push({ inline_data: { mime_type: img.mime || 'image/jpeg', data: img.data } })
  })
  return {
    contents: [{ parts }],
    generationConfig: { temperature: 0, responseMimeType: 'application/json', responseSchema },
  }
}

const strs = (v: unknown): string[] => (Array.isArray(v) ? v.map((x) => String(x).trim()).filter(Boolean) : [])
const str1 = (v: unknown): string => (typeof v === 'string' ? v.trim() : '')

/** Turns a raw Gemini response into clean contacts. Throws GeminiError when there is nothing usable. */
export function parseResponse(json: any): Parsed {
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
      name: str1(c.name), title: str1(c.title), company: str1(c.company),
      phones: strs(c.phones), emails: strs(c.emails).map((e) => e.toLowerCase()),
      website: str1(c.website), address: str1(c.address), gstin: str1(c.gstin).toUpperCase(), social: strs(c.social),
    })),
    languages: strs(parsed.languages),
    notes: str1(parsed.notes),
    tokensIn: json?.usageMetadata?.promptTokenCount,
    tokensOut: json?.usageMetadata?.candidatesTokenCount,
  }
}
