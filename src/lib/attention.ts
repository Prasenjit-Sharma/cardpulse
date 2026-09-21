import type { CardRecord, Contact } from './types'

const EMAIL = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/
const GSTIN = /^\d{2}[A-Z]{5}\d{4}[A-Z][1-9A-Z]Z[0-9A-Z]$/

const phoneOk = (p: string) => { const n = p.replace(/\D/g, '').length; return n >= 8 && n <= 15 }

/** What is worth a second look on one person: something missing or malformed, not a matter of taste. */
function personReasons(p: Contact): string[] {
  const out: string[] = []
  if (!p.name.trim()) out.push('No name was found')
  if (!p.phones.length && !p.emails.length) out.push('No phone or email was found')
  if (p.emails.some((e) => !EMAIL.test(e))) out.push('An email address looks wrong')
  if (p.phones.some((ph) => !phoneOk(ph))) out.push('A phone number looks wrong')
  if (p.gstin && !GSTIN.test(p.gstin.replace(/\s/g, '').toUpperCase())) out.push('The GSTIN looks wrong')
  return out
}

/**
 * Plain-language reasons a card deserves a quick check. Empty means "treat it as read correctly".
 * Notes, tags, follow-ups and priority are the user's own and never count.
 */
export function attentionReasons(card: CardRecord, hasDuplicate: boolean): string[] {
  if (card.status !== 'done') return []
  const out: string[] = []
  if (hasDuplicate) out.push('Possible duplicate')
  if (card.aiNotes?.trim()) out.push('The reader was unsure about part of this card')
  for (const p of card.corrected ?? []) for (const r of personReasons(p)) if (!out.includes(r)) out.push(r)
  return out
}

/** `reviewed` means the user has dealt with it: they edited a basic field or said "Looks fine". */
export const needsAttention = (card: CardRecord, hasDuplicate: boolean): boolean =>
  card.status === 'done' && !card.reviewed && attentionReasons(card, hasDuplicate).length > 0
