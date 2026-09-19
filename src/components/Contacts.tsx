import { useState } from 'react'
import { browserEnv, shareVcf, toVCard } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import CardThumb from './CardThumb'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Picker from './Picker'

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
  const reading = inEvent.filter((c) => c.status === 'pending' || c.status === 'running')
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
    <div>
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
          <Picker title="Tag" label={tag || 'Tags'} value={tag} onChange={setTag}
            options={[{ value: '', label: 'All tags' }, ...allTags.map((t) => ({ value: t, label: t }))]} />
        )}
        <Picker title="Show" value={flt} onChange={(v) => setFlt(v as Flt)}
          options={[{ value: 'all', label: 'Show all' }, { value: 'priority', label: 'Priority' }, { value: 'review', label: 'Needs review' }, { value: 'dupes', label: 'Possible duplicates' }, { value: 'followup', label: 'Follow-ups' }]} />
        <Picker title="Sort by" value={sort} onChange={(v) => setSort(v as Sort)}
          options={[{ value: 'recent', label: 'Recent' }, { value: 'name', label: 'Name' }, { value: 'company', label: 'Company' }]} />
      </div>

      {events.length > 0 && (
        <>
          <div className="tab-strip" role="group" aria-label="Event dividers">
            <button className={activeEvent === '' ? 'on' : ''} onClick={() => onSelectEvent('')} aria-current={activeEvent === '' ? 'true' : undefined}>All</button>
            {events.map((e) => (
              <button key={e.id} className={activeEvent === e.id ? 'on' : ''} onClick={() => onSelectEvent(e.id)} aria-current={activeEvent === e.id ? 'true' : undefined} title={e.name}>{e.name}</button>
            ))}
          </div>
          <div className="tab-sheet" />
        </>
      )}

      {failed.length > 0 && <div className="note">{failed.length} card{failed.length > 1 ? 's' : ''} failed. <button className="link" onClick={onRetryFailed}>Retry all</button></div>}

      {reading.length > 0 && (
        <section>
          <h3 className="group">Reading {reading.length} {reading.length === 1 ? 'card' : 'cards'}</h3>
          <div className="plain-list">
            {reading.map((c, i) => (
              <div key={c.id} className="contact-row reading" style={{ ['--i' as string]: i }}>
                <CardThumb blob={c.image} name="" />
                <div className="grow"><strong>Reading…</strong><span className="dots"><i /><i /><i /></span></div>
              </div>
            ))}
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
          <h3 className="group">{g.label}</h3>
          <div className="plain-list">
            {g.items.map((r, i) => (
              <div key={r.key} className="contact-row" style={{ ['--i' as string]: i }} onClick={() => (sel ? toggle(r.key) : onOpen(r.card.id, r.i))}>
                {sel && <span className={`check-dot${sel.has(r.key) ? ' on' : ''}`}>{sel.has(r.key) && <Icon name="check" size={14} />}</span>}
                <CardThumb blob={r.card.image} name={r.p.name} />
                <div className="grow">
                  <strong>{r.p.name || '(no name)'}{r.p.priority && <Icon name="star" size={13} />}</strong>
                  <span className="muted">{[r.p.company, r.p.title].filter(Boolean).join(' | ') || r.p.phones[0] || r.p.emails[0] || ''}</span>
                  {dupes.has(r.card.id) && <span className="dup-note">Possible duplicate</span>}
                </div>
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
<Picker className="pick onbar" title="Move to" label="Move to…" value="" disabled={!chosen.length}
            onChange={(v) => { onMoveToEvent([...new Set(chosen.map((r) => r.card.id))], v === '__none' ? '' : v); exit() }}
            options={[{ value: '__none', label: 'No event' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
          <button disabled={!chosen.length} onClick={() => { void shareVcf('contacts.vcf', chosen.map((r) => toVCard(r.p, [eventName(r.card.eventId), r.p.note].filter(Boolean).join(' — '), currentNameFormat())).join('\r\n'), `${chosen.length} contacts`, undefined, browserEnv(), false); exit() }} aria-label="Save to phone"><Icon name="download" size={18} /></button>
          <button className="bad" disabled={!chosen.length} onClick={() => { if (confirm(`Delete ${chosen.length} contact(s)?`)) { onDeleteContacts(chosen.map((r) => r.key)); exit() } }} aria-label="Delete"><Icon name="trash" size={18} /></button>
        </div>
      )}
    </div>
  )
}
