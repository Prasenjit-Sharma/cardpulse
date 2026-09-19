import { download } from '../lib/actions'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import type { CardRecord, EventRec } from '../lib/types'
import EmptyState from './EmptyState'
import Icon from './Icon'

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
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  return (
    <>
      <header className="page-head">
        <div><h1>Events</h1><p className="muted">Trade shows, meetings, anywhere you collect cards.</p></div>
        <button className="icon-btn primary" onClick={onNew} aria-label="New event"><Icon name="plus" /></button>
      </header>

      {events.length === 0 && (
        <EmptyState icon="booth" title="No events yet" text="Create one, then scan into it. Everything is filed together and ready to export when the show ends."
          action={<button className="primary" onClick={onNew}><Icon name="plus" size={18} /> New event</button>} />
      )}

      {events.map((e) => {
        const mine = cards.filter((c) => c.eventId === e.id)
        const done = mine.filter((c) => c.status === 'done')
        const people = done.flatMap((c) => c.corrected ?? [])
        const companies = new Set(people.map((p) => p.company.trim().toLowerCase()).filter(Boolean)).size
        const priority = people.filter((p) => p.priority).length
        const busy = mine.filter((c) => c.status === 'pending' || c.status === 'running').length
        const live = activeEvent === e.id
        return (
          <section key={e.id} className={`event-card${live ? ' active' : ''}`}>
            <div className="row-top">
              <div className="grow">
                <h2>{e.name}</h2>
                <span className="muted">{new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
              </div>
              {live && <span className="pill ok compact"><i />Scanning here</span>}
            </div>
            <div className="stats2 tight">
              <div><b className="num">{mine.length}</b><span>Cards scanned</span></div>
              <div><b className="num">{people.length}</b><span>People</span></div>
              <div><b className="num">{companies}</b><span>{companies === 1 ? 'Company' : 'Companies'}</span></div>
              <div className={priority ? 'warm' : ''}><b className="num">{priority}</b><span>Priority</span></div>
            </div>
            {busy > 0 && <p className="muted" style={{ margin: '0 0 8px' }}>Reading {busy} card{busy > 1 ? 's' : ''}…</p>}
            <div className="pair">
              <button className="primary" onClick={() => onScanHere(e.id)}><Icon name="camera" size={18} /> Scan next card</button>
              <button onClick={() => onView(e.id)}>View people</button>
            </div>
            <div className="mini-actions">
              <button className="link" disabled={!done.length} onClick={() => download(`${fileSafe(e.name)}.csv`, buildCsv(done, eventName), 'text/csv')}>Export CSV</button>
              <button className="link" disabled={!done.length} onClick={() => download(`${fileSafe(e.name)}.vcf`, buildVcf(done, eventName), 'text/vcard')}>Export vCard</button>
              <button className="link" onClick={() => onRename(e.id)}>Rename</button>
              <button className="link bad" onClick={() => onDelete(e.id)}>Delete</button>
            </div>
          </section>
        )
      })}
    </>
  )
}
