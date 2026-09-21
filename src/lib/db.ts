import { createStore, del, entries, get, set } from 'idb-keyval'
import { serverMode } from './gemini'
import { DEFAULT_NAME_FORMAT, type NameFormat } from './naming'
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
export type Theme = 'system' | 'light' | 'dark'
export interface Settings { apiKey: string; model: string; keepPhotos: KeepPhotos; theme?: Theme; /** The app's accent colour, by id (src/lib/accents.ts). Graphite when unset. */ accent?: string; /** How contacts are named when saved to the phone (so the company shows on incoming calls). */ nameFormat?: NameFormat; /** Developer option: bypass the CardPulse server and call Gemini directly. */ useOwnKey?: boolean }

/** Can cards be read right now? Server mode needs nothing from the user; direct mode needs a key and a model. */
export const readerReady = (s: Settings) => (serverMode && !s.useOwnKey) || (!!s.apiKey && !!s.model)
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

/** The naming format to use right now, read from saved settings. */
export const currentNameFormat = (): NameFormat => loadSettings().nameFormat ?? DEFAULT_NAME_FORMAT
