/**
 * What this phone has done with the user's own cards: each share, each full-screen QR, each card sent back after a QR
 * scan. Kept on the device so My Card has figures of its own even when signed out; views and leads come from the
 * server on top of these.
 */
export type ShareKind = 'qr' | 'file' | 'picture' | 'text' | 'exchange'
export interface ShareEntry { at: number; card: string; kind: ShareKind }
export interface ShareTally { shared: number; qr: number; exchanged: number }

const KEY = 'cardpulse.shareLog'
export const MAX_ENTRIES = 200

type Store = Pick<Storage, 'getItem' | 'setItem'>
const local = (): Store | undefined => { try { return localStorage } catch { return undefined } }

export function readShareLog(store: Store | undefined = local()): ShareEntry[] {
  try { const v = JSON.parse(store?.getItem(KEY) ?? '[]'); return Array.isArray(v) ? v : [] } catch { return [] }
}

/** Records one share, newest first, keeping the log bounded. */
export function noteShare(card: string, kind: ShareKind, at: number = Date.now(), store: Store | undefined = local()): void {
  const next = [{ at, card, kind }, ...readShareLog(store)].slice(0, MAX_ENTRIES)
  try { store?.setItem(KEY, JSON.stringify(next)) } catch { /* private mode or full */ }
}

/** Counts for one card: sends (file, picture, text), full-screen QRs, and cards sent back after a scan. */
export function tallyShares(log: ShareEntry[], card: string): ShareTally {
  const mine = log.filter((e) => e.card === card)
  return {
    shared: mine.filter((e) => e.kind === 'file' || e.kind === 'picture' || e.kind === 'text').length,
    qr: mine.filter((e) => e.kind === 'qr').length,
    exchanged: mine.filter((e) => e.kind === 'exchange').length,
  }
}

export const SHARE_LABEL: Record<ShareKind, string> = {
  qr: 'QR shown full screen', file: 'Sent as a contact file', picture: 'Sent as a picture', text: 'Copied as text', exchange: 'Sent back after a QR scan',
}
