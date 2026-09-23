import { localISO } from './followups.ts'

export interface Day { iso: string; day: number; inMonth: boolean }

/** Six weeks of days for a month grid, weeks starting on Monday (as Indian calendars do), padded from the months around it. */
export function monthGrid(year: number, month: number): Day[] {
  const first = new Date(year, month, 1)
  const lead = (first.getDay() + 6) % 7                     // Monday = 0
  return Array.from({ length: 42 }, (_, i) => {
    const d = new Date(year, month, 1 - lead + i)
    return { iso: localISO(d), day: d.getDate(), inMonth: d.getMonth() === month }
  })
}

/** The month before or after, as [year, month]. */
export const shiftMonth = (year: number, month: number, by: number): [number, number] => {
  const d = new Date(year, month + by, 1)
  return [d.getFullYear(), d.getMonth()]
}

export const WEEKDAYS = ['Mo', 'Tu', 'We', 'Th', 'Fr', 'Sa', 'Su']
