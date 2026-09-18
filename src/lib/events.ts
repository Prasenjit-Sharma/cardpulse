import type { EventRec } from './types'

const EV = 'cardpulse.events'
const ACT = 'cardpulse.activeEvent'

export function loadEvents(): EventRec[] {
  try { return JSON.parse(localStorage.getItem(EV) ?? '[]') } catch { return [] }
}
export function saveEvents(e: EventRec[]) {
  try { localStorage.setItem(EV, JSON.stringify(e)) } catch { /* private mode */ }
}
/** '' means "All cards" (no event filter, new cards untagged). */
export function loadActiveEvent(): string {
  try { return localStorage.getItem(ACT) ?? '' } catch { return '' }
}
export function saveActiveEvent(id: string) {
  try { localStorage.setItem(ACT, id) } catch { /* private mode */ }
}
