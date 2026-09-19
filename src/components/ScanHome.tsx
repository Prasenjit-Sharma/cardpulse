import type { CardRecord, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Icon from './Icon'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }

function Thumb({ blob }: { blob?: Blob }) {
  const url = useObjectUrl(blob)
  return url ? <img className="scan-thumb" src={url} alt="" /> : <span className="scan-thumb blank" />
}

function when(t: number) {
  return new Date(t).toLocaleString(undefined, { day: 'numeric', month: 'short', hour: 'numeric', minute: '2-digit' })
}

/** Dashed rings around a scan frame: the empty state. */
function Rings() {
  return (
    <svg className="rings" viewBox="0 0 240 240" aria-hidden="true">
      {[110, 82, 54].map((r, i) => <circle key={r} cx="120" cy="120" r={r} fill="none" stroke="var(--line-strong)" strokeWidth="2" strokeDasharray={`${4 + i * 2} ${7 + i * 2}`} />)}
      <g fill="none" stroke="var(--slate)" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
        <rect x="54" y="54" width="34" height="26" rx="5" /><path d="M62 66h12M62 72h18" />
        <rect x="152" y="46" width="26" height="26" rx="5" /><circle cx="165" cy="56" r="4" /><path d="M158 68c1-4 12-4 14 0" />
        <rect x="46" y="150" width="26" height="26" rx="5" /><circle cx="59" cy="160" r="4" /><path d="M52 172c1-4 12-4 14 0" />
        <rect x="150" y="150" width="40" height="28" rx="5" /><circle cx="162" cy="163" r="5" /><path d="M172 160h12M172 167h10" />
      </g>
      <g fill="none" stroke="var(--accent-solid)" strokeWidth="4" strokeLinecap="round" strokeLinejoin="round">
        <path d="M92 104V94a6 6 0 0 1 6-6h10 M132 88h10a6 6 0 0 1 6 6v10 M148 136v10a6 6 0 0 1-6 6h-10 M108 152H98a6 6 0 0 1-6-6v-10" />
        <path d="M100 114h6l3-4h22l3 4h6v20H100z" fill="var(--accent-solid)" stroke="none" opacity=".92" /><circle cx="120" cy="124" r="6" fill="#fff" stroke="none" />
      </g>
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
  const shown = recent.slice(0, 6)
  const people = cards.reduce((n, c) => n + (c.corrected?.length ?? 0), 0)

  return (
    <>
      <header className="page-head"><h1>My scans</h1></header>

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
          <Rings />
          <h2>Scan any contact information</h2>
          <p>Scan a business card and instantly create a digital contact.</p>
        </div>
      ) : (
        <>
          <div className="summary-card">
            <div className="ring" style={{ ['--p' as string]: Math.min(1, recent.length / 20) }}><b className="num">{recent.length}</b><span>{recent.length === 1 ? 'scan' : 'scans'}</span></div>
            <div className="grow"><strong>{people} {people === 1 ? 'contact' : 'contacts'} saved</strong><p className="muted">in the last 30 days</p></div>
          </div>

          <h3 className="group">Recent scans</h3>
          <div className="plain-list">
            {shown.map((c) => {
              const names = (c.corrected ?? []).map((p) => p.name).filter(Boolean)
              const isNew = Date.now() - c.createdAt < 10 * 60_000 && !c.reviewed
              const multi = (c.corrected?.length ?? 0) > 1
              return (
                <div key={c.id} className="scan-row" onClick={() => (c.status === 'error' ? onRetry(c.id) : c.status === 'done' && onOpen(c.id, multi))}>
                  <Thumb blob={c.image} />
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
            })}
          </div>
          <button className="outline center" onClick={onContacts}>View all <Icon name="chevron" size={16} /></button>
        </>
      )}

      <div className="scan-cta">
        {events.length > 0 && (
          <label className="event-pick">
            <Icon name="booth" size={16} />
            <select value={activeEvent} onChange={(e) => onSelectEvent(e.target.value)} aria-label="Scan into event">
              <option value="">No event</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>
        )}
        <button className="cta" onClick={onScan}><Icon name="camera" size={22} /> Scan</button>
      </div>
    </>
  )
}
