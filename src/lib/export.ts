import { toVCard } from './actions'
import { rankedPhones } from './phones'
import type { NameFormat } from './naming'
import type { CardRecord } from './types'

const cell = (v: string) => `"${v.replace(/"/g, '""')}"`
export const fileSafe = (s: string) => s.replace(/\W+/g, '_')

type EventName = (id?: string) => string

export function buildCsv(cards: CardRecord[], eventName: EventName): string {
  const head = ['event', 'card_id', 'name', 'title', 'company', 'phones', 'phone_types', 'emails', 'website', 'address', 'gstin', 'social', 'note', 'follow_up']
  // numbers in calling order, the main one first, with their labels in a matching column
  const rows = cards.flatMap((c) => (c.corrected ?? []).map((p) => { const ph = rankedPhones(p); return [
    eventName(c.eventId), c.id, p.name, p.title, p.company, ph.map((x) => x.number).join('; '), ph.map((x) => x.kind).join('; '), p.emails.join('; '), p.website, p.address, p.gstin, p.social.join('; '), p.note ?? '', p.followUp ?? ''].map(cell).join(',') }))
  return [head.join(','), ...rows].join('\n')
}

export function buildVcf(cards: CardRecord[], eventName: EventName, fmt: NameFormat = 'name'): string {
  return cards
    .flatMap((c) => (c.corrected ?? []).filter((p) => p.name).map((p) => toVCard(p, [eventName(c.eventId), p.note].filter(Boolean).join(' — '), fmt)))
    .join('\r\n')
}
