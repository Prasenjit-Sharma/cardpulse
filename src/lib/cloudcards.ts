import { sanitizeCard, type MyCard } from './mycards.ts'

/** Crockford's base32: digits and letters with the visually confusable ones (0/O, 1/I/L, U) removed. */
const SLUG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SLUG_LENGTH = 8

/** A random public slug. Collision odds are about 1 in 32^8 (≈1.1×10^12); the caller retries on a unique-constraint conflict. */
export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('')
}

export interface CardPayload {
  local_card_id: string; name: string; title: string; company: string
  phones: string[]; emails: string[]; website: string; address: string; social: string[]
  template: string; accent: string; font: string
}

/** What gets written to the `cards` row. The photo is never in here — it goes to Storage separately. */
export function buildCardPayload(card: MyCard): CardPayload {
  const c = sanitizeCard(card)
  return {
    local_card_id: c.id, name: c.name, title: c.title, company: c.company,
    phones: c.phones, emails: c.emails, website: c.website, address: c.address, social: c.social,
    template: c.template, accent: c.accent, font: c.font,
  }
}
