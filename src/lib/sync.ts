import { createStore, get, set } from 'idb-keyval'
import { deleteCardRaw, getCard, listCards, putCardRaw } from './db'
import { loadEvents, saveEventsRaw } from './events'
import { deleteMyCardRaw, getMyCard, listMyCards, putMyCardRaw, sanitizeCard, type MyCard } from './mycards'
import { noteChange, readOutbox, settleOutbox } from './outbox'
import { supabase } from './supabase'
import {
  cardToWire, cardUpdatedAt, chunk, eventUpdatedAt, isNewer, outboxKey, parseKey, PHOTO_SLOTS, photoKey, photoPath, wireToCard, withoutBlobs,
  type PhotoHashes, type SyncKind,
} from './synccore'
import type { CardRecord, EventRec } from './types'

// Sync across devices: push the outbox, then pull everything the server has after our cursor. One run at a time.

/** Shown in the consent sheet and recorded with the consent, so a later policy change can ask again. */
export const SYNC_POLICY_VERSION = '2026-09-23'
const BUCKET = 'sync-photos'
const PUSH_BATCH = 100
const PULL_PAGE = 500

export interface SyncState {
  enabled: boolean
  /** The account that turned sync on. A different account on this phone starts with sync off. */
  userId: string
  /** The highest server `seq` already applied here. */
  cursor: number
  lastSyncAt?: number
  /** Hash of each photo known to be the same here and on the server, by `kind:id:slot`. */
  hashes: PhotoHashes
  /** Photos that failed to download, retried on the next run: `kind:id:slot` → the hash wanted. */
  retry: PhotoHashes
}

const store = createStore('cardpulse-sync', 'state')
const EMPTY: SyncState = { enabled: false, userId: '', cursor: 0, hashes: {}, retry: {} }
export async function loadSyncState(): Promise<SyncState> {
  try { return { ...EMPTY, ...((await get<SyncState>('state', store)) ?? {}) } } catch { return { ...EMPTY } }
}
const saveState = (s: SyncState) => set('state', s, store)

export type SyncStatus = { kind: 'off' } | { kind: 'syncing' } | { kind: 'idle'; at?: number } | { kind: 'offline' } | { kind: 'error'; message: string }
let status: SyncStatus = { kind: 'off' }
const statusListeners = new Set<(s: SyncStatus) => void>()
const setStatus = (s: SyncStatus) => { status = s; statusListeners.forEach((f) => f(s)) }
export const syncStatus = () => status
export function onSyncStatus(f: (s: SyncStatus) => void): () => void { statusListeners.add(f); return () => { statusListeners.delete(f) } }

async function hashBlob(b: Blob): Promise<string> {
  const d = new Uint8Array(await crypto.subtle.digest('SHA-256', await b.arrayBuffer()))
  return Array.from(d.slice(0, 12), (x) => x.toString(16).padStart(2, '0')).join('')
}

/** A plain message for whatever the server said. A missing table means the migration has not been run yet. */
export function syncErrorMessage(e: unknown): string {
  const m = (e as { message?: string } | null)?.message ?? String(e)
  if (/does not exist|schema cache|PGRST20[0-9]|404/i.test(m)) return 'Sync is not set up on the server yet.'
  if (/failed to fetch|network|load failed/i.test(m)) return 'No connection. It will sync when you are back online.'
  if (/JWT|not signed in|401/i.test(m)) return 'Sign in again to keep syncing.'
  return 'Sync did not finish. It will try again shortly.'
}

// ── push ─────────────────────────────────────────────────────────────────────────────────────────────────────────

/** Uploads any photo that changed since it was last synced. Returns the record's photo hashes. */
async function uploadPhotos(state: SyncState, kind: SyncKind, id: string, rec: Record<string, unknown>): Promise<PhotoHashes> {
  const out: PhotoHashes = {}
  for (const slot of PHOTO_SLOTS[kind]) {
    const blob = rec[slot]
    if (!(blob instanceof Blob)) continue
    const h = await hashBlob(blob)
    const key = photoKey(kind, id, slot)
    if (state.hashes[key] !== h) {
      const { error } = await supabase!.storage.from(BUCKET).upload(photoPath(state.userId, kind, id, slot), blob, { upsert: true, contentType: blob.type || 'image/jpeg' })
      if (error) throw error
      state.hashes[key] = h
    }
    out[slot] = h
  }
  return out
}

async function removePhotos(state: SyncState, kind: SyncKind, id: string) {
  const paths = PHOTO_SLOTS[kind].map((slot) => photoPath(state.userId, kind, id, slot))
  if (!paths.length) return
  await supabase!.storage.from(BUCKET).remove(paths)            // best effort: a leftover file is harmless and is removed with the account
  for (const slot of PHOTO_SLOTS[kind]) delete state.hashes[photoKey(kind, id, slot)]
}

interface WireItem { kind: SyncKind; id: string; updatedAt: number; deleted?: boolean; data?: Record<string, unknown> }

async function push(state: SyncState): Promise<void> {
  const outbox = readOutbox()
  const events = new Map(loadEvents().map((e) => [e.id, e]))
  const items: WireItem[] = []
  const skip: Record<string, number> = {}                        // nothing to send (not finished reading, or gone): just drop from the outbox
  for (const [key, entry] of Object.entries(outbox)) {
    const { kind, id } = parseKey(key)
    if (entry.deleted) { items.push({ kind, id, updatedAt: entry.updatedAt, deleted: true }); continue }
    if (kind === 'card') {
      const c = await getCard(id)
      const photos = c && c.status === 'done' ? await uploadPhotos(state, kind, id, c as unknown as Record<string, unknown>) : {}
      const data = c ? cardToWire(c, photos) : null
      if (data) items.push({ kind, id, updatedAt: cardUpdatedAt(c!), data }); else skip[key] = entry.updatedAt
    } else if (kind === 'mycard') {
      const c = await getMyCard(id)
      if (!c) { skip[key] = entry.updatedAt; continue }
      const photos = await uploadPhotos(state, kind, id, c as unknown as Record<string, unknown>)
      items.push({ kind, id, updatedAt: c.updatedAt, data: { ...withoutBlobs(c, PHOTO_SLOTS.mycard), photos } })
    } else {
      const e = events.get(id)
      if (e) items.push({ kind, id, updatedAt: eventUpdatedAt(e), data: { ...e } }); else skip[key] = entry.updatedAt
    }
  }
  for (const batch of chunk(items, PUSH_BATCH)) {
    const { error } = await supabase!.rpc('sync_push', { p_items: batch })
    if (error) throw error
    for (const it of batch) if (it.deleted) await removePhotos(state, it.kind, it.id)
    settleOutbox(Object.fromEntries(batch.map((it) => [outboxKey(it.kind, it.id), it.updatedAt])))
    await saveState(state)
  }
  if (Object.keys(skip).length) settleOutbox(skip)
}

// ── pull ─────────────────────────────────────────────────────────────────────────────────────────────────────────

interface Row { kind: SyncKind; item_id: string; data: Record<string, unknown> | null; deleted: boolean; client_updated_at: number; seq: number }

async function download(state: SyncState, kind: SyncKind, id: string, slot: string): Promise<Blob | undefined> {
  const { data, error } = await supabase!.storage.from(BUCKET).download(photoPath(state.userId, kind, id, slot))
  if (error || !data) return undefined
  return new Blob([data], { type: 'image/jpeg' })
}

/**
 * Fills a record's photos from the server's hashes: unchanged ones are kept, changed ones downloaded, removed ones
 * dropped. A failed download keeps whatever this phone had and is retried on the next run.
 */
async function applyPhotos(state: SyncState, kind: SyncKind, id: string, wanted: PhotoHashes, rec: Record<string, unknown>, local: Record<string, unknown> | undefined): Promise<Set<string>> {
  const replaced = new Set<string>()
  for (const slot of PHOTO_SLOTS[kind]) {
    const key = photoKey(kind, id, slot)
    const h = wanted[slot]
    delete state.retry[key]
    if (!h) { delete rec[slot]; delete state.hashes[key]; continue }
    if (state.hashes[key] === h && local?.[slot] instanceof Blob) { rec[slot] = local[slot]; continue }
    const blob = await download(state, kind, id, slot)
    if (blob) { rec[slot] = blob; state.hashes[key] = h; replaced.add(slot) }
    else { if (local?.[slot] instanceof Blob) rec[slot] = local[slot]; state.retry[key] = h }
  }
  return replaced
}

/** Applies one server row if it is newer than this phone's copy. Returns whether anything changed here. */
async function apply(state: SyncState, row: Row): Promise<boolean> {
  const { kind, item_id: id } = row
  const remoteAt = Number(row.client_updated_at)
  const pending = readOutbox()[outboxKey(kind, id)]
  if (pending && pending.updatedAt >= remoteAt) return false      // this phone has a newer change on its way up

  if (kind === 'card') {
    const local = await getCard(id)
    if (local && !isNewer(remoteAt, cardUpdatedAt(local))) return false
    if (local && (local.status === 'pending' || local.status === 'running')) return false   // mid-read here; its result will be pushed and win
    if (row.deleted || !row.data) { if (!local) return false; await deleteCardRaw(id); return true }
    const card = wireToCard(row.data, remoteAt, local) as CardRecord & Record<string, unknown>
    const replaced = await applyPhotos(state, kind, id, (row.data.photos ?? {}) as PhotoHashes, card, local as unknown as Record<string, unknown>)
    if (replaced.has('image')) delete card.original                 // an undo copy of a photo that is no longer this one
    if (replaced.has('back')) delete card.originalBack
    await putCardRaw(card)
    return true
  }
  if (kind === 'mycard') {
    const local = await getMyCard(id)
    if (local && !isNewer(remoteAt, local.updatedAt)) return false
    if (row.deleted || !row.data) { if (!local) return false; await deleteMyCardRaw(id); return true }
    const { photos, ...rest } = row.data
    const card = { ...rest, updatedAt: remoteAt } as Record<string, unknown>
    await applyPhotos(state, kind, id, (photos ?? {}) as PhotoHashes, card, local as unknown as Record<string, unknown>)
    await putMyCardRaw(sanitizeCard(card as unknown as MyCard))
    return true
  }
  const events = loadEvents()
  const i = events.findIndex((e) => e.id === id)
  if (i >= 0 && !isNewer(remoteAt, eventUpdatedAt(events[i]!))) return false
  if (row.deleted || !row.data) { if (i < 0) return false; saveEventsRaw(events.filter((e) => e.id !== id)); return true }
  const ev = { ...(row.data as unknown as EventRec), id, updatedAt: remoteAt }
  saveEventsRaw(i >= 0 ? events.map((e) => (e.id === id ? ev : e)) : [ev, ...events])
  return true
}

async function pull(state: SyncState): Promise<number> {
  let applied = 0
  for (;;) {
    const { data, error } = await supabase!.from('sync_items').select('kind, item_id, data, deleted, client_updated_at, seq')
      .eq('owner_id', state.userId).gt('seq', state.cursor).order('seq', { ascending: true }).limit(PULL_PAGE)
    if (error) throw error
    const rows = (data ?? []) as Row[]
    for (const row of rows) {
      if (await apply(state, row)) applied++
      state.cursor = Math.max(state.cursor, Number(row.seq))
    }
    await saveState(state)
    if (rows.length < PULL_PAGE) return applied
  }
}

/** Photos that failed to download last time. */
async function retryPhotos(state: SyncState): Promise<number> {
  let fixed = 0
  for (const [key, h] of Object.entries(state.retry)) {
    const [kind, ...restKey] = key.split(':') as [SyncKind, ...string[]]
    const slot = restKey.pop()!, id = restKey.join(':')
    const blob = await download(state, kind, id, slot)
    if (!blob) continue
    delete state.retry[key]
    if (kind === 'card') { const c = await getCard(id); if (c) { await putCardRaw({ ...c, [slot]: blob }); fixed++ } }
    else if (kind === 'mycard') { const c = await getMyCard(id); if (c) { await putMyCardRaw({ ...c, [slot]: blob }); fixed++ } }
    state.hashes[key] = h
  }
  await saveState(state)
  return fixed
}

// ── the run ──────────────────────────────────────────────────────────────────────────────────────────────────────

let running: Promise<boolean> | null = null
let again = false

/**
 * One sync run for the signed-in user. Resolves to whether anything on this phone changed (so the app reloads its
 * lists). Calls made while a run is going share it and trigger exactly one more run after it.
 */
export function runSync(userId: string): Promise<boolean> {
  if (running) { again = true; return running }
  running = (async () => {
    let changed = false
    try {
      do {
        again = false
        const state = await loadSyncState()
        if (!supabase || !state.enabled || state.userId !== userId) { setStatus({ kind: 'off' }); return changed }
        if (!navigator.onLine) { setStatus({ kind: 'offline' }); return changed }
        setStatus({ kind: 'syncing' })
        await push(state)
        changed = (await pull(state)) > 0 || changed
        changed = (await retryPhotos(state)) > 0 || changed
        state.lastSyncAt = Date.now()
        await saveState(state)
        setStatus({ kind: 'idle', at: state.lastSyncAt })
      } while (again)
    } catch (e) {
      setStatus(navigator.onLine ? { kind: 'error', message: syncErrorMessage(e) } : { kind: 'offline' })
    } finally { running = null }
    return changed
  })()
  return running
}

/** Turns sync on for this account: records consent, queues everything on this phone, and runs. */
export async function enableSync(userId: string): Promise<void> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const { error } = await supabase.from('consents').insert({ purpose: 'sync', policy_version: SYNC_POLICY_VERSION })
  if (error) throw new Error(syncErrorMessage(error))
  const prev = await loadSyncState()
  const sameUser = prev.userId === userId
  await saveState({ ...EMPTY, ...(sameUser ? { hashes: prev.hashes } : {}), enabled: true, userId, cursor: sameUser ? prev.cursor : 0 })
  // Everything already here goes up once. Stamps are kept, so a newer copy on another phone still wins.
  for (const c of await listCards()) if (c.status === 'done') noteChange('card', c.id, cardUpdatedAt(c))
  for (const e of loadEvents()) noteChange('event', e.id, eventUpdatedAt(e))
  for (const c of await listMyCards()) noteChange('mycard', c.id, c.updatedAt)
}

/** Stops syncing on this phone. What is already on the server stays until "Delete cloud data". */
export async function disableSync(): Promise<void> {
  const s = await loadSyncState()
  await saveState({ ...s, enabled: false })
  setStatus({ kind: 'off' })
  if (supabase) await supabase.from('consents').update({ withdrawn_at: new Date().toISOString() }).eq('purpose', 'sync').is('withdrawn_at', null)
}

/** Forgets this phone's sync position (after the server copy is deleted), so a later "turn on" starts clean. */
export async function resetSyncState(): Promise<void> {
  await saveState({ ...EMPTY })
  setStatus({ kind: 'off' })
}
