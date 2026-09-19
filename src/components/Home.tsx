import type { CardRecord, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import CardStack from './CardStack'
import Icon from './Icon'
import Logo from './Logo'

const today = () => new Date().toISOString().slice(0, 10)
const startOfToday = () => new Date().setHours(0, 0, 0, 0)

function Thumb({ blob, name }: { blob?: Blob; name: string }) {
  const url = useObjectUrl(blob)
  return url ? <img className="thumb" src={url} alt="" /> : <Avatar name={name} />
}

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }

export default function Home({ cards, events, dupes, hasKey, needsKey, install, onScan, onBatch, onUpload, onExhibition, onSetup, onSettings, onOpen, onContacts }: {
  cards: CardRecord[]
  events: EventRec[]
  dupes: Map<string, CardRecord[]>
  hasKey: boolean
  needsKey: boolean
  install: Install
  onScan: () => void
  onBatch: () => void
  onUpload: (f: FileList) => void
  onExhibition: () => void
  onSetup: () => void
  onSettings: () => void
  onOpen: (id: string, idx: number) => void
  onContacts: () => void
}) {
  const done = cards.filter((c) => c.status === 'done')
  const people = done.flatMap((c) => (c.corrected ?? []).map((p, i) => ({ c, p, i })))
  const t0 = startOfToday()
  const todayCards = cards.filter((c) => c.createdAt >= t0).length
  const todayPeople = people.filter((x) => x.c.createdAt >= t0)
  const companies = new Set(todayPeople.map((x) => x.p.company.trim().toLowerCase()).filter(Boolean)).size
  const dueList = people.filter((x) => x.p.followUp && x.p.followUp <= today())
  const recent = people.slice(0, 5)
  const failed = cards.filter((c) => c.status === 'error').length
  const busy = cards.filter((c) => c.status === 'pending' || c.status === 'running').length
  const dupCount = done.filter((c) => dupes.has(c.id)).length

  const steps = [
    ...(needsKey ? [{ label: 'Connect Gemini', hint: 'Add your free API key', done: hasKey, run: onSetup }] : []),
    { label: 'Scan your first card', hint: 'One card, or a whole table of them', done: people.length > 0, run: onScan },
    { label: 'Try an event', hint: 'File everything under a show or meeting', done: events.length > 0, run: onExhibition },
  ]
  const stepsDone = steps.filter((s) => s.done).length

  return (
    <>
      <header className="home-head">
        <div className="brand"><Logo size={26} /><span>CardPulse</span></div>
        <button className="icon-btn ghost" onClick={onSettings} aria-label="Settings"><Icon name="sliders" /></button>
      </header>

      <div className={`pill${hasKey ? ' ok' : ' warn'}`}><i />{hasKey ? 'Ready to capture' : 'Finish setup to start scanning'}</div>

      <section className="hero-card">
        <div className="hero-copy">
          <h1>Every card starts a conversation.</h1>
          <p>Scan one at a time, or lay a table's worth in a single photo.</p>
        </div>
        <CardStack />
      </section>

      <button className="primary big" onClick={onScan}><Icon name="camera" size={20} /> Scan a card</button>

      <div className="quick">
        <label className="tile"><Icon name="upload" size={20} /><span>Import</span>
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = '' }} />
        </label>
        <button className="tile" onClick={onBatch}><Icon name="users" size={20} /><span>Batch scan</span></button>
        <button className="tile" onClick={onExhibition}><Icon name="booth" size={20} /><span>Events</span></button>
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
            <small>{install.mode === 'ios' ? 'Tap Share, then Add to Home Screen.' : 'One-tap scanning from your home screen.'}</small>
          </div>
          {install.mode === 'native' && <button className="primary small" onClick={install.install}>Install</button>}
          <button className="icon-btn ghost" onClick={install.dismiss} aria-label="Dismiss"><Icon name="x" size={18} /></button>
        </section>
      )}

      {busy > 0 && <div className="note">Reading {busy} card{busy > 1 ? 's' : ''}…</div>}
      {failed > 0 && <div className="note">{failed} card{failed > 1 ? 's' : ''} couldn't be read. <button className="link" onClick={onContacts}>Review</button></div>}
      {dupCount > 0 && <div className="note">{dupCount} possible duplicate{dupCount > 1 ? 's' : ''}. <button className="link" onClick={onContacts}>Review</button></div>}

      <h3 className="group">Today</h3>
      <div className="stats4">
        <div><b className="num">{todayCards}</b><span>Cards</span></div>
        <div><b className="num">{todayPeople.length}</b><span>People</span></div>
        <div><b className="num">{companies}</b><span>{companies === 1 ? 'Company' : 'Companies'}</span></div>
        <div className={dueList.length ? 'warm' : ''}><b className="num">{dueList.length}</b><span>Follow-ups</span></div>
      </div>

      {dueList.length > 0 && (
        <section>
          <h3 className="group">Follow up</h3>
          <div className="list">
            {dueList.slice(0, 4).map(({ c, p, i }) => (
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
          <h3 className="group">Recent</h3>
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
