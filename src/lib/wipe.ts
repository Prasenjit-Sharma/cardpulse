import type { EventRec } from './types'

export interface WipeDeps {
  cardIds(): string[]
  deleteCard(id: string): Promise<void>
  saveEvents(list: EventRec[]): void
  setActiveEvent(id: string): void
}

/**
 * "Delete all data": every contact card and every event, and nothing left to scan into. Each deletion is queued for
 * sync like any other, so synced phones lose them too. Settings and the user's own digital cards are kept.
 */
export async function wipeContactData(deps: WipeDeps): Promise<void> {
  await Promise.all(deps.cardIds().map((id) => deps.deleteCard(id)))
  deps.saveEvents([])
  deps.setActiveEvent('')
}
