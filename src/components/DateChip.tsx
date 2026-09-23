import { useEffect, useState } from 'react'
import { monthGrid, shiftMonth, WEEKDAYS } from '../lib/calendar'
import { localISO } from '../lib/followups'
import Icon from './Icon'
import Sheet from './Sheet'

const dayLabel = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/** The app's own calendar, in a sheet: never the phone's date picker, which looks different on every browser. */
export function CalendarSheet({ open, value, min, title, onPick, onClose }: { open: boolean; value: string; min?: string; title: string; onPick: (iso: string) => void; onClose: () => void }) {
  const start = new Date(`${value || min || localISO()}T00:00`)
  const [[y, m], setMonth] = useState<[number, number]>([start.getFullYear(), start.getMonth()])
  useEffect(() => { if (open) setMonth([start.getFullYear(), start.getMonth()]) }, [open])   // eslint-disable-line react-hooks/exhaustive-deps
  const today = localISO()
  const label = new Date(y, m, 1).toLocaleDateString(undefined, { month: 'long', year: 'numeric' })
  return (
    <Sheet open={open} onClose={onClose} title={title}>
      <div className="cal">
        <div className="cal-head">
          <button className="icon-btn ghost" onClick={() => setMonth(shiftMonth(y, m, -1))} aria-label="Previous month"><Icon name="back" size={18} /></button>
          <strong aria-live="polite">{label}</strong>
          <button className="icon-btn ghost" onClick={() => setMonth(shiftMonth(y, m, 1))} aria-label="Next month"><Icon name="chevron" size={18} /></button>
        </div>
        <div className="cal-grid" role="grid" aria-label={label}>
          {WEEKDAYS.map((w) => <span key={w} className="cal-wd" aria-hidden="true">{w}</span>)}
          {monthGrid(y, m).map((d) => {
            const off = !!min && d.iso < min
            return (
              <button key={d.iso} className={`cal-day${d.inMonth ? '' : ' out'}${d.iso === today ? ' today' : ''}${d.iso === value ? ' on' : ''}`}
                disabled={off} aria-pressed={d.iso === value} aria-label={dayLabel(d.iso)} onClick={() => { onPick(d.iso); onClose() }}>{d.day}</button>
            )
          })}
        </div>
      </div>
    </Sheet>
  )
}

/** A date drawn as the app's own chip; tapping it opens the app's calendar. */
export default function DateChip({ value, onChange, min, label, autoOpen }: { value: string; onChange: (v: string) => void; min?: string; label: string; autoOpen?: boolean }) {
  const [open, setOpen] = useState(!!autoOpen && !value)
  return (
    <>
      <button type="button" className="datechip" onClick={() => setOpen(true)} aria-label={`${label}: ${value ? dayLabel(value) : 'not set'}`}>
        <Icon name="calendar" size={14} /><span>{value ? dayLabel(value) : 'Pick a date'}</span>
      </button>
      <CalendarSheet open={open} value={value} min={min} title={label} onPick={onChange} onClose={() => setOpen(false)} />
    </>
  )
}
