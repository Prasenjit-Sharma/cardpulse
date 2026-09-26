import type { EventRec } from './types.ts'

/**
 * How an event's name is shown anywhere in the app: in capitals, like the name on an exhibition badge. Display only —
 * the name is stored as typed, so exports, search and the lead page keep the user's own spelling.
 */
export const showEvent = (name: string): string => name.toLocaleUpperCase('en-IN')

export type EventState = 'live' | 'upcoming' | 'past' | 'undated'

/** Live from its first day through its last, both included; an event with only a start date lasts that one day. */
export function eventState(e: Pick<EventRec, 'start' | 'end'>, today: string): EventState {
  if (!e.start) return 'undated'
  if (today < e.start) return 'upcoming'
  return today <= (e.end || e.start) ? 'live' : 'past'
}

const day = (iso: string, withMonth = true) => new Date(`${iso}T00:00`).toLocaleDateString('en-IN', withMonth ? { day: 'numeric', month: 'short' } : { day: 'numeric' })

/** The dates as one short span: "19 Sept", "19–21 Sept", "30 Sept – 2 Oct". */
export function eventSpan(e: Pick<EventRec, 'start' | 'end'>): string {
  if (!e.start) return ''
  const end = e.end && e.end !== e.start ? e.end : ''
  if (!end) return day(e.start)
  return e.start.slice(0, 7) === end.slice(0, 7) ? `${day(e.start, false)}–${day(end)}` : `${day(e.start)} – ${day(end)}`
}

/** One line on when the event is, from where today stands. */
export function eventWhen(e: Pick<EventRec, 'start' | 'end' | 'createdAt'>, today: string, since: (t: number) => string): string {
  switch (eventState(e, today)) {
    case 'live': return (e.end || e.start) === today ? 'Last day today' : `Live until ${day(e.end || e.start!)}`
    case 'upcoming': return `Starts ${day(e.start!)}`
    case 'past': return eventSpan(e)
    default: return `Since ${since(e.createdAt)}`
  }
}

/**
 * The few events worth a place on a crowded screen: live ones first, then the next to start, then the most recent.
 * `keep` (the event being viewed) always stays in, so the selection never vanishes from its own tabs.
 */
export function featuredEvents(events: EventRec[], today: string, n = 2, keep = ''): EventRec[] {
  const rank = (e: EventRec) => ({ live: 0, upcoming: 1, past: 2, undated: 2 })[eventState(e, today)]
  // live and upcoming by start, soonest first; the rest by how recently they ran (or were made), newest first
  const at = (e: EventRec) => (rank(e) < 2 ? -Date.parse(e.start!) : e.end || e.start ? Date.parse(e.end || e.start!) : e.createdAt)
  const sorted = [...events].sort((a, b) => rank(a) - rank(b) || at(b) - at(a))
  const top = sorted.slice(0, n)
  const kept = keep && !top.some((e) => e.id === keep) ? events.find((e) => e.id === keep) : undefined
  return kept ? [...top.slice(0, n - 1), kept] : top
}

/**
 * Where new scans go when the app opens: an event that has ended lets go, and with nothing chosen, an event that is live
 * today is picked up, so cards scanned at the stall land in it without a tap. Returns the event id ('' for none).
 */
export function openingEvent(events: EventRec[], active: string, today: string): string {
  const cur = events.find((e) => e.id === active)
  if (cur && eventState(cur, today) === 'past') active = ''
  if (active) return active
  return featuredEvents(events.filter((e) => eventState(e, today) === 'live'), today, 1)[0]?.id ?? ''
}
