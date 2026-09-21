// Shared by the app (direct-key mode) and the server. One copy of the prompt, schema and parsing.
import type { Contact } from '../src/lib/types'

export interface ImageInput { mime: string; data: string } // data = base64, no data: prefix

/**
 * sides: 1-2 photos of ONE card (front, back).
 * batch: 1-6 photos, each a DIFFERENT card (or a photo of several). Read in ONE request, so the instructions and the round trip are paid once.
 */
export type Layout = 'sides' | 'batch'
export const MAX_IMAGES: Record<Layout, number> = { sides: 2, batch: 6 }

/** A person as read from the photos, plus the number (1-based) of the photo they came from. */
export interface ParsedContact extends Contact { image?: number; extras?: string }

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
          image: { type: 'INTEGER', description: 'Number of the photo this person was read from (1 for a single card).' },
          extras: { type: 'STRING', description: 'Other printed information that fits no field above. Empty if none.' },
        },
        required: ['name', 'title', 'company', 'phones', 'emails', 'website', 'address', 'gstin', 'social', 'image', 'extras'],
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
- "extras": other useful printed information that fits no other field, as short plain text under 300 characters, or "" if none. Include: dealer/distributor/agent status ("Authorised Dealer for Hindustan Petroleum"), what the business deals in or makes ("Dealer: HDPE, LDPE; Mfg. of PP Fabric Roll"), certifications, and a client or brand list. Also include every extra address beyond the main one, each labelled "Factory:", "Branch:", "Works:" or "Godown:" as printed. The main "address" is the head/registered/office address. Leave out a person's name, title, company, phones, emails, website, GSTIN and social handles, and leave out a plain slogan.
- "notes": mention anything you could not read or were unsure about, such as text cut off at an edge. Never put business information here.
- "image": for every person, the number of the photo you read them from (1 when only one photo, or for the front of a card).`


export interface Parsed {
  contacts: ParsedContact[]
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

const SIDES_RULE_START = '- If two images are given, they are the FRONT and BACK of the SAME card.'

/** The instructions for a layout. Batch replaces the front/back rule, because in a batch two photos are two different cards. */
export function promptFor(layout: Layout, n = 1): string {
  if (layout !== 'batch') return PROMPT
  const rule = `- BATCH: ${n} photo${n === 1 ? ' is' : 's are'} given, labelled "Photo 1 of ${n}" and so on. Each photo is a DIFFERENT card, or a photo showing several cards. Never merge people across photos. If the same person appears on two photos, return them once, for the first photo. A photo with no readable card gives no contacts.\n`
  return PROMPT.split('\n').map((l) => (l.startsWith(SIDES_RULE_START) ? rule.trimEnd() : l)).join('\n')
}

/** Request body for Gemini generateContent. */
export function buildRequest(images: ImageInput[], layout: Layout = 'sides') {
  const parts: unknown[] = [{ text: promptFor(layout, images.length) }]
  images.forEach((img, i) => {
    parts.push({ text: layout === 'batch' ? `Photo ${i + 1} of ${images.length}:` : images.length > 1 ? (i === 0 ? 'Image 1 — FRONT of the card:' : 'Image 2 — BACK of the card:') : 'The card:' })
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
      image: Number.isInteger(c.image) && (c.image as number) > 0 ? (c.image as number) : undefined,
      extras: str1(c.extras) || undefined,
    })),
    languages: strs(parsed.languages),
    notes: str1(parsed.notes),
    tokensIn: json?.usageMetadata?.promptTokenCount,
    tokensOut: json?.usageMetadata?.candidatesTokenCount,
  }
}
