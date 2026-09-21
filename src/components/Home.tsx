import { useState } from 'react'
import { needsAttention } from '../lib/attention'
import { matchesQuery, searchTokens } from '../lib/search'
import { overall, scoreCard, sumTallies } from '../lib/score'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import CardThumb from './CardThumb'
import Picker from './Picker'
import StarButton from './StarButton'
import Icon from './Icon'

interface Install { mode: 'native' | 'ios' | null; visible: boolean; install: () => void; dismiss: () => void }


const startOfToday = () => new Date().setHours(0, 0, 0, 0)
const isoToday = () => new Date().toISOString().slice(0, 10)
interface Person { card: CardRecord; p: Contact; i: number }

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

export default function Home({ cards, events, activeEvent, onSelectEvent, dupes, ready, needsKey, install, onOpen, onOpenContact, onContacts, onAttention, onInsights, onAccuracy, onSetup, onRetry, onTogglePriority }: {
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onSelectEvent: (id: string) => void
  dupes: Map<string, CardRecord[]>
  ready: boolean
  needsKey: boolean
  install: Install
  onOpen: (id: string, review: boolean) => void
  onOpenContact: (id: string, idx: number) => void
  onContacts: () => void
  onAttention: () => void
  onInsights: () => void
  onAccuracy: () => void
  onSetup: () => void
  onRetry: (id: string) => void
  onTogglePriority: (cardId: string, idx: number) => void
}) {
  const [query, setQuery] = useState('')
  const people: Person[] = cards.filter((c) => c.status === 'done').flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i })))
  const tokens = searchTokens(query)
  const searching = tokens.length > 0
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const found = searching ? people.filter((x) => matchesQuery(x.p, tokens, eventName(x.card.eventId))) : []

  const due = people.filter((x) => x.p.followUp && x.p.followUp <= isoToday())
  const upcoming = people.filter((x) => x.p.followUp && x.p.followUp > isoToday()).sort((a, b) => a.p.followUp!.localeCompare(b.p.followUp!))
  const toCheck = cards.filter((c) => needsAttention(c, dupes.has(c.id))).length
  const acc = overall(sumTallies(cards.filter((c) => c.opened).map(scoreCard).filter((x): x is NonNullable<typeof x> => !!x)))
  const recent = cards.filter((c) => Date.now() - c.createdAt < 30 * 86_400_000)
  const t0 = startOfToday()
  const todayCards = cards.filter((c) => c.createdAt >= t0)
  const filed = recent.filter((c) => c.createdAt < t0).slice(0, 5)

  const row = (c: CardRecord, i: number) => {
    const names = (c.corrected ?? []).map((p) => p.name).filter(Boolean)
    const isNew = Date.now() - c.createdAt < 10 * 60_000 && !c.opened
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

  const personRow = ({ card, p, i }: Person, n: number) => (
    <div key={`${card.id}:${i}`} className="contact-row" style={{ ['--i' as string]: n }} onClick={() => onOpenContact(card.id, i)}>
      <CardThumb blob={card.image} name={p.name} />
      <div className="grow">
        <strong>{p.name || '(no name)'}</strong>
        <span className="muted">{[p.company, p.title].filter(Boolean).join(' | ') || p.phones[0] || p.emails[0] || ''}</span>
      </div>
      <StarButton on={!!p.priority} onToggle={() => onTogglePriority(card.id, i)} />
      <Icon name="chevron" size={18} />
    </div>
  )

  return (
    <>
      <header className="album-head">
        <span className="wordmark">CardPulse</span>
        <span className="tally num">{cards.length === 0 ? 'new album' : todayCards.length > 0 ? <><b>{todayCards.length}</b> today</> : <><b>{people.length}</b> filed</>}</span>
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

      {cards.length > 0 && (
        <>
          <div className="searchbox">
            <Icon name="search" size={18} />
            <input type="search" placeholder={`Search ${people.length} contacts: name, city, notes…`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search contacts" />
            {query && <button className="icon-btn ghost small" onClick={() => setQuery('')} aria-label="Clear search"><Icon name="x" size={16} /></button>}
          </div>
          {events.length > 0 && !searching && (
            <Picker className="event-pick" title="Scan into" icon="booth" value={activeEvent} onChange={onSelectEvent}
              options={[{ value: '', label: 'No event', hint: 'Cards are not filed under anything' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
          )}
        </>
      )}

      {cards.length === 0 ? (
        <div className="empty-scan">
          <EmptySleeves />
          <h2>The album is empty</h2>
          <p>Scan a card and it is seated in the first sleeve, with everything on it read and filed.</p>
        </div>
      ) : searching ? (
        <section>
          <h3 className="group">{found.length} {found.length === 1 ? 'contact' : 'contacts'}</h3>
          {found.length > 0
            ? <div className="plain-list">{found.map(personRow)}</div>
            : <p className="empty small">Nothing matches. Try fewer words.</p>}
        </section>
      ) : (
        <>
          <div className="stats2 home-stats">
            <button className={due.length ? 'warm' : ''} onClick={onInsights}><span>Follow-ups due</span><b className="num">{due.length}</b></button>
            <button className={toCheck ? 'warm' : ''} onClick={onAttention}><span>Needs attention</span><b className="num">{toCheck}</b></button>
            <button onClick={onAccuracy}><span>Accuracy</span><b className="num">{acc == null ? '–' : `${Math.round(acc * 100)}%`}</b></button>
          </div>

          {due.length + upcoming.length > 0 && (
            <section>
              <h3 className="group">Follow-ups <button className="link" onClick={onInsights}>See all</button></h3>
              <div className="plain-list">
                {[...due, ...upcoming].slice(0, 3).map((x, n) => (
                  <div key={`${x.card.id}:${x.i}`} className="contact-row" style={{ ['--i' as string]: n }} onClick={() => onOpenContact(x.card.id, x.i)}>
                    <CardThumb blob={x.card.image} name={x.p.name} />
                    <div className="grow"><strong>{x.p.name}</strong><span className="muted">{x.p.company}</span></div>
                    <em className={`due${x.p.followUp! <= isoToday() ? ' warn' : ''}`}>{x.p.followUp}</em>
                  </div>
                ))}
              </div>
            </section>
          )}

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
    </>
  )
}
