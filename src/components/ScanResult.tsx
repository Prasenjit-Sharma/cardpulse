import { useState } from 'react'
import type { CardRecord, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import Icon from './Icon'
import Picker from './Picker'

/** After a read: confirm who belongs, file them under an event, add a note, save. */
export default function ScanResult({ card, events, onBack, onKeep, onEdit }: {
  card: CardRecord
  events: EventRec[]
  onBack: () => void
  onKeep: (keep: number[], extras: { eventId: string; note: string }) => void
  onEdit: (idx: number) => void
}) {
  const people = card.corrected ?? []
  const [on, setOn] = useState<Set<number>>(() => new Set(people.map((_, i) => i)))
  const [eventId, setEventId] = useState(card.eventId ?? '')
  const [note, setNote] = useState('')
  const url = useObjectUrl(card.image)
  const companies = new Set(people.map((p) => p.company.trim().toLowerCase()).filter(Boolean)).size
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  return (
    <div className="page-plain">
      <header className="bar-top">
        <button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <h2 className="title">Review details</h2>
        <span style={{ width: 40 }} />
      </header>

      <div className="center"><span className="chip-pill"><Icon name="users" size={16} /> {people.length} new {people.length === 1 ? 'contact' : 'contacts'}{companies > 0 && ` · ${companies} ${companies === 1 ? 'company' : 'companies'}`}</span></div>
      {url && <div className="photo-frame"><img src={url} alt="Scanned card" /></div>}

      <div className="plain-list">
        {people.map((p, i) => (
          <div key={i} className={`contact-row${on.has(i) ? '' : ' off'}`} onClick={() => toggle(i)}>
            <span className={`check-dot${on.has(i) ? ' on' : ''}`}>{on.has(i) && <Icon name="check" size={14} />}</span>
            <Avatar name={p.name} size={44} />
            <div className="grow">
              <strong>{p.name || '(no name)'}</strong>
              <span className="muted">{[p.title, p.company].filter(Boolean).join(' | ')}</span>
              <span className="muted sm">{[p.phones[0], p.emails[0]].filter(Boolean).join('  ·  ')}</span>
            </div>
            <button className="link" onClick={(e) => { e.stopPropagation(); onEdit(i) }}>Edit</button>
          </div>
        ))}
      </div>

      <div className="field-box pickbox">
        <span>Associated event</span>
        <Picker className="pick flat" title="Associated event" value={eventId} onChange={setEventId}
          options={[{ value: '', label: 'None' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
      </div>
      <label className="field-box">
        <span>Notes (optional)</span>
        <textarea rows={3} placeholder="Just like writing on the back of a business card." value={note} onChange={(e) => setNote(e.target.value)} />
      </label>

      <div className="sticky-cta">
        <button className="cta" disabled={on.size === 0} onClick={() => onKeep([...on].sort((a, b) => a - b), { eventId, note: note.trim() })}>
          Save {on.size} {on.size === 1 ? 'contact' : 'contacts'}
        </button>
      </div>
    </div>
  )
}
