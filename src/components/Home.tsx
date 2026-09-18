import type { CardRecord, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import Icon from './Icon'
import Logo from './Logo'

const WEEK = 7 * 86_400_000
const today = () => new Date().toISOString().slice(0, 10)

function Thumb({ blob, name }: { blob?: Blob; name: string }) {
  const url = useObjectUrl(blob)
  return url ? <img className="thumb" src={url} alt="" /> : <Avatar name={name} />
}

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }

export default function Home({ cards, events, dupes, hasKey, install, onScan, onExhibition, onSetup, onOpen, onContacts }: {
  cards: CardRecord[]
  events: EventRec[]
  dupes: Map<string, CardRecord[]>
  hasKey: boolean
  install: Install
  onScan: () => void
  onExhibition: () => void
  onSetup: () => void
  onOpen: (id: string, idx: number) => void
  onContacts: () => void
}) {
  const done = cards.filter((c) => c.status === 'done')
  const people = done.flatMap((c) => (c.corrected ?? []).map((p, i) => ({ c, p, i })))
  const thisWeek = people.filter((x) => Date.now() - x.c.createdAt < WEEK).length
  const recent = people.slice(0, 5)
  const due = people.filter((x) => x.p.followUp && x.p.followUp <= today())
  const failed = cards.filter((c) => c.status === 'error').length
  const busy = cards.filter((c) => c.status === 'pending' || c.status === 'running').length
  const dupCount = done.filter((c) => dupes.has(c.id)).length

  const steps = [
    { label: 'Connect Gemini', hint: 'Add your free API key', done: hasKey, run: onSetup },
    { label: 'Scan your first card', hint: 'One card, or a whole table of them', done: people.length > 0, run: onScan },
    { label: 'Try exhibition mode', hint: 'File everything under an event', done: events.length > 0, run: onExhibition },
  ]
  const stepsDone = steps.filter((s) => s.done).length

  return (
    <>
      <header className="brand"><Logo /><span>CardPulse</span></header>

      <section className="summary">
        {people.length > 0 ? (
          <>
            <p className="eyebrow">Your network</p>
            <div className="big num">{people.length}<span>{people.length === 1 ? ' contact' : ' contacts'}</span></div>
            <p className="sub">{thisWeek} added this week · {events.length} {events.length === 1 ? 'event' : 'events'}</p>
          </>
        ) : (
          <>
            <h1>Turn business cards into contacts</h1>
            <p className="sub">Scan one card or a whole table of them. Every person becomes a contact you can call, message or save.</p>
          </>
        )}
      </section>

      <div className="cta-row">
        <button className="primary" onClick={onScan}><Icon name="camera" size={20} /> Scan a card</button>
        <button className="tinted" onClick={onExhibition}><Icon name="booth" size={20} /> Exhibition</button>
      </div>

      {stepsDone < steps.length && (
        <section className="card checklist">
          <div className="row-top"><h2>Get started</h2><span className="muted num">{stepsDone} of {steps.length}</span></div>
          <div className="meter"><i style={{ width: `${(stepsDone / steps.length) * 100}%` }} /></div>
          {steps.map((s) => (
            <button key={s.label} className={`step${s.done ? ' done' : ''}`} onClick={s.run} disabled={s.done}>
              <span className="step-dot">{s.done && <Icon name="check" size={14} />}</span>
              <span className="grow"><strong>{s.label}</strong><small>{s.hint}</small></span>
              {!s.done && <Icon name="back" size={16} />}
            </button>
          ))}
        </section>
      )}

      {install.visible && (
        <section className="card install">
          <span className="install-icon"><Icon name="download" size={20} /></span>
          <div className="grow">
            <strong>Install CardPulse</strong>
            <small>{install.mode === 'ios' ? 'Tap Share, then Add to Home Screen.' : 'Add it to your home screen for one-tap scanning.'}</small>
          </div>
          {install.mode === 'native' && <button className="primary small" onClick={install.install}>Install</button>}
          <button className="icon-btn ghost" onClick={install.dismiss} aria-label="Dismiss"><Icon name="x" size={18} /></button>
        </section>
      )}

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

      {recent.length > 0 && (
        <section>
          <h3 className="group">Recent scans</h3>
          <div className="list">
            {recent.map(({ c, p, i }) => (
              <div key={`${c.id}:${i}`} className="row" onClick={() => onOpen(c.id, i)}>
                <Thumb blob={c.image} name={p.name} />
                <div className="grow"><strong>{p.name || '(no name)'}</strong><span className="muted">{[p.title, p.company].filter(Boolean).join(' · ')}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}
    </>
  )
}
