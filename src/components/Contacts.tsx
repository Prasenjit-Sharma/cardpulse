import { useState, type KeyboardEvent } from 'react'
import { signInWithGoogle } from '../lib/auth'
import { browserEnv, shareVcf, toVCard } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { attentionReasons, needsAttention } from '../lib/attention'
import { companyKey } from '../lib/companies'
import { hasAllTags, matchesQuery, searchTokens } from '../lib/search'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import CardThumb from './CardThumb'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Picker from './Picker'
import Sheet, { SheetItem } from './Sheet'
import WatchRow from './WatchRow'
import { confirmAsk } from './Dialog'
import { eventState, featuredEvents, showEvent } from '../lib/eventname'
import { currentFollowUp, localISO } from '../lib/followups'
import { rowFigure } from '../lib/watch'

type Sort = 'recent' | 'name' | 'company'
export type Flt = 'all' | 'priority' | 'attention' | 'followup'
interface Row { card: CardRecord; p: Contact; i: number; key: string }

const monthLabel = (t: number) => new Date(t).toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }).toUpperCase()

export default function Contacts({ onScan, cards: allCards, events, activeEvent, onSelectEvent, dupes, initialFilter, initialCompany, onOpen, onRetryFailed, onUpload, onMoveToEvent, onDeleteContacts, onTogglePriority, onPlans }: {
  onScan: () => void
  /** Plan & cards, from a card waiting for cards. */
  onPlans: () => void
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onSelectEvent: (id: string) => void
  dupes: Map<string, CardRecord[]>
  initialFilter?: Flt
  initialCompany?: string
  onOpen: (id: string, idx: number) => void
  onRetryFailed: () => void
  onUpload: (f: FileList) => void
  onMoveToEvent: (cardIds: string[], eventId: string) => void
  onDeleteContacts: (keys: string[]) => void
  onTogglePriority: (cardId: string, idx: number) => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [flt, setFlt] = useState<Flt>(initialFilter ?? 'all')
  const [tags, setTags] = useState<string[]>([])
  const [company, setCompany] = useState(initialCompany ?? '')
  const [sel, setSel] = useState<Set<string> | null>(null)
  const [openKey, setOpenKey] = useState('')
  const today = localISO()

  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  // two event tabs at most (live ones first, else the latest), the chosen one always among them; the rest behind More
  const tabEvents = featuredEvents(events, today, 2, activeEvent)
  const moreEvents = events.length > tabEvents.length
  const inEvent = activeEvent ? allCards.filter((c) => c.eventId === activeEvent) : allCards
  const failed = inEvent.filter((c) => c.status === 'error')
  const reading = inEvent.filter((c) => c.status === 'pending' || c.status === 'running')
  const tokens = searchTokens(query)
  // every tag on a read contact here, with how many carry it; most used first, and a chosen tag stays even at zero
  const tagCount = new Map<string, number>()
  for (const c of inEvent) if (c.status === 'done') for (const p of c.corrected ?? []) for (const t of new Set(p.tags ?? [])) tagCount.set(t, (tagCount.get(t) ?? 0) + 1)
  for (const t of tags) if (!tagCount.has(t)) tagCount.set(t, 0)
  const allTags = [...tagCount.keys()].sort((a, b) => tagCount.get(b)! - tagCount.get(a)! || a.localeCompare(b))
  const toggleTag = (t: string) => setTags((xs) => (xs.includes(t) ? xs.filter((x) => x !== t) : [...xs, t]))

  let rows: Row[] = inEvent
    .filter((c) => c.status === 'done')
    .flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i, key: `${c.id}:${i}` })))
    .filter((r) => matchesQuery(r.p, tokens, eventName(r.card.eventId)))
    .filter((r) => hasAllTags(r.p, tags))
    .filter((r) => !company || companyKey(r.p.company) === companyKey(company))
    .filter((r) => flt === 'all' || (flt === 'priority' ? !!r.p.priority : flt === 'attention' ? needsAttention(r.card, dupes.has(r.card.id)) : !!currentFollowUp(r.p)))
  if (sort === 'name') rows = [...rows].sort((a, b) => a.p.name.localeCompare(b.p.name))
  if (sort === 'company') rows = [...rows].sort((a, b) => a.p.company.localeCompare(b.p.company))

  const groups: { label: string; items: Row[] }[] = []
  if (sort === 'recent') {
    for (const r of rows) {
      const label = monthLabel(r.card.createdAt)
      const g = groups[groups.length - 1]
      if (g?.label === label) g.items.push(r); else groups.push({ label, items: [r] })
    }
  } else groups.push({ label: sort === 'name' ? 'A TO Z' : 'BY COMPANY', items: rows })

  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const chosen = rows.filter((r) => sel?.has(r.key))
  const exit = () => setSel(null)

  return (
    <div>
      <div className="page-top deep">
        <header className="page-head">
          <h1>Contacts <span className="count num">{rows.length}</span></h1>
          {rows.length > 0 && (sel ? <button className="link" onClick={exit}>Cancel</button> : <button className="link" onClick={() => { setOpenKey(''); setSel(new Set()) }}>Select</button>)}
        </header>

        {events.length > 0 && (
          <div className="wl-tabs full-bleed ev-tabs" role="tablist" aria-label="Events">
            <button role="tab" aria-selected={activeEvent === ''} className={activeEvent === '' ? 'on' : ''} onClick={() => onSelectEvent('')}>All</button>
            {tabEvents.map((e) => (
              <button key={e.id} role="tab" aria-selected={activeEvent === e.id} className={activeEvent === e.id ? 'on' : ''} onClick={() => onSelectEvent(e.id)} title={e.name}>
                {eventState(e, today) === 'live' && <i className="live-dot" aria-label="Live" />}{showEvent(e.name)}
              </button>
            ))}
            {moreEvents && (
              <Picker className="ev-more" title="Show event" label="More" value={activeEvent} onChange={onSelectEvent}
                options={featuredEvents(events, today, events.length).map((e) => ({ value: e.id, label: showEvent(e.name) }))} />
            )}
          </div>
        )}
      </div>

      <div className="searchbox">
        <Icon name="search" size={18} />
        <input type="search" aria-label="Search contacts" placeholder="Search name, city, notes" value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="upload-inline" aria-label="Import photos"><Icon name="upload" size={18} />
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      <div className="filters">
        <span className={`filter-ico${flt !== 'all' || tags.length || company || activeEvent ? ' on' : ''}`}><Icon name="filter" size={16} /></span>
        <Picker title="Show" value={flt} onChange={(v) => setFlt(v as Flt)}
          options={[{ value: 'all', label: 'Show all' }, { value: 'priority', label: 'Starred' }, { value: 'attention', label: 'Needs attention' }, { value: 'followup', label: 'Follow-ups' }]} />
        {allCards.length > 0 && <TagPicker tags={allTags} count={tagCount} chosen={tags} onToggle={toggleTag} onClear={() => setTags([])} />}
        <Picker title="Sort by" value={sort} onChange={(v) => setSort(v as Sort)}
          options={[{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }, { value: 'company', label: 'Company' }]} />
      </div>

      {company && (
        <div className="filters">
          <button className="chip on" onClick={() => setCompany('')} aria-label={`Remove company filter ${company}`}>{company} <Icon name="x" size={14} /></button>
        </div>
      )}

      {failed.length > 0 && <div className="note">{failed.length} card{failed.length > 1 ? 's' : ''} failed. <button className="link" onClick={onRetryFailed}>Retry all</button></div>}

      {reading.length > 0 && (
        <section>
          <h3 className="group band">Reading {reading.length} {reading.length === 1 ? 'card' : 'cards'}</h3>
          <div className="plain-list">
            {reading.map((c, i) => {
              // parked for cards or a sign-in: the whole row is the way out
              const act = c.waiting === 'cards' ? onPlans : c.waiting === 'sign_in' ? () => void signInWithGoogle() : undefined
              return (
              <div key={c.id} className={`contact-row reading${act ? ' parked' : ''}`} style={{ ['--i' as string]: i }}
                {...(act ? { role: 'button', tabIndex: 0, onClick: act, onKeyDown: (e: KeyboardEvent) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); act() } } } : {})}>
                <CardThumb blob={c.image} name="" />
                {c.waiting === 'offline'
                  ? <div className="grow"><strong>Waiting for signal</strong><span className="muted">Saved. Will be read when you are online</span></div>
                  : c.waiting === 'retry'
                    ? <div className="grow"><strong>Trying again shortly</strong><span className="muted">The reader was busy</span></div>
                  : c.waiting === 'cards'
                    ? <div className="grow"><strong>Waiting for cards</strong><span className="muted">Saved. Read once you add cards</span></div>
                  : c.waiting === 'sign_in'
                    ? <div className="grow"><strong>Waiting for sign-in</strong><span className="muted">Saved. Read once you sign in</span></div>
                    : <div className="grow"><strong>Reading…</strong><span className="dots"><i /><i /><i /></span></div>}
                {act && <Icon name="chevron" size={18} />}
              </div>
              )
            })}
          </div>
        </section>
      )}

      {allCards.length === 0 && (
        <EmptyState icon="users" title="No contacts yet" text="Scan a card, or lay several on a table and scan them in one shot."
          action={<button className="cta small" onClick={onScan}><Icon name="camera" size={18} /> Scan</button>} />
      )}
      {allCards.length > 0 && rows.length === 0 && <p className="empty small">Nothing matches.</p>}

      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.label}>
          <h3 className="group band">{g.label}<span className="num band-count">{g.items.length}</span></h3>
          <div className="plain-list">
            {g.items.map((r, i) => (
              <WatchRow key={r.key} card={r.card} p={r.p} i={i} figure={rowFigure(r.p, r.card.createdAt, today)}
                note={needsAttention(r.card, dupes.has(r.card.id)) ? attentionReasons(r.card, dupes.has(r.card.id))[0] : undefined}
                selecting={!!sel} selected={!!sel?.has(r.key)}
                open={openKey === r.key} onToggle={() => (sel ? toggle(r.key) : setOpenKey(openKey === r.key ? '' : r.key))}
                onOpen={() => onOpen(r.card.id, r.i)} onStar={() => onTogglePriority(r.card.id, r.i)} />
            ))}
          </div>
        </section>
      ))}

      {sel && (
        <div className="selbar">
          <span>{chosen.length} selected</span>
          <button className="link" onClick={() => setSel(new Set(rows.map((r) => r.key)))}>All</button>
<Picker className="pick onbar" title="Move to" label="Move to…" value="" disabled={!chosen.length}
            onChange={(v) => { onMoveToEvent([...new Set(chosen.map((r) => r.card.id))], v === '__none' ? '' : v); exit() }}
            options={[{ value: '__none', label: 'No event' }, ...events.map((e) => ({ value: e.id, label: showEvent(e.name) }))]} />
          <button disabled={!chosen.length} onClick={() => { void shareVcf('contacts.vcf', chosen.map((r) => toVCard(r.p, [eventName(r.card.eventId), r.p.note].filter(Boolean).join(' — '), currentNameFormat())).join('\r\n'), `${chosen.length} contacts`, undefined, browserEnv(), false); exit() }} aria-label="Save to phone"><Icon name="useradd" size={18} /></button>
          <button className="bad" disabled={!chosen.length} onClick={() => void confirmAsk({ title: `Delete ${chosen.length} ${chosen.length === 1 ? 'contact' : 'contacts'}?`, confirmLabel: 'Delete', danger: true }).then((ok) => { if (ok) { onDeleteContacts(chosen.map((r) => r.key)); exit() } })} aria-label="Delete"><Icon name="trash" size={18} /></button>
        </div>
      )}
    </div>
  )
}

/** Tags as one dropdown in the filters row: every tag in view with its count, several at once (a contact must carry all). */
function TagPicker({ tags, count, chosen, onToggle, onClear }: {
  tags: string[]; count: Map<string, number>; chosen: string[]; onToggle: (t: string) => void; onClear: () => void
}) {
  const [open, setOpen] = useState(false)
  const label = chosen.length === 0 ? 'Tags' : chosen.length === 1 ? chosen[0]! : `${chosen.length} tags`
  return (
    <>
      <button type="button" className={`pick${chosen.length ? ' on' : ''}`} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-label={`Tags: ${chosen.length ? chosen.join(', ') : 'any'}`}>
        <Icon name="tag" size={15} /><span className="pick-label">{label}</span><Icon name="chevron" size={14} />
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title="Filter by tag">
        {tags.length === 0
          ? <p className="sheet-empty">No tags yet. Open a contact and add one, like Customer or Hot lead, then filter by it here.</p>
          : <div role="menu" aria-label="Tags">{tags.map((t) => <SheetItem key={t} label={t} multi checked={chosen.includes(t)} figure={count.get(t)} onClick={() => onToggle(t)} />)}</div>}
        {tags.length > 1 && <p className="sheet-note">Pick several to see contacts that carry all of them.</p>}
        <div className="sheet-foot">
          <button className="tonal-key" onClick={onClear} disabled={!chosen.length}>Clear</button>
          <button className="tonal-key grow" onClick={() => setOpen(false)}>Done</button>
        </div>
      </Sheet>
    </>
  )
}
