import { createStore, del, entries, set } from 'idb-keyval'
import { ACCENTS, DEFAULT_ACCENT } from './accents.ts'
import { graphemes } from './graphemes.ts'

export type TemplateId = 'ledger' | 'header' | 'split' | 'noir' | 'bold'
export type FontId = 'archivo' | 'inter'
export const TEMPLATES: TemplateId[] = ['ledger', 'header', 'split', 'noir', 'bold']
export const FONTS: FontId[] = ['archivo', 'inter']
export const MAX_CARDS = 5
export const MAX_LIST = 3

/** The user's own digital business card. */
export interface MyCard {
  id: string; createdAt: number; updatedAt: number
  /** A name only the user sees, like "Work". */
  label: string
  name: string; title: string; company: string
  phones: string[]; emails: string[]
  website: string; address: string; social: string[]
  photo?: Blob
  template: TemplateId; accent: string; font: FontId
}

export const emptyCard = (accent: string = DEFAULT_ACCENT, now = Date.now()): MyCard => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(now),
  createdAt: now, updatedAt: now, label: '', name: '', title: '', company: '', phones: [], emails: [], website: '', address: '', social: [],
  template: 'ledger', accent, font: 'archivo',
})

const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, MAX_LIST)

/** Trims, drops blank list items, caps list lengths, and repairs an unknown template, font or accent. */
export function sanitizeCard(c: MyCard): MyCard {
  return {
    ...c,
    label: c.label.trim(), name: c.name.trim(), title: c.title.trim(), company: c.company.trim(),
    website: c.website.trim(), address: c.address.trim(),
    phones: list(c.phones), emails: list(c.emails), social: list(c.social),
    template: TEMPLATES.includes(c.template) ? c.template : 'ledger',
    font: FONTS.includes(c.font) ? c.font : 'archivo',
    accent: ACCENTS.some((a) => a.id === c.accent) ? c.accent : DEFAULT_ACCENT,
  }
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return words.length ? words.map((w) => graphemes(w)[0]!.toUpperCase()).join('') : '?'
}

export function cardsToEntries(cards: MyCard[]): { json: unknown[]; files: { name: string; blob: Blob }[] } {
  const files: { name: string; blob: Blob }[] = []
  const json = cards.map((c) => {
    const { photo, ...rest } = c
    if (!photo) return rest
    const file = `mycards/${c.id}-photo.jpg`
    files.push({ name: file, blob: photo })
    return { ...rest, photoFile: file }
  })
  return { json, files }
}

export function cardsFromEntries(json: unknown[], read: (name: string) => Blob | undefined): MyCard[] {
  return json.map((raw) => {
    const { photoFile, ...rest } = raw as MyCard & { photoFile?: string }
    const photo = photoFile ? read(photoFile) : undefined
    return sanitizeCard({ ...rest, ...(photo ? { photo } : {}) })
  })
}

/** Restoring adds what is missing and never overwrites or duplicates a card already on the phone. */
export function planCardRestore(existingIds: Iterable<string>, incoming: MyCard[]): { add: MyCard[]; skipped: number } {
  const have = new Set(existingIds)
  const add = incoming.filter((c) => !have.has(c.id))
  return { add, skipped: incoming.length - add.length }
}

// Cards live in their own database: idb-keyval cannot add an object store to the existing `cardpulse` database.
const store = createStore('cardpulse-mycards', 'cards')
export async function listMyCards(): Promise<MyCard[]> {
  return (await entries<string, MyCard>(store)).map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt)
}
export const putMyCard = (c: MyCard) => set(c.id, { ...c, updatedAt: Date.now() }, store)
export const deleteMyCard = (id: string) => del(id, store)
