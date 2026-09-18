import { download } from '../lib/actions'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import type { CardRecord, EventRec } from '../lib/types'
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
      <header className="page-head"><div><h1>Exhibition mode</h1><p className="muted">Scan stacks of cards fast. Lay several cards in one photo to save time.</p></div></header>
      <button className="primary wide" onClick={onNew}><Icon name="plus" size={18} /> New exhibition</button>

      {events.length === 0 && (
        <div className="empty"><h2>No exhibitions yet</h2><p>Create one, then tap <b>Scan here</b>. Every card you scan is filed under it.</p></div>
      )}

      {events.map((e) => {
        const mine = cards.filter((c) => c.eventId === e.id)
        const done = mine.filter((c) => c.status === 'done')
        const people = done.reduce((n, c) => n + (c.corrected?.length ?? 0), 0)
        const busy = mine.filter((c) => c.status === 'pending' || c.status === 'running').length
        return (
          <div key={e.id} className={`event-card${activeEvent === e.id ? ' active' : ''}`}>
            <div className="row-top">
              <div className="grow">
                <h2>{e.name}</h2>
                <span className="muted">{new Date(e.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{activeEvent === e.id && ' · scanning here'}</span>
              </div>
            </div>
            <div className="stats3 tight">
              <div><b>{people}</b><span>Contacts</span></div>
              <div><b>{mine.length}</b><span>Photos</span></div>
              <div><b>{busy}</b><span>Reading</span></div>
            </div>
            <div className="actions">
              <button className="primary" onClick={() => onScanHere(e.id)}><Icon name="camera" size={16} /> Scan here</button>
              <button onClick={() => onView(e.id)}>View</button>
            </div>
            <div className="mini-actions">
              <button className="link" disabled={!done.length} onClick={() => download(`${fileSafe(e.name)}.csv`, buildCsv(done, eventName), 'text/csv')}>Export CSV</button>
              <button className="link" disabled={!done.length} onClick={() => download(`${fileSafe(e.name)}.vcf`, buildVcf(done, eventName), 'text/vcard')}>Export vCard</button>
              <button className="link" onClick={() => onRename(e.id)}>Rename</button>
              <button className="link bad" onClick={() => onDelete(e.id)}>Delete</button>
            </div>
          </div>
        )
      })}
    </>
  )
}
