import { noteChange } from './outbox'
import { diffEvents } from './synccore'
import type { EventRec } from './types'

const EV = 'cardpulse.events'
const ACT = 'cardpulse.activeEvent'

export function loadEvents(): EventRec[] {
  try { return JSON.parse(localStorage.getItem(EV) ?? '[]') } catch { return [] }
}
/** Saves the list, stamping new or renamed events and queueing every change (removals too) for sync. */
export function saveEvents(e: EventRec[]) {
  const now = Date.now()
  const { list, changed, removed } = diffEvents(loadEvents(), e, now)
  saveEventsRaw(list)
  for (const ev of changed) noteChange('event', ev.id, now)
  for (const id of removed) noteChange('event', id, now, true)
}
/** A write that comes from sync itself: not queued to be sent back. */
export function saveEventsRaw(e: EventRec[]) {
  try { localStorage.setItem(EV, JSON.stringify(e)) } catch { /* private mode */ }
}
/** '' means "All cards" (no event filter, new cards untagged). */
export function loadActiveEvent(): string {
  try { return localStorage.getItem(ACT) ?? '' } catch { return '' }
}
export function saveActiveEvent(id: string) {
  try { localStorage.setItem(ACT, id) } catch { /* private mode */ }
}
