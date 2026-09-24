import { dueStatus, localISO } from './followups.ts'
import type { Contact } from './types.ts'

/**
 * What a watchlist row shows at its right edge, the way a trading row shows its price: one short figure in tabular
 * numerals, a word under it, and a tone that follows the palette law (red is due, and nothing else).
 */
export type Tone = 'due' | 'done' | 'check' | 'muted'
export interface Figure { text: string; sub: string; tone: Tone }

/** Where a contact stands. Named, so the state never rests on colour alone. */
export type Phase = 'New' | 'Contacted' | 'Follow-up'
export function phase(p: Contact): Phase {
  if (p.followUp) return 'Follow-up'
  if (p.log?.length) return 'Contacted'
  return 'New'
}

/** The follow-up as a figure: "3d late" and "Today" in red, "in 4d" plain. Null when there is no follow-up. */
export function dueFigure(followUp: string | undefined, today: string): Figure | null {
  const { state, days } = dueStatus(followUp, today)
  if (state === 'none') return null
  if (state === 'overdue') return { text: `${days}d late`, sub: 'Follow-up', tone: 'due' }
  if (state === 'today') return { text: 'Today', sub: 'Follow-up', tone: 'due' }
  return { text: `in ${days}d`, sub: 'Follow-up', tone: 'muted' }
}

/** "12 Sep", with the year only when it is not this year. */
export function shortDate(t: number, now: number = Date.now()): string {
  const d = new Date(t)
  const other = d.getFullYear() !== new Date(now).getFullYear()
  return d.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', ...(other ? { year: '2-digit' } : {}) })
}

/** A row's figure: the follow-up when there is one, otherwise the day the card was scanned and the contact's phase. */
export function rowFigure(p: Contact, createdAt: number, today: string, now: number = Date.now()): Figure {
  return dueFigure(p.followUp, today) ?? { text: shortDate(createdAt, now), sub: phase(p), tone: 'muted' }
}

/** Whether a time falls on the phone's own today. */
export const isToday = (t: number, today: string = localISO()): boolean => localISO(new Date(t)) === today
