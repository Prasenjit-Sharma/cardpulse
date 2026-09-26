import { useState } from 'react'
import { needsAttention } from '../lib/attention'
import { localISO } from '../lib/followups'
import { companyList } from '../lib/companies'
import { eventState, eventWhen, featuredEvents, showEvent } from '../lib/eventname'
import { dueFigure, isToday, rowFigure, shortDate } from '../lib/watch'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import Icon from './Icon'
import Logo from './Logo'
import WatchRow from './WatchRow'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }
interface Person { card: CardRecord; p: Contact; i: number; key: string }
type List = 'due' | 'upcoming' | 'recent' | 'starred'

const WEEK_MS = 7 * 24 * 60 * 60 * 1000
const ROWS = 6

/** The brand's pulse, drawn once across the masthead as the app opens. */
function PulseLine() {
  return (
    <svg className="mast-pulse" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true">
      <path d="M0 40 H190 L204 40 L214 18 L228 62 L240 8 L252 40 H290 L298 32 L306 40 H400" />
      <path className="beat" d="M0 40 H190 L204 40 L214 18 L228 62 L240 8 L252 40 H290 L298 32 L306 40 H400" pathLength="1" />
    </svg>
  )
}

/**
 * The first-run picture, on the masthead: a sample card inside the camera's own corner frame, with the read line passing
 * over it. It shows what the Scan key does before anyone has pressed it.
 */
function SampleScan() {
  return (
    <svg className="first-card" viewBox="0 0 300 172" role="img" aria-label="A business card being read by the camera">
      <g className="first-card-body">
        <rect x="30" y="16" width="240" height="138" rx="9" fill="#FFFFFF" />
        <text x="50" y="44" className="fc-co">ABC POLYMERS PVT. LTD.</text>
        <text x="50" y="76" className="fc-name">Rajesh Shah</text>
        <text x="50" y="94" className="fc-title">General Manager, Procurement</text>
        <rect x="50" y="110" width="118" height="0.8" fill="#16191D" opacity=".16" />
        <text x="50" y="124" className="fc-line">+91 98765 43210</text>
        <text x="50" y="140" className="fc-line">rajesh@abcpolymers.com</text>
        <rect x="212" y="98" width="42" height="42" rx="4" fill="#EEEEF7" />
        <circle cx="233" cy="46" r="13" fill="#3B2FC9" />
        <text x="233" y="50.5" className="fc-mono">RS</text>
      </g>
      <rect className="first-read" x="30" y="16" width="240" height="3" rx="1.5" />
      <path className="first-frame" d="M18 34 V6 H46 M254 6 H282 V34 M282 138 V166 H254 M46 166 H18 V138" />
    </svg>
  )
}

const FIRST_PROOFS: { icon: Parameters<typeof Icon>[0]['name']; title: string; text: string }[] = [
  { icon: 'bolt', title: 'Read in seconds', text: 'Name, numbers, email, address, even GSTIN. Nothing to type.' },
  { icon: 'globe', title: 'Hindi and regional scripts', text: 'Cards in हिंदी, ગુજરાતી, தமிழ் and more are read too.' },
  { icon: 'users', title: 'Several people, one photo', text: 'Partners on one card, or a table of cards in a single shot.' },
]

/**
 * Home is the day's desk: an indigo masthead carrying today's figures, the event that matters now, then a watchlist of
 * the people who need you (due, upcoming, recent, starred) with Call and WhatsApp one tap away. All of it above the fold.
 */
export default function Home({ cards, events, dupes, ready, needsKey, install, backupNudge, onBackup, onSnoozeBackup, onOpenContact, onTogglePriority, onContacts, onCompanies, onStarred, onAttention, onInsights, onSetup, onSettings, onViewEvent, onEvents, onScan, onMyCard }: {
  cards: CardRecord[]
  events: EventRec[]
  dupes: Map<string, CardRecord[]>
  ready: boolean
  needsKey: boolean
  install: Install
  backupNudge: boolean
  onBackup: () => void
  onSnoozeBackup: () => void
  onOpenContact: (id: string, idx: number) => void
  onTogglePriority: (id: string, idx: number) => void
  onContacts: () => void
  onCompanies: () => void
  onStarred: () => void
  onAttention: () => void
  onInsights: () => void
  onSetup: () => void
  onSettings: () => void
  onViewEvent: (id: string) => void
  onEvents: () => void
  onScan: () => void
  onMyCard: () => void
}) {
  const today = localISO()
  const now = Date.now()
  const people: Person[] = cards.filter((c) => c.status === 'done').flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i, key: `${c.id}:${i}` })))
  const due = people.filter((x) => x.p.followUp && x.p.followUp <= today).sort((a, b) => a.p.followUp!.localeCompare(b.p.followUp!))
  const overdue = due.filter((x) => x.p.followUp! < today).length
  const upcoming = people.filter((x) => x.p.followUp && x.p.followUp > today).sort((a, b) => a.p.followUp!.localeCompare(b.p.followUp!))
  const recent = [...people].sort((a, b) => b.card.createdAt - a.card.createdAt)
  const starred = people.filter((x) => x.p.priority)
  const week = people.filter((x) => now - x.card.createdAt < WEEK_MS).length
  const scannedToday = people.filter((x) => isToday(x.card.createdAt, today)).length
  const companies = companyList(cards).length
  const toCheck = cards.filter((c) => needsAttention(c, dupes.has(c.id))).length

  // Until the user picks a watchlist, show the one that matters: due, else upcoming, else recent. Chosen at render time,
  // because contacts load after the first render.
  const [picked, setList] = useState<List | null>(null)
  const list: List = picked ?? (due.length ? 'due' : upcoming.length ? 'upcoming' : 'recent')
  const [openKey, setOpenKey] = useState('')
  const lists: { id: List; label: string; items: Person[]; more: () => void; empty: string }[] = [
    { id: 'due', label: 'Due', items: due, more: onInsights, empty: 'Nobody is due. Set a follow-up date on a contact and it lands here on the day.' },
    { id: 'upcoming', label: 'Upcoming', items: upcoming, more: onInsights, empty: 'No follow-ups ahead.' },
    { id: 'recent', label: 'Recent', items: recent, more: onContacts, empty: 'No contacts yet.' },
    { id: 'starred', label: 'Starred', items: starred, more: onStarred, empty: 'Star the people who matter most and they wait here.' },
  ]
  const shown = lists.find((l) => l.id === list)!
  // a short watchlist never leaves the desk half empty: the next phase carries on under its own band
  const NEXT: Record<List, List[]> = { due: ['upcoming', 'recent'], upcoming: ['recent'], recent: [], starred: ['recent'] }
  const room = ROWS - Math.min(shown.items.length, ROWS)
  const seen = new Set(shown.items.slice(0, ROWS).map((x) => x.key))
  const then = room >= 2 ? NEXT[list].map((id) => lists.find((l) => l.id === id)!).map((l) => ({ ...l, items: l.items.filter((x) => !seen.has(x.key)) })).find((l) => l.items.length) : undefined
  const row = (x: Person, n: number, recentFig: boolean) => (
    <WatchRow key={x.key} card={x.card} p={x.p} i={n}
      figure={recentFig ? { text: shortDate(x.card.createdAt, now), sub: isToday(x.card.createdAt, today) ? 'Today' : 'Scanned', tone: 'muted' } : (dueFigure(x.p.followUp, today) ?? rowFigure(x.p, x.card.createdAt, today, now))}
      open={openKey === x.key} onToggle={() => setOpenKey(openKey === x.key ? '' : x.key)}
      onOpen={() => onOpenContact(x.card.id, x.i)} onStar={() => onTogglePriority(x.card.id, x.i)} />
  )

  // only events running today, under the masthead so they never need a scroll; two at most keep the watchlist on screen.
  // Upcoming and past events live on the Events tab.
  const live = featuredEvents(events.filter((e) => eventState(e, today) === 'live'), today, 2).map((e) => {
    const mine = people.filter((x) => x.card.eventId === e.id)
    return { e, n: mine.length, added: mine.filter((x) => isToday(x.card.createdAt, today)).length }
  })

  return (
    <>
      <header className="masthead">
        <PulseLine />
        <div className="mast-top">
          <span className="wordmark"><Logo size={24} tone="light" />CardPulse</span>
          <button className="icon-btn ghost" onClick={onContacts} aria-label="Search contacts"><Icon name="search" size={20} /></button>
          <button className="icon-btn ghost" onClick={onSettings} aria-label="Settings"><Icon name="sliders" size={20} /></button>
        </div>
        {cards.length === 0 && <SampleScan />}
        {cards.length > 0 && (
          // one grid for both rows, so every figure sits in the same column as the one above it
          <div className="mast-figs" role="group" aria-label="Today">
            <button className={due.length ? 'due' : ''} onClick={() => setList('due')}>
              <span>Due</span>
              <b className="num">{due.length}</b>
              <small>{overdue ? `${overdue} overdue` : due.length ? 'none overdue' : 'all clear'}</small>
            </button>
            <button onClick={() => setList('recent')}>
              <span>This week</span>
              <b className="num">{week}</b>
              <small className={scannedToday ? 'up' : ''}>{scannedToday ? `+${scannedToday} today` : 'none today'}</small>
            </button>
            <button onClick={onContacts}>
              <span>Contacts</span>
              <b className="num">{people.length}</b>
              <small>{events.length} {events.length === 1 ? 'event' : 'events'}</small>
            </button>
            <button className="mini" onClick={onStarred}><span>Starred</span><b className="num">{starred.length}</b></button>
            <button className="mini" onClick={onCompanies}><span>Companies</span><b className="num">{companies}</b></button>
            <button className={`mini${toCheck ? ' check' : ''}`} onClick={onAttention}><span>To check</span><b className="num">{toCheck}</b></button>
          </div>
        )}
      </header>

      {needsKey && !ready && (
        <button className="banner-row check" onClick={onSetup}><Icon name="spark" size={18} /><span className="grow"><strong>Add your Gemini key</strong><small>Needed to read cards</small></span><Icon name="chevron" size={18} /></button>
      )}
      {backupNudge && (
        <div className="banner-row static check">
          <Icon name="download" size={18} />
          <span className="grow"><strong>Export a copy of your contacts</strong><small>They are stored only on this phone</small></span>
          <button className="link" onClick={onBackup}>Export</button>
          <button className="icon-btn ghost small" onClick={onSnoozeBackup} aria-label="Remind me later"><Icon name="x" size={16} /></button>
        </div>
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
        <section className="first-scan" aria-labelledby="first-scan-title">
          <h2 id="first-scan-title">Scan your first card</h2>
          <p>Point the camera at any business card. It is read and saved as a contact, ready to call or WhatsApp.</p>
          <button className="cta first-cta" onClick={onScan}><Icon name="camera" size={20} /> Scan a card</button>
          <ul className="first-proofs">
            {FIRST_PROOFS.map((f) => (
              <li key={f.title}><span className="tool-well"><Icon name={f.icon} size={18} /></span><span className="grow"><strong>{f.title}</strong><small>{f.text}</small></span></li>
            ))}
          </ul>
          <button className="link first-mycard" onClick={onMyCard}>Or start with your own digital card<Icon name="chevron" size={14} /></button>
        </section>
      ) : (
        <>
          {live.map(({ e, n, added }, i) => (
            <div key={e.id} className="event-strip live">
              <button className="event-strip-main" onClick={() => onViewEvent(e.id)}>
                <em className="live-tag">Live</em>
                <span className="grow"><strong>{showEvent(e.name)}</strong><span className="muted">{eventWhen(e, today, (t) => shortDate(t, now))}</span></span>
                <span className="fig"><b className="num">{n}</b><small className={added ? 'up' : ''}>{added ? `+${added} today` : n === 1 ? 'card' : 'cards'}</small></span>
              </button>
              {i === 0 && <button className="link" onClick={onEvents}>{events.length > 1 ? `All ${events.length}` : 'Events'}</button>}
            </div>
          ))}

          <div className="wl-tabs full-bleed" role="tablist" aria-label="Watchlists">
            {lists.map((l) => (
              <button key={l.id} role="tab" aria-selected={list === l.id} className={list === l.id ? 'on' : ''} onClick={() => { setList(l.id); setOpenKey('') }}>
                {l.label}{l.id !== 'recent' && l.items.length > 0 && <em className={`num${l.id === 'due' ? ' due' : ''}`}>{l.items.length}</em>}
              </button>
            ))}
          </div>
          <div className="plain-list" role="tabpanel">
            {shown.items.length === 0 && <p className="wl-empty">{shown.empty}</p>}
            {shown.items.slice(0, ROWS).map((x, n) => row(x, n, list === 'recent'))}
            {shown.items.length > ROWS && (
              <button className="wl-more" onClick={shown.more}>See all {shown.items.length}<Icon name="chevron" size={16} /></button>
            )}
          </div>
          {then && (
            <>
              <h3 className="group band">Then: {then.label} <button className="link" onClick={() => { setList(then.id); setOpenKey('') }}>Show</button></h3>
              <div className="plain-list">{then.items.slice(0, room).map((x, n) => row(x, n, then.id === 'recent'))}</div>
            </>
          )}

        </>
      )}
    </>
  )
}
