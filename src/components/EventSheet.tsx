import { useEffect, useRef, useState } from 'react'
import type { EventRec } from '../lib/types'
import DateChip from './DateChip'
import Sheet from './Sheet'

export type EventDraft = Pick<EventRec, 'name' | 'start' | 'end'>

/**
 * Create or edit an event: its name and, optionally, the days it runs. Between those days the event is live: it leads the
 * Home and Contacts screens and new scans go into it.
 */
export default function EventSheet({ open, event, onSave, onClose }: { open: boolean; event?: EventRec; onSave: (d: EventDraft) => void; onClose: () => void }) {
  const [name, setName] = useState('')
  const [start, setStart] = useState('')
  const [end, setEnd] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    if (!open) return
    setName(event?.name ?? ''); setStart(event?.start ?? ''); setEnd(event?.end ?? '')
    if (!event) setTimeout(() => input.current?.focus(), 60)
  }, [open, event?.id])   // eslint-disable-line react-hooks/exhaustive-deps

  const pickStart = (v: string) => { setStart(v); if (end && end < v) setEnd('') }
  const ok = !!name.trim()
  return (
    <Sheet open={open} onClose={onClose} title={event ? 'Edit event' : 'New event'}>
      <form className="dialog event-form" onSubmit={(e) => { e.preventDefault(); if (ok) onSave({ name: name.trim(), start: start || undefined, end: start && end && end !== start ? end : undefined }) }}>
        <input ref={input} value={name} onChange={(e) => setName(e.target.value)} placeholder="Exhibition or event name" aria-label="Event name" maxLength={80} enterKeyHint="done" />
        <div className="event-dates" role="group" aria-label="Dates">
          <span className="lbl">From</span>
          <DateChip value={start} label="First day" onChange={pickStart} />
          <span className="lbl">to</span>
          <DateChip value={end || start} min={start || undefined} label="Last day" onChange={(v) => { setEnd(v); if (!start) setStart(v) }} />
        </div>
        <p className="hint event-hint">{start ? 'Live on these days: it leads Home and Contacts, and new scans go into it.' : 'Optional. Add the days it runs and it goes live on them.'}
          {start && <button type="button" className="link" onClick={() => { setStart(''); setEnd('') }}>Clear dates</button>}</p>
        <div className="dialog-actions">
          <button type="button" className="outline" onClick={onClose}>Cancel</button>
          <button type="submit" className="cta" disabled={!ok}>{event ? 'Save' : 'Create'}</button>
        </div>
      </form>
    </Sheet>
  )
}
