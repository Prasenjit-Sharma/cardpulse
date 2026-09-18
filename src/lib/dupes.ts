import type { CardRecord } from './types'

/** Identity keys of a card: every email, and every phone reduced to its last 10 digits. */
function keys(c: CardRecord): string[] {
  const out: string[] = []
  for (const p of c.corrected ?? []) {
    for (const e of p.emails) if (e.trim()) out.push('e:' + e.trim().toLowerCase())
    for (const ph of p.phones) {
      const d = ph.replace(/\D/g, '')
      if (d.length >= 10) out.push('p:' + d.slice(-10))
    }
  }
  return out
}

/** cardId -> the other cards that share an email or phone with it (a re-scanned card, or a colleague's card). */
export function findDuplicates(cards: CardRecord[]): Map<string, CardRecord[]> {
  const byKey = new Map<string, CardRecord[]>()
  for (const c of cards) {
    if (c.status !== 'done') continue
    for (const k of new Set(keys(c))) byKey.set(k, [...(byKey.get(k) ?? []), c])
  }
  const result = new Map<string, CardRecord[]>()
  for (const c of cards) {
    const others = new Map<string, CardRecord>()
    for (const k of new Set(keys(c))) for (const o of byKey.get(k) ?? []) if (o.id !== c.id) others.set(o.id, o)
    if (others.size) result.set(c.id, [...others.values()])
  }
  return result
}
