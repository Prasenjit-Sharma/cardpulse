import type { CardRecord, EventRec } from '../lib/types'
import CardThumb from './CardThumb'
import Picker from './Picker'
import Icon from './Icon'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }


const startOfToday = () => new Date().setHours(0, 0, 0, 0)

function when(t: number) {
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** An open album page: three empty sleeves on punched board, waiting for cards. */
function EmptySleeves() {
  return (
    <svg className="empty-sleeves" viewBox="0 0 260 200" aria-hidden="true">
      <rect x="10" y="8" width="240" height="184" rx="4" fill="var(--board-2)" stroke="var(--board-edge)" />
      {[34, 100, 166].map((cy) => <circle key={cy} cx="22" cy={cy} r="4" fill="var(--punch-hole)" stroke="var(--punch)" />)}
      {[22, 86, 150].map((y, i) => (
        <g key={y} opacity={1 - i * 0.26}>
          <rect x="38" y={y} width="198" height="52" rx="3" fill="var(--sleeve)" stroke="var(--board-edge)" />
          <rect x="38" y={y} width="198" height="2" fill="var(--sleeve-lip)" />
          <rect x="46" y={y + 8} width="60" height="36" rx="2" fill="var(--board-2)" stroke="var(--board-edge)" strokeDasharray="3 3" />
          <rect x="116" y={y + 16} width="78" height="4" rx="2" fill="var(--rule)" />
          <rect x="116" y={y + 26} width="52" height="3" rx="1.5" fill="var(--rule-soft)" />
        </g>
      ))}
    </svg>
  )
}

export default function ScanHome({ cards, events, activeEvent, onSelectEvent, ready, needsKey, install, onScan, onOpen, onContacts, onSetup, onRetry }: {
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onSelectEvent: (id: string) => void
  ready: boolean
  needsKey: boolean
  install: Install
  onScan: () => void
  onOpen: (id: string, review: boolean) => void
  onContacts: () => void
  onSetup: () => void
  onRetry: (id: string) => void
}) {
  const recent = cards.filter((c) => Date.now() - c.createdAt < 30 * 86_400_000)
  const t0 = startOfToday()
  const todayCards = cards.filter((c) => c.createdAt >= t0)
  const filed = recent.filter((c) => c.createdAt < t0).slice(0, 5)
  const people = cards.reduce((n, c) => n + (c.corrected?.length ?? 0), 0)

  const row = (c: CardRecord, i: number) => {
    const names = (c.corrected ?? []).map((p) => p.name).filter(Boolean)
    const isNew = Date.now() - c.createdAt < 10 * 60_000 && !c.reviewed
    const multi = (c.corrected?.length ?? 0) > 1
    return (
      <div key={c.id} className="scan-row" style={{ ['--i' as string]: i }}
        onClick={() => (c.status === 'error' ? onRetry(c.id) : c.status === 'done' && onOpen(c.id, multi))}>
        <CardThumb blob={c.image} name={names[0] ?? ''} />
        <div className="grow">
          {c.status === 'done' ? (
            <>
              <strong>{names[0] ?? 'Unnamed card'}{names.length > 1 && <span className="plus"> +{names.length - 1}</span>}</strong>
              <span className="muted">{c.corrected?.[0]?.company ?? ''}</span>
              <span className="muted time">{when(c.createdAt)}</span>
            </>
          ) : c.status === 'error' ? (
            <><strong className="bad">Couldn't read this card</strong><span className="muted">Tap to try again</span></>
          ) : (
            <><strong>Reading…</strong><span className="dots"><i /><i /><i /></span></>
          )}
        </div>
        {isNew && <span className="new-tag">New</span>}
      </div>
    )
  }

  return (
    <>
      <header className="album-head">
        <span className="wordmark">CardPulse</span>
        <span className="tally num">{cards.length === 0 ? 'new album' : todayCards.length > 0 ? <><b>{todayCards.length}</b> today</> : <><b>{people}</b> filed</>}</span>
      </header>

      {needsKey && !ready && (
        <button className="banner-row" onClick={onSetup}><Icon name="spark" size={18} /><span className="grow"><strong>Add your Gemini key</strong><small>Needed to read cards</small></span><Icon name="chevron" size={18} /></button>
      )}
      {install.visible && (
        <div className="banner-row static">
          <Icon name="download" size={18} />
          <span className="grow"><strong>Install CardPulse</strong><small>{install.mode === 'ios' ? 'Tap Share, then Add to Home Screen' : 'One-tap scanning from your home screen'}</small></span>
          {install.mode === 'native' && <button className="link" onClick={install.install}>Install</button>}
          <button className="icon-btn ghost small" onClick={install.dismiss} aria-label="Dismiss"><Icon name="x" size={16} /></button>
        </div>
      )}

      {cards.length === 0 ? (
        <div className="empty-scan">
          <EmptySleeves />
          <h2>The album is empty</h2>
          <p>Scan a card and it is seated in the first sleeve, with everything on it read and filed.</p>
        </div>
      ) : (
        <>
          {todayCards.length > 0 && (
            <div className="band">
              <span className="band-label">under the band</span>
              <div className="plain-list">{todayCards.map(row)}</div>
            </div>
          )}

          {filed.length > 0 && (
            <section>
              <h3 className="group">Filed</h3>
              <div className="plain-list">{filed.map(row)}</div>
            </section>
          )}

          <button className="outline center" onClick={onContacts}>View all <Icon name="chevron" size={16} /></button>
        </>
      )}

      <div className="scan-cta">
        {events.length > 0 && (
          <Picker className="event-pick" title="Scan into" icon="booth" value={activeEvent} onChange={onSelectEvent}
            options={[{ value: '', label: 'No event', hint: 'Cards are not filed under anything' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
        )}
        <button className="cta" onClick={onScan}><Icon name="camera" size={22} /> Scan a card</button>
      </div>
    </>
  )
}
