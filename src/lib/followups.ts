import type { Contact } from './types.ts'
import { callNumber } from './phones.ts'

/** One thing that happened with a contact: a call, a meeting or a message, what was said, and when to follow up next. */
export type Kind = 'call' | 'meeting' | 'message'
export type Outcome = 'connected' | 'no-answer' | 'call-back'
export interface Interaction { id: string; at: number; kind: Kind; outcome?: Outcome; note: string; /** ISO date (yyyy-mm-dd) of the next follow-up. */ next?: string }

export const MAX_LOG = 200
export const MAX_NOTE = 600

const two = (n: number) => String(n).padStart(2, '0')

/** The phone's own calendar day as yyyy-mm-dd. `toISOString()` is UTC, which is yesterday in India until 5:30 am. */
export const localISO = (d: Date = new Date()): string => `${d.getFullYear()}-${two(d.getMonth() + 1)}-${two(d.getDate())}`

export type Preset = 'tomorrow' | '3d' | 'week' | '2w' | 'month'
/** `label` reads in a sentence; `short` fits a compact chip. */
export const PRESETS: { id: Preset; label: string; short: string }[] = [
  { id: 'tomorrow', label: 'Tomorrow', short: 'Tomorrow' }, { id: '3d', label: 'In 3 days', short: '3 days' }, { id: 'week', label: 'Next week', short: '1 week' },
  { id: '2w', label: 'In 2 weeks', short: '2 weeks' }, { id: 'month', label: 'In a month', short: '1 month' },
]

/** A day counted forward from `from`. "In a month" keeps the day of the month, or the last day when that month is shorter (30 Jan gives 28 Feb). */
export function presetDate(p: Preset, from: Date = new Date()): string {
  const y = from.getFullYear(), m = from.getMonth(), d = from.getDate()
  if (p === 'month') {
    const last = new Date(y, m + 2, 0).getDate()                           // the day before the 1st of the month after next
    return localISO(new Date(y, m + 1, Math.min(d, last)))
  }
  return localISO(new Date(y, m, d + { tomorrow: 1, '3d': 3, week: 7, '2w': 14 }[p]))
}

const dayNumber = (iso: string) => { const [y, m, d] = iso.split('-').map(Number); return Math.round(Date.UTC(y!, m! - 1, d!) / 86_400_000) }

export type DueState = 'none' | 'overdue' | 'today' | 'upcoming'
/** Where a follow-up date stands today, and by how many days. */
export function dueStatus(followUp: string | undefined, today: string): { state: DueState; days: number } {
  if (!followUp) return { state: 'none', days: 0 }
  const diff = dayNumber(followUp) - dayNumber(today)
  return diff < 0 ? { state: 'overdue', days: -diff } : diff === 0 ? { state: 'today', days: 0 } : { state: 'upcoming', days: diff }
}

/** How to say where a follow-up stands: "Overdue by 3 days", "Due today", "Tomorrow", "In 4 days". */
export function dueLabel(followUp: string | undefined, today: string): string {
  const { state, days } = dueStatus(followUp, today)
  const n = (k: number) => `${k} ${k === 1 ? 'day' : 'days'}`
  return state === 'none' ? '' : state === 'overdue' ? `Overdue by ${n(days)}` : state === 'today' ? 'Due today' : days === 1 ? 'Tomorrow' : `In ${n(days)}`
}

/** Builds a log entry: the note is trimmed and bounded, and only a call has an outcome. */
export function newEntry(input: { kind: Kind; outcome?: Outcome; note: string; next?: string }, now: number = Date.now(), id: string = crypto.randomUUID()): Interaction {
  const e: Interaction = { id, at: now, kind: input.kind, note: input.note.trim().slice(0, MAX_NOTE) }
  if (input.kind === 'call' && input.outcome) e.outcome = input.outcome
  if (input.next) e.next = input.next
  return e
}

/**
 * Adds an entry, newest first. Its next date joins the follow-ups already planned (see `currentFollowUp`); a date set
 * by hand that falls on or before the day of this entry has been acted on, so it is done.
 */
export function logInteraction(c: Contact, entry: Interaction): Contact {
  const { followUp, ...rest } = c
  const keep = followUp && followUp > localISO(new Date(entry.at)) ? { followUp } : {}
  return { ...rest, log: [entry, ...(c.log ?? [])].slice(0, MAX_LOG), ...keep }
}

export const removeInteraction = (c: Contact, id: string): Contact => ({ ...c, log: (c.log ?? []).filter((e) => e.id !== id) })

/**
 * Every follow-up still planned: the date set by hand, and each logged next date that no later entry has acted on (an
 * entry logged on or after that day). Sorted, without repeats.
 */
export function plannedFollowUps(c: Contact): string[] {
  const log = c.log ?? []
  const dates = log.filter((e) => e.next && !log.some((f) => f.at > e.at && localISO(new Date(f.at)) >= e.next!)).map((e) => e.next!)
  if (c.followUp) dates.push(c.followUp)
  return [...new Set(dates)].sort()
}

/**
 * The follow-up that stands today: the nearest planned date from today on. A date that has passed gives way to the next
 * one; only when nothing is planned ahead does the latest passed date stay, as overdue.
 */
export function currentFollowUp(c: Contact, today: string = localISO()): string | undefined {
  const dates = plannedFollowUps(c)
  return dates.find((d) => d >= today) ?? dates.at(-1)
}

/**
 * Moves the follow-up that stands today to another day, or removes it (`to` empty). The log entries that planned it
 * are changed with it, so the next planned date, if any, takes its place only when this one is removed.
 */
export function setFollowUp(c: Contact, to: string, today: string = localISO()): Contact {
  const from = currentFollowUp(c, today)
  const { followUp, ...rest } = c
  const log = c.log?.map((e) => {
    if (!from || e.next !== from) return e
    const { next: _n, ...bare } = e
    return to ? { ...bare, next: to } : bare
  })
  const manual = !from || followUp === from ? to : followUp
  return { ...rest, ...(log ? { log } : {}), ...(manual ? { followUp: manual } : {}) }
}

const BS = String.fromCharCode(92)                                       // a backslash, built so it can never be mistyped as a lone escape
const esc = (s: string) => s.replace(/\\/g, BS + BS).replace(/\r?\n/g, BS + 'n').replace(/[;,]/g, (m) => BS + m)
const stamp = (d: Date) => d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')

/** An all-day calendar event for the follow-up, so the phone's own calendar can remind them. Opens in any calendar app. */
export function followUpIcs(c: Contact, date: string, now: Date = new Date()): string {
  const last = (c.log ?? [])[0]?.note
  const description = [last && `Last note: ${last}`, callNumber(c), c.emails[0]].filter(Boolean).join('\n')
  const slug = c.name.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '') || 'contact'
  return [
    'BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Pulse//Follow-up//EN', 'BEGIN:VEVENT',
    `UID:followup-${slug}-${date}@cardpulse`, `DTSTAMP:${stamp(now)}`, `DTSTART;VALUE=DATE:${date.replace(/-/g, '')}`,
    `SUMMARY:${esc(`Follow up: ${c.name}${c.company ? ` (${c.company})` : ''}`)}`,
    ...(description ? [`DESCRIPTION:${esc(description)}`] : []),
    'END:VEVENT', 'END:VCALENDAR',
  ].join('\r\n')
}
