import { recordChange, settle, type Outbox, type SyncKind } from './synccore.ts'

// Local changes waiting to go to the server. Kept in localStorage (synchronous, so two quick writes can never lose
// each other) and recorded whether or not sync is on: turning sync on later still sends deletions made meanwhile.

const KEY = 'cardpulse.sync.outbox'
const listeners = new Set<() => void>()

export function readOutbox(): Outbox {
  try { return JSON.parse(localStorage.getItem(KEY) ?? '{}') as Outbox } catch { return {} }
}
function write(o: Outbox) {
  try { localStorage.setItem(KEY, JSON.stringify(o)) } catch { /* private mode or Node: sync simply has nothing to send */ }
}

export function noteChange(kind: SyncKind, id: string, updatedAt: number, deleted = false) {
  write(recordChange(readOutbox(), kind, id, updatedAt, deleted))
  listeners.forEach((f) => f())
}
export function settleOutbox(sent: Record<string, number>) { write(settle(readOutbox(), sent)) }

/** Called after every local change, so sync can run shortly after. */
export function onLocalChange(f: () => void): () => void {
  listeners.add(f)
  return () => { listeners.delete(f) }
}
