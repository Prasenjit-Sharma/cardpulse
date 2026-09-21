import { readVerified, readZip, createZip, type ZipEntry } from './zip.ts'
import { cardsFromEntries, cardsToEntries, type MyCard } from './mycards.ts'
import type { CardRecord, EventRec } from './types'

export const BACKUP_VERSION = 1
const BLOBS = ['image', 'back', 'original', 'originalBack'] as const
type BlobKey = (typeof BLOBS)[number]
const FILE_KEY: Record<BlobKey, string> = { image: 'imageFile', back: 'backFile', original: 'originalFile', originalBack: 'originalBackFile' }

export interface ParsedBackup { cards: CardRecord[]; events: EventRec[]; myCards: MyCard[]; createdAt: number }

/** Everything the user has: contacts as JSON, each card's photos as ordinary image files. */
export async function buildBackup(cards: CardRecord[], events: EventRec[], now = Date.now(), myCards: MyCard[] = []): Promise<Blob> {
  const entries: ZipEntry[] = []
  const meta = cards.map((c) => {
    const rest: Record<string, unknown> = { ...c }
    for (const k of BLOBS) {
      delete rest[k]
      const blob = c[k]
      if (blob) { const file = `photos/${c.id}-${k}.jpg`; rest[FILE_KEY[k]] = file; entries.push({ name: file, data: blob }) }
    }
    return rest
  })
  const mine = cardsToEntries(myCards)
  for (const f of mine.files) entries.push({ name: f.name, data: f.blob })
  const manifest = { app: 'cardpulse', version: BACKUP_VERSION, createdAt: now, counts: { cards: cards.length, events: events.length, myCards: myCards.length }, cards: meta, events, myCards: mine.json }
  return createZip([{ name: 'cardpulse-backup.json', data: JSON.stringify(manifest) }, ...entries], new Date(now))
}

export async function parseBackup(blob: Blob): Promise<ParsedBackup> {
  const files = await readZip(blob)
  const main = files.find((f) => f.name === 'cardpulse-backup.json')
  if (!main) throw new Error('This is not a CardPulse backup file.')
  let manifest: { app?: string; version?: number; createdAt?: number; cards?: Record<string, unknown>[]; events?: EventRec[]; myCards?: unknown[] }
  try { manifest = JSON.parse(new TextDecoder().decode(await readVerified(main))) } catch { throw new Error('The backup file is damaged.') }
  if (manifest.app !== 'cardpulse') throw new Error('This is not a CardPulse backup file.')
  if ((manifest.version ?? 0) > BACKUP_VERSION) throw new Error('This backup was made by a newer version of CardPulse. Update the app and try again.')

  const byName = new Map(files.map((f) => [f.name, f]))
  const cards: CardRecord[] = []
  for (const raw of manifest.cards ?? []) {
    const card: Record<string, unknown> = { ...raw }
    for (const k of BLOBS) {
      const name = card[FILE_KEY[k]] as string | undefined
      delete card[FILE_KEY[k]]
      const f = name ? byName.get(name) : undefined
      if (f) { await readVerified(f); card[k] = new Blob([f.blob], { type: 'image/jpeg' }) }
    }
    cards.push(card as unknown as CardRecord)
  }
  const photos = new Map<string, Blob>()
  for (const f of files) if (f.name.startsWith('mycards/')) { await readVerified(f); photos.set(f.name, new Blob([f.blob], { type: 'image/jpeg' })) }
  const myCards = cardsFromEntries(manifest.myCards ?? [], (name) => photos.get(name))
  return { cards, events: manifest.events ?? [], myCards, createdAt: manifest.createdAt ?? 0 }
}

/** Restoring adds what is missing and never overwrites what is already on this phone. */
export function planRestore(existingIds: Iterable<string>, incoming: CardRecord[]): { add: CardRecord[]; skipped: number } {
  const have = new Set(existingIds)
  const add = incoming.filter((c) => !have.has(c.id))
  return { add, skipped: incoming.length - add.length }
}
export function mergeEvents(existing: EventRec[], incoming: EventRec[]): EventRec[] {
  const have = new Set(existing.map((e) => e.id))
  return [...existing, ...incoming.filter((e) => !have.has(e.id))]
}

const LAST = 'cardpulse.lastBackup'
const NUDGE = 'cardpulse.backupNudgeUntil'
const DAY = 86_400_000
export const lastBackupAt = (): number => { try { return Number(localStorage.getItem(LAST)) || 0 } catch { return 0 } }
export const markBackedUp = (now = Date.now()) => { try { localStorage.setItem(LAST, String(now)) } catch { /* private mode */ } }
export const snoozeBackupNudge = (now = Date.now()) => { try { localStorage.setItem(NUDGE, String(now + 7 * DAY)) } catch { /* private mode */ } }

/** A gentle reminder: only once there is something worth losing, at most every two weeks, and easy to dismiss. */
export function backupDue(cardCount: number, last: number, snoozedUntil: number, now = Date.now()): boolean {
  return cardCount >= 10 && now - last > 14 * DAY && now > snoozedUntil
}
export const backupNudgeUntil = (): number => { try { return Number(localStorage.getItem(NUDGE)) || 0 } catch { return 0 } }

export const backupFileName = (now = Date.now()) => `cardpulse-backup-${new Date(now).toISOString().slice(0, 10)}.zip`

/** Hands the backup to the phone: the share sheet where files are supported (Drive, WhatsApp, Files), else a download. */
export async function saveBackupFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: 'application/zip' })
  if (navigator.canShare?.({ files: [file] })) {
    try { await navigator.share({ files: [file], title: 'CardPulse backup' }); return } catch (e) { if ((e as Error)?.name === 'AbortError') throw e }
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob); a.download = name
  document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
