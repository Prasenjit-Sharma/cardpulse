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
export interface Settings { apiKey: string; model: string; keepPhotos: KeepPhotos; theme?: Theme; /** The app's accent colour, by id (src/lib/accents.ts). Graphite when unset. */ accent?: string; /** How contacts are named when saved to the phone (so the company shows on incoming calls). */ nameFormat?: NameFormat; /** Developer option: bypass the CardPulse server and call Gemini directly. */ useOwnKey?: boolean }

/** Can cards be read right now? Server mode needs nothing from the user; direct mode needs a key and a model. */
export const readerReady = (s: Settings) => (serverMode && !s.useOwnKey) || (!!s.apiKey && !!s.model)
export function loadSettings(): Settings {
  try {
    const s: Settings = { apiKey: '', model: '', keepPhotos: 'full', ...JSON.parse(localStorage.getItem(KEY) ?? '{}') }
    // The own-key developer switch is no longer shown when the reading service exists; a phone that had it on must not be stuck needing a key.
    return serverMode ? { ...s, useOwnKey: false } : s
  } catch {
    return { apiKey: '', model: '', keepPhotos: 'full' }
  }
}
export function saveSettings(s: Settings) {
  try { localStorage.setItem(KEY, JSON.stringify(s)) } catch { /* private mode */ }
}

/** The naming format to use right now, read from saved settings. */
export const currentNameFormat = (): NameFormat => loadSettings().nameFormat ?? DEFAULT_NAME_FORMAT
