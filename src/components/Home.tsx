import type { CardRecord, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import Icon from './Icon'

const WEEK = 7 * 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

function Thumb({ blob, name }: { blob?: Blob; name: string }) {
  const url = useObjectUrl(blob)
  return url ? <img className="thumb" src={url} alt="" /> : <Avatar name={name} />
}

export default function Home({ cards, events, dupes, onScan, onExhibition, onOpen, onContacts, onAccuracy }: {
  cards: CardRecord[]
  events: EventRec[]
  dupes: Map<string, CardRecord[]>
  onScan: () => void
  onExhibition: () => void
  onOpen: (id: string, idx: number) => void
  onContacts: () => void
  onAccuracy: () => void
}) {
  const done = cards.filter((c) => c.status === 'done')
  const people = done.flatMap((c) => (c.corrected ?? []).map((p, i) => ({ c, p, i })))
  const thisWeek = people.filter((x) => Date.now() - x.c.createdAt < WEEK).length
  const recent = people.slice(0, 5)
  const due = people.filter((x) => x.p.followUp && x.p.followUp <= today())
  const failed = cards.filter((c) => c.status === 'error').length
  const busy = cards.filter((c) => c.status === 'pending' || c.status === 'running').length
  const dupCount = done.filter((c) => dupes.has(c.id)).length

  return (
    <>
      <header className="page-head"><div><h1>Namaste 👋</h1><p className="muted">Scan a card and it becomes a contact.</p></div></header>

      <div className="hero-card">
        <div className="hero-buttons">
          <button onClick={onScan}><Icon name="camera" size={22} /><span>Scan a card</span></button>
          <button onClick={onExhibition}><Icon name="booth" size={22} /><span>Exhibition mode</span></button>
        </div>
      </div>

      <div className="stats3">
        <div><b>{people.length}</b><span>Contacts</span></div>
        <div><b>{thisWeek}</b><span>This week</span></div>
        <div><b>{events.length}</b><span>Events</span></div>
      </div>

      {busy > 0 && <div className="note">Reading {busy} card{busy > 1 ? 's' : ''}…</div>}
      {failed > 0 && <div className="note">{failed} card{failed > 1 ? 's' : ''} couldn't be read. <button className="link" onClick={onContacts}>Review</button></div>}
      {dupCount > 0 && <div className="note">{dupCount} possible duplicate{dupCount > 1 ? 's' : ''}. <button className="link" onClick={onContacts}>Review</button></div>}

      {due.length > 0 && (
        <section>
          <h3 className="group">Follow up</h3>
          <div className="list">
            {due.slice(0, 5).map(({ c, p, i }) => (
              <div key={`${c.id}:${i}`} className="row" onClick={() => onOpen(c.id, i)}>
                <Avatar name={p.name} />
                <div className="grow"><strong>{p.name}</strong><span className="muted">{p.note || [p.title, p.company].filter(Boolean).join(' · ')}</span></div>
                <span className="tags"><em className="warn">{p.followUp}</em></span>
              </div>
            ))}
          </div>
        </section>
      )}

      <section>
        <h3 className="group">Recent scans</h3>
        {recent.length === 0 ? (
          <div className="empty small">
            <p>No cards yet. Tap <b>Scan a card</b> to get started.</p>
          </div>
        ) : (
          <div className="list">
            {recent.map(({ c, p, i }) => (
              <div key={`${c.id}:${i}`} className="row" onClick={() => onOpen(c.id, i)}>
                <Thumb blob={c.image} name={p.name} />
                <div className="grow"><strong>{p.name || '(no name)'}</strong><span className="muted">{[p.title, p.company].filter(Boolean).join(' · ')}</span></div>
              </div>
            ))}
          </div>
        )}
      </section>

      <button className="menu-row" onClick={onAccuracy}><Icon name="chart" /><span className="grow"><b>Accuracy lab</b><small>Check how well cards are being read</small></span><Icon name="back" size={16} /></button>
    </>
  )
}
