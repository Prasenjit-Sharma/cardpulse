import { useState } from 'react'
import type { CardRecord } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import Icon from './Icon'

/** After a photo with several people: confirm who belongs before they become contacts. */
export default function ScanResult({ card, onBack, onKeep, onEdit }: {
  card: CardRecord
  onBack: () => void
  onKeep: (keep: number[]) => void
  onEdit: (idx: number) => void
}) {
  const people = card.corrected ?? []
  const [on, setOn] = useState<Set<number>>(() => new Set(people.map((_, i) => i)))
  const url = useObjectUrl(card.image)
  const companies = new Set(people.map((p) => p.company.trim().toLowerCase()).filter(Boolean)).size
  const toggle = (i: number) => setOn((s) => { const n = new Set(s); n.has(i) ? n.delete(i) : n.add(i); return n })

  return (
    <div className="editor">
      <header className="bar-top">
        <button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button>
        <span className="title muted">Scan result</span>
        <span style={{ width: 40 }} />
      </header>

      <h1>{people.length} {people.length === 1 ? 'person' : 'people'}.{companies > 0 && <> {companies} {companies === 1 ? 'company' : 'companies'}.</>}</h1>
      <p className="muted lede">Shared company details were kept for everyone. Untick anyone who doesn't belong.</p>

      {url && <img className="result-img" src={url} alt="Scanned card" />}

      <div className="list">
        {people.map((p, i) => (
          <div key={i} className={`row person${on.has(i) ? '' : ' off'}`} onClick={() => toggle(i)}>
            <span className={`check-dot${on.has(i) ? ' on' : ''}`}>{on.has(i) && <Icon name="check" size={14} />}</span>
            <Avatar name={p.name} />
            <div className="grow">
              <strong>{p.name || '(no name)'}</strong>
              <span className="muted">{[p.title, p.company].filter(Boolean).join(' · ')}</span>
              <span className="muted sub">{[p.phones[0], p.emails[0]].filter(Boolean).join('  ·  ')}</span>
            </div>
            <button className="link" onClick={(e) => { e.stopPropagation(); onEdit(i) }}>Edit</button>
          </div>
        ))}
      </div>

      <div className="sticky-cta">
        <button className="primary big" disabled={on.size === 0} onClick={() => onKeep([...on].sort((a, b) => a - b))}>
          Keep {on.size} {on.size === 1 ? 'contact' : 'contacts'}
        </button>
      </div>
    </div>
  )
}
