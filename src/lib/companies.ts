import type { CardRecord } from './types'

/** "ABC Polymers Pvt. Ltd." and "abc polymers pvt ltd" are one company. */
export const companyKey = (name: string): string => name.toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim()

export interface CompanyRow { key: string; name: string; n: number }

/** Every company on a card the user has, with how many people work there, biggest first, ties in alphabetical order. */
export function companyList(cards: CardRecord[]): CompanyRow[] {
  const by = new Map<string, CompanyRow>()
  for (const c of cards) {
    if (c.status !== 'done') continue
    for (const p of c.corrected ?? []) {
      const key = companyKey(p.company)
      if (!key) continue
      const row = by.get(key) ?? { key, name: p.company.trim(), n: 0 }
      row.n++
      by.set(key, row)
    }
  }
  return [...by.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name))
}
