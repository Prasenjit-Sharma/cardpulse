// Small rules of the read queue (App.tsx), kept here so they can be tested: every read is a paid call and is charged,
// so a card must never be read twice.
import type { CardRecord } from './types.ts'

/** Takes the ids not already queued or being read, marking them at once (before any await), and returns them. */
export function claim(inFlight: Set<string>, ids: string[]): string[] {
  const fresh = ids.filter((id) => !inFlight.has(id))
  fresh.forEach((id) => inFlight.add(id))
  return fresh
}

/** A card may be sent to the reader unless it has been read already (a stale retry timer must not read it again). */
export const readable = (c: Pick<CardRecord, 'status'>) => c.status !== 'done'
