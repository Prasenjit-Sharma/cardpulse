import type { Contact } from './types'

/** Lower-case and strip accents, so "Zürich" is found by "zurich". */
const fold = (s: string) => s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase()

/** A query is a set of words; a contact matches when every word is found somewhere on it, in any order. */
export const searchTokens = (query: string): string[] => fold(query).split(/[\s,;]+/).filter(Boolean)

/** Everything on a contact that a person might search by, folded into one string. Phones also keep bare digits, so "98240" finds "+91 98240 22893". */
export function searchText(p: Contact, eventName = ''): string {
  return fold([
    p.name, p.title, p.company, p.address, p.website, p.gstin, p.note ?? '', eventName,
    ...p.social, ...p.emails, ...p.phones, ...p.phones.map((x) => x.replace(/\D/g, '')), ...(p.tags ?? []),
  ].join('\n'))
}

export const matchesQuery = (p: Contact, tokens: string[], eventName = ''): boolean => {
  if (!tokens.length) return true
  const text = searchText(p, eventName)
  return tokens.every((t) => text.includes(t))
}

/** Every chosen tag must be on the contact (narrowing, like adding a word to the search). */
export const hasAllTags = (p: Contact, tags: readonly string[]): boolean => tags.every((t) => (p.tags ?? []).includes(t))
