import type { CardRecord, EventRec } from './types.ts'

// The pure half of sync: what goes on the wire, what counts as newer, and the outbox bookkeeping. No storage, no network.

export type SyncKind = 'card' | 'event' | 'mycard'
export interface OutboxEntry { updatedAt: number; deleted?: boolean }
/** Local changes not yet on the server, by `kind:id`. Only the newest change per record is kept. */
export type Outbox = Record<string, OutboxEntry>

export const outboxKey = (kind: SyncKind, id: string) => `${kind}:${id}`
export function parseKey(key: string): { kind: SyncKind; id: string } {
  const i = key.indexOf(':')
  return { kind: key.slice(0, i) as SyncKind, id: key.slice(i + 1) }
}

/** Notes a change. An older timestamp never replaces a newer one already waiting. */
export function recordChange(outbox: Outbox, kind: SyncKind, id: string, updatedAt: number, deleted = false): Outbox {
  const key = outboxKey(kind, id)
  const cur = outbox[key]
  if (cur && cur.updatedAt > updatedAt) return outbox
  return { ...outbox, [key]: deleted ? { updatedAt, deleted: true } : { updatedAt } }
}

/**
 * Drops what was just sent. An entry changed again while the push was in flight (a newer timestamp than the one sent)
 * stays, so that newer change goes out on the next run.
 */
export function settle(outbox: Outbox, sent: Record<string, number>): Outbox {
  const next: Outbox = {}
  for (const [k, v] of Object.entries(outbox)) if (!(k in sent) || v.updatedAt > sent[k]!) next[k] = v
  return next
}

/** A remote copy replaces the local one only when it is strictly newer. Equal means it is our own change coming back. */
export const isNewer = (remote: number, local: number | undefined) => local === undefined || remote > local

/** When a record was last changed on this phone. Records from before sync have no `updatedAt`. */
export const cardUpdatedAt = (c: CardRecord) => c.updatedAt ?? c.createdAt
export const eventUpdatedAt = (e: EventRec) => e.updatedAt ?? e.createdAt

/** Events that are new or changed (and so stamped `now`), and the ids that were removed. */
export function diffEvents(prev: EventRec[], next: EventRec[], now: number): { list: EventRec[]; changed: EventRec[]; removed: string[] } {
  const before = new Map(prev.map((e) => [e.id, e]))
  const same = (a: EventRec, b: EventRec) => a.name === b.name && a.createdAt === b.createdAt
  const changed: EventRec[] = []
  const list = next.map((e) => {
    const old = before.get(e.id)
    if (old && same(old, e)) return old.updatedAt === undefined ? e : { ...e, updatedAt: old.updatedAt }
    const stamped = { ...e, updatedAt: now }
    changed.push(stamped)
    return stamped
  })
  const kept = new Set(next.map((e) => e.id))
  return { list, changed, removed: prev.filter((e) => !kept.has(e.id)).map((e) => e.id) }
}

/** Photo slots that sync, per kind. `original`/`originalBack` are undo copies and stay on the phone. */
export const PHOTO_SLOTS = { card: ['image', 'back'], mycard: ['photo'], event: [] } as const satisfies Record<SyncKind, readonly string[]>
export type PhotoHashes = Record<string, string>

export const photoPath = (userId: string, kind: SyncKind, id: string, slot: string) => `${userId}/${kind}-${id}-${slot}.jpg`
export const photoKey = (kind: SyncKind, id: string, slot: string) => `${kind}:${id}:${slot}`

const CARD_LOCAL_ONLY = ['image', 'back', 'original', 'originalBack', 'waiting', 'attempts', 'updatedAt'] as const

/**
 * A contact as it goes to the server: no photos (they go to Storage, named by `photos`' hashes), no retry state.
 * `null` for a card that is not finished reading — it stays on the phone that took it, so two phones never both
 * pay to read the same photo.
 */
export function cardToWire(c: CardRecord, photos: PhotoHashes): Record<string, unknown> | null {
  if (c.status !== 'done') return null
  const data: Record<string, unknown> = { ...c }
  for (const k of CARD_LOCAL_ONLY) delete data[k]
  return { ...data, photos }
}

/**
 * The remote contact, merged over whatever this phone has. Photos are handled by the caller (they need downloading);
 * the local undo copies are carried over, and the caller drops them if the photo they undo is replaced.
 */
export function wireToCard(data: Record<string, unknown>, updatedAt: number, local: CardRecord | undefined): CardRecord {
  const { photos: _photos, ...rest } = data
  const card = { ...rest, updatedAt } as unknown as CardRecord
  if (local?.original) card.original = local.original
  if (local?.originalBack) card.originalBack = local.originalBack
  return card
}

/** Strips a blob-bearing record down to what goes on the wire (digital cards and events). */
export function withoutBlobs<T extends object>(rec: T, blobKeys: readonly string[]): Record<string, unknown> {
  const data = { ...rec } as Record<string, unknown>
  for (const k of blobKeys) delete data[k]
  return data
}

/** The contact made from a stall lead has a fixed id, so the same lead can never become two contacts. */
export const leadCardId = (leadId: string) => `lead-${leadId}`

export const chunk = <T>(xs: T[], n: number): T[][] => Array.from({ length: Math.ceil(xs.length / n) }, (_, i) => xs.slice(i * n, i * n + n))
