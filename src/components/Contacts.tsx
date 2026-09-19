import { useState } from 'react'
import { browserEnv, shareVcf, toVCard } from '../lib/actions'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import CardThumb from './CardThumb'
import EmptyState from './EmptyState'
import Icon from './Icon'

type Sort = 'recent' | 'name' | 'company'
type Flt = 'all' | 'priority' | 'review' | 'dupes' | 'followup'
interface Row { card: CardRecord; p: Contact; i: number; key: string }

const monthLabel = (t: number) => new Date(t).toLocaleDateString(undefined, { month: 'short', year: 'numeric' }).toUpperCase()
const haystack = (p: Contact) => [p.name, p.title, p.company, p.address, p.note, ...(p.tags ?? []), ...p.phones, ...p.emails].join(' ').toLowerCase()

export default function Contacts({ onScan, cards: allCards, events, activeEvent, onSelectEvent, dupes, onOpen, onRetryFailed, onUpload, onMoveToEvent, onDeleteContacts }: {
  onScan: () => void
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onSelectEvent: (id: string) => void
  dupes: Map<string, CardRecord[]>
  onOpen: (id: string, idx: number) => void
  onRetryFailed: () => void
  onUpload: (f: FileList) => void
  onMoveToEvent: (cardIds: string[], eventId: string) => void
  onDeleteContacts: (keys: string[]) => void
}) {
  const [query, setQuery] = useState('')
  const [sort, setSort] = useState<Sort>('recent')
  const [flt, setFlt] = useState<Flt>('all')
  const [tag, setTag] = useState('')
  const [sel, setSel] = useState<Set<string> | null>(null)

  const inEvent = activeEvent ? allCards.filter((c) => c.eventId === activeEvent) : allCards
  const failed = inEvent.filter((c) => c.status === 'error')
  const q = query.trim().toLowerCase()
  const allTags = [...new Set(inEvent.flatMap((c) => (c.corrected ?? []).flatMap((p) => p.tags ?? [])))].sort()

  let rows: Row[] = inEvent
    .filter((c) => c.status === 'done')
    .flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i, key: `${c.id}:${i}` })))
    .filter((r) => !q || haystack(r.p).includes(q))
    .filter((r) => !tag || (r.p.tags ?? []).includes(tag))
    .filter((r) => flt === 'all' || (flt === 'priority' ? !!r.p.priority : flt === 'review' ? !r.card.reviewed : flt === 'dupes' ? dupes.has(r.card.id) : !!r.p.followUp))
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

  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const chosen = rows.filter((r) => sel?.has(r.key))
  const exit = () => setSel(null)

  return (
    <>
      <header className="page-head">
        <h1>Contacts</h1>
        {rows.length > 0 && (sel ? <button className="link" onClick={exit}>Cancel</button> : <button className="link" onClick={() => setSel(new Set())}>Select</button>)}
      </header>

      <div className="searchbox">
        <Icon name="search" size={18} />
        <input type="search" placeholder={`Search ${allCards.reduce((n, c) => n + (c.corrected?.length ?? 0), 0)} contacts`} value={query} onChange={(e) => setQuery(e.target.value)} />
        <label className="upload-inline" aria-label="Import photos"><Icon name="upload" size={18} />
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      <p className="filters-label">Filters</p>
      <div className="filters">
        <span className={`filter-ico${flt !== 'all' || tag || activeEvent ? ' on' : ''}`}><Icon name="filter" size={16} /></span>
        {allTags.length > 0 && (
          <select className="pill-select" value={tag} onChange={(e) => setTag(e.target.value)} aria-label="Tags">
            <option value="">Tags</option>{allTags.map((t) => <option key={t}>{t}</option>)}
          </select>
        )}
        <select className="pill-select" value={activeEvent} onChange={(e) => onSelectEvent(e.target.value)} aria-label="Event">
          <option value="">Events</option>{events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
        <select className="pill-select" value={flt} onChange={(e) => setFlt(e.target.value as Flt)} aria-label="Show">
          <option value="all">Show all</option><option value="priority">Priority</option><option value="review">Needs review</option><option value="dupes">Duplicates</option><option value="followup">Follow-ups</option>
        </select>
        <select className="pill-select" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="recent">Recent</option><option value="name">Name</option><option value="company">Company</option>
        </select>
      </div>

      {failed.length > 0 && <div className="note">{failed.length} card{failed.length > 1 ? 's' : ''} failed. <button className="link" onClick={onRetryFailed}>Retry all</button></div>}

      {allCards.length === 0 && (
        <EmptyState icon="users" title="No contacts yet" text="Scan a card, or lay several on a table and scan them in one shot."
          action={<button className="cta small" onClick={onScan}><Icon name="camera" size={18} /> Scan</button>} />
      )}
      {allCards.length > 0 && rows.length === 0 && <p className="empty small">Nothing matches.</p>}

      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.label}>
          <h3 className="group">{g.label}</h3>
          <div className="plain-list">
            {g.items.map((r) => (
              <div key={r.key} className="contact-row" onClick={() => (sel ? toggle(r.key) : onOpen(r.card.id, r.i))}>
                {sel && <span className={`check-dot${sel.has(r.key) ? ' on' : ''}`}>{sel.has(r.key) && <Icon name="check" size={14} />}</span>}
                <CardThumb blob={r.card.image} name={r.p.name} />
                <div className="grow">
                  <strong>{r.p.name || '(no name)'}{r.p.priority && <Icon name="star" size={13} />}</strong>
                  <span className="muted">{[r.p.company, r.p.title].filter(Boolean).join(' | ') || r.p.phones[0] || r.p.emails[0] || ''}</span>
                </div>
                {dupes.has(r.card.id) && <span className="tag-warn">duplicate?</span>}
                {!sel && <Icon name="chevron" size={18} />}
              </div>
            ))}
          </div>
        </section>
      ))}

      {sel && (
        <div className="selbar">
          <span>{chosen.length} selected</span>
          <button className="link" onClick={() => setSel(new Set(rows.map((r) => r.key)))}>All</button>
          <select value="" disabled={!chosen.length} onChange={(e) => { onMoveToEvent([...new Set(chosen.map((r) => r.card.id))], e.target.value === '__none' ? '' : e.target.value); exit() }} aria-label="Move to event">
            <option value="" disabled>Move to…</option><option value="__none">No event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button disabled={!chosen.length} onClick={() => { void shareVcf('contacts.vcf', chosen.map((r) => toVCard(r.p, [eventName(r.card.eventId), r.p.note].filter(Boolean).join(' — '))).join('\r\n'), `${chosen.length} contacts`, undefined, browserEnv(), false); exit() }} aria-label="Save to phone"><Icon name="download" size={18} /></button>
          <button className="bad" disabled={!chosen.length} onClick={() => { if (confirm(`Delete ${chosen.length} contact(s)?`)) { onDeleteContacts(chosen.map((r) => r.key)); exit() } }} aria-label="Delete"><Icon name="trash" size={18} /></button>
        </div>
      )}
    </>
  )
}
