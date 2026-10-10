import { createStore, del, entries, get, set } from 'idb-keyval'
import { serverMode } from './gemini'
import { DEFAULT_NAME_FORMAT, type NameFormat } from './naming'
import { noteChange } from './outbox'
import type { CardRecord } from './types'

const store = createStore('cardpulse', 'cards')

/** Every local change is stamped and queued for sync. */
export async function putCard(c: CardRecord) {
  const updatedAt = Date.now()
  await set(c.id, { ...c, updatedAt }, store)
  noteChange('card', c.id, updatedAt)
}
export const getCard = (id: string) => get<CardRecord>(id, store)
export async function deleteCard(id: string) {
  await del(id, store)
  noteChange('card', id, Date.now(), true)
}
/** Writes that come from sync itself: kept as they arrived and not queued to be sent back. */
export const putCardRaw = (c: CardRecord) => set(c.id, c, store)
export const deleteCardRaw = (id: string) => del(id, store)
export async function listCards(): Promise<CardRecord[]> {
  const all = (await entries<string, CardRecord>(store)).map(([, v]) => v)
  return all.sort((a, b) => b.createdAt - a.createdAt)
}

const KEY = 'cardpulse.settings'
export type KeepPhotos = 'full' | 'thumb' | 'none'
export type Theme = 'system' | 'light' | 'dark'
export interface Settings { keepPhotos: KeepPhotos; theme?: Theme; /** The app's accent colour, by id (src/lib/accents.ts). Blue when unset. */ accent?: string; /** How contacts are named when saved to the phone (so the company shows on incoming calls). */ nameFormat?: NameFormat }

/** Can cards be read? Only in a build that has the Pulse reading service (every build does once VITE_API_URL is set). */
export const readerReady = (): boolean => serverMode
export function loadSettings(): Settings {
  try {
    // settings saved by older builds may still carry apiKey, model and useOwnKey (the removed own-key mode): dropped here
    const { apiKey: _k, model: _m, useOwnKey: _o, ...s } = { keepPhotos: 'full', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    return s as Settings
  } catch {
    return { keepPhotos: 'full' }
  }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/** The naming format to use right now, read from saved settings. */
export const currentNameFormat = (): NameFormat => loadSettings().nameFormat ?? DEFAULT_NAME_FORMAT
