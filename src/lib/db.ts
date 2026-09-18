import { createStore, del, entries, get, set } from 'idb-keyval'
import type { CardRecord } from './types'

const store = createStore('cardpulse', 'cards')

export const putCard = (c: CardRecord) => set(c.id, c, store)
export const getCard = (id: string) => get<CardRecord>(id, store)
export const deleteCard = (id: string) => del(id, store)
export async function listCards(): Promise<CardRecord[]> {
  const all = (await entries<string, CardRecord>(store)).map(([, v]) => v)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

const KEY = 'cardpulse.settings'
export type KeepPhotos = 'full' | 'thumb' | 'none'
export interface Settings { apiKey: string; model: string; keepPhotos: KeepPhotos }
export function loadSettings(): Settings {
  try {
    return { apiKey: '', model: '', keepPhotos: 'full', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
  } catch {
    return { apiKey: '', model: '', keepPhotos: 'full' }
  }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}
