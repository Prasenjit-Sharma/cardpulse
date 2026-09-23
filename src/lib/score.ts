import { ALL_FIELDS, LIST_FIELDS, SCALAR_FIELDS, type CardRecord, type Contact, type FieldKey } from './types'

const norm = (f: FieldKey, v: string) =>
  f === 'phones' ? v.replace(/\D/g, '').replace(/^(91)?0?(?=\d{10}$)/, '') : v.toLowerCase().replace(/\s+/g, ' ').trim()

function items(c: Contact, f: FieldKey): string[] {
  const raw = (SCALAR_FIELDS as readonly string[]).includes(f) ? [c[f as (typeof SCALAR_FIELDS)[number]]] : c[f as (typeof LIST_FIELDS)[number]]
  return raw.map((v) => norm(f, v)).filter(Boolean)
}

/** Overlap of two contacts, used to pair the model's contacts with the user's corrected ones. */
function affinity(a: Contact, b: Contact): number {
  let hit = 0, total = 0
  for (const f of ALL_FIELDS) {
    const x = items(a, f), y = items(b, f)
    total += new Set([...x, ...y]).size
    hit += x.filter((v) => y.includes(v)).length
  }
  return total ? hit / total : 0
}

export interface Tally { tp: number; fp: number; fn: number }
export type FieldTallies = Record<FieldKey, Tally>
export const emptyTallies = (): FieldTallies =>
  Object.fromEntries(ALL_FIELDS.map((f) => [f, { tp: 0, fp: 0, fn: 0 }])) as FieldTallies

export interface CardScore {
  fields: FieldTallies
  /** Model found the same number of people as the user says are on the card. */
  contactCountOk: boolean
  extractedCount: number
  trueCount: number
}

/**
 * tp = model value the user kept, fp = model value the user removed/changed,
 * fn = value the user had to add. Contacts are paired greedily by best overlap.
 */
export function scoreCard(card: CardRecord): CardScore | null {
  if (!card.extracted || !card.corrected || card.source === 'qr') return null   // a QR is copied, not read: nothing to score
  const fields = emptyTallies()
  const pool = [...card.extracted]
  const pairs: [Contact | undefined, Contact | undefined][] = []
  for (const truth of card.corrected) {
    let best = -1, bestScore = 0
    pool.forEach((c, i) => { const a = affinity(c, truth); if (a > bestScore) { bestScore = a; best = i } })
    pairs.push([best >= 0 ? pool.splice(best, 1)[0] : undefined, truth])
  }
  for (const leftover of pool) pairs.push([leftover, undefined])

  for (const [pred, truth] of pairs) {
    for (const f of ALL_FIELDS) {
      const p = pred ? items(pred, f) : [], t = truth ? items(truth, f) : []
      const tp = p.filter((v) => t.includes(v)).length
      fields[f].tp += tp
      fields[f].fp += p.length - tp
      fields[f].fn += t.length - t.filter((v) => p.includes(v)).length
    }
  }
  return {
    fields,
    contactCountOk: card.extracted.length === card.corrected.length,
    extractedCount: card.extracted.length,
    trueCount: card.corrected.length,
  }
}

export const accuracy = (t: Tally): number | null => (t.tp + t.fp + t.fn ? t.tp / (t.tp + t.fp + t.fn) : null)

export function sumTallies(scores: CardScore[]): FieldTallies {
  const out = emptyTallies()
  for (const s of scores) for (const f of ALL_FIELDS) {
    out[f].tp += s.fields[f].tp; out[f].fp += s.fields[f].fp; out[f].fn += s.fields[f].fn
  }
  return out
}

export function overall(t: FieldTallies): number | null {
  const sum = ALL_FIELDS.reduce((a, f) => ({ tp: a.tp + t[f].tp, fp: a.fp + t[f].fp, fn: a.fn + t[f].fn }), { tp: 0, fp: 0, fn: 0 })
  return accuracy(sum)
}
