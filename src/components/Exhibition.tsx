import { useState } from 'react'
import { download } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import type { CardRecord, EventRec } from '../lib/types'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Sheet, { SheetItem } from './Sheet'

export default function Exhibition({ cards, events, activeEvent, onNew, onRename, onDelete, onScanHere, onView }: {
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onNew: () => void
  onRename: (id: string) => void
  onDelete: (id: string) => void
  onScanHere: (id: string) => void
  onView: (id: string) => void
}) {
  const [menu, setMenu] = useState('')
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  return (
    <>
      <header className="page-head">
        <h1>Events</h1>
        <button className="icon-btn" onClick={onNew} aria-label="New event"><Icon name="plus" size={20} /></button>
      </header>

      {events.length === 0 && (
        <EmptyState icon="booth" title="No events yet" text="Trade shows, meetings, anywhere you collect cards. Create one, then scan into it."
          action={<button className="cta small" onClick={onNew}><Icon name="plus" size={18} /> New event</button>} />
      )}

      {events.map((e, i) => {
        const mine = cards.filter((c) => c.eventId === e.id)
        const done = mine.filter((c) => c.status === 'done')
        const people = done.flatMap((c) => c.corrected ?? [])
        const companies = new Set(people.map((p) => p.company.trim().toLowerCase()).filter(Boolean)).size
        const priority = people.filter((p) => p.priority).length
        const busy = mine.filter((c) => c.status === 'pending' || c.status === 'running').length
        const live = activeEvent === e.id
        return (
          <section key={e.id} className={`event-card${live ? ' live' : ''}`} style={{ ['--i' as string]: i }}>
            <span className="event-tab">{live ? 'Scanning here' : 'Event'}</span>
            <div className="event-head" onClick={() => onView(e.id)}>
              <div className="grow">
                <strong>{e.name}</strong>
                <span className="muted">{new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              <button className="icon-btn ghost" onClick={(ev) => { ev.stopPropagation(); setMenu(e.id) }} aria-label="Event options"><Icon name="more" /></button>
              <Sheet open={menu === e.id} onClose={() => setMenu('')} title={e.name}>
                <SheetItem icon="file" label="Export CSV" disabled={!done.length} onClick={() => { setMenu(''); download(`${fileSafe(e.name)}.csv`, buildCsv(done, eventName), 'text/csv') }} />
                <SheetItem icon="download" label="Export vCard" disabled={!done.length} onClick={() => { setMenu(''); download(`${fileSafe(e.name)}.vcf`, buildVcf(done, eventName, currentNameFormat()), 'text/vcard') }} />
                <SheetItem icon="edit" label="Rename" onClick={() => { setMenu(''); onRename(e.id) }} />
                <SheetItem icon="trash" danger label="Delete event" onClick={() => { setMenu(''); onDelete(e.id) }} />
              </Sheet>
            </div>
            <div className="event-stats">
              <span><b className="num">{mine.length}</b> cards</span>
              <span><b className="num">{people.length}</b> people</span>
              <span><b className="num">{companies}</b> {companies === 1 ? 'company' : 'companies'}</span>
              {priority > 0 && <span className="warm"><b className="num">{priority}</b> priority</span>}
            </div>
            {busy > 0 && <p className="muted" style={{ margin: '0 0 8px' }}>Reading {busy} card{busy > 1 ? 's' : ''}…</p>}
            <button className="cta small" onClick={() => onScanHere(e.id)}><Icon name="camera" size={18} /> Scan next card</button>
          </section>
        )
      })}
    </>
  )
}
