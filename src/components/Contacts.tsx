import { useState } from 'react'
import { download, toVCard } from '../lib/actions'
import type { CardRecord, Contact, EventRec } from '../lib/types'
import { useObjectUrl } from '../lib/useObjectUrl'
import Avatar from './Avatar'
import Icon from './Icon'

type Sort = 'recent' | 'name' | 'company'
type Flt = 'all' | 'review' | 'dupes' | 'followup'
interface Row { card: CardRecord; p: Contact; i: number; key: string }

function Thumb({ blob, name }: { blob?: Blob; name: string }) {
  const url = useObjectUrl(blob)
  return url ? <img className="thumb" src={url} alt="" /> : <Avatar name={name} />
}

function dayLabel(t: number): string {
  const d = new Date(t)
  const days = Math.round((new Date().setHours(0, 0, 0, 0) - new Date(d).setHours(0, 0, 0, 0)) / 86_400_000)
  if (days === 0) return 'Today'
  if (days === 1) return 'Yesterday'
  return d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: d.getFullYear() === new Date().getFullYear() ? undefined : 'numeric' })
}

const haystack = (p: Contact) => [p.name, p.title, p.company, p.address, p.note, ...p.phones, ...p.emails].join(' ').toLowerCase()

export default function Contacts({ cards: allCards, events, activeEvent, onSelectEvent, onNewEvent, dupes, onOpen, onRetryFailed, onUpload, onMoveToEvent, onDeleteContacts }: {
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onSelectEvent: (id: string) => void
  onNewEvent: (name: string) => void
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
  const [showFilter, setShowFilter] = useState(false)
  const [sel, setSel] = useState<Set<string> | null>(null)

  const inEvent = activeEvent ? allCards.filter((c) => c.eventId === activeEvent) : allCards
  const q = query.trim().toLowerCase()
  const pending = inEvent.filter((c) => c.status === 'pending' || c.status === 'running')
  const failed = inEvent.filter((c) => c.status === 'error')

  let rows: Row[] = inEvent
    .filter((c) => c.status === 'done')
    .flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i, key: `${c.id}:${i}` })))
    .filter((r) => !q || haystack(r.p).includes(q))
    .filter((r) => flt === 'all' || (flt === 'review' ? !r.card.reviewed : flt === 'dupes' ? dupes.has(r.card.id) : !!r.p.followUp))
  if (sort === 'name') rows = [...rows].sort((a, b) => a.p.name.localeCompare(b.p.name))
  if (sort === 'company') rows = [...rows].sort((a, b) => a.p.company.localeCompare(b.p.company))

  const groups: { label: string; items: Row[] }[] = []
  if (sort === 'recent') {
    for (const r of rows) {
      const label = dayLabel(r.card.createdAt)
      const g = groups[groups.length - 1]
      if (g?.label === label) g.items.push(r); else groups.push({ label, items: [r] })
    }
  } else groups.push({ label: sort === 'name' ? 'A–Z' : 'By company', items: rows })

  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const toggle = (key: string) => setSel((s) => { const n = new Set(s); n.has(key) ? n.delete(key) : n.add(key); return n })
  const chosen = rows.filter((r) => sel?.has(r.key))
  const exit = () => setSel(null)

  return (
    <>
      <header className="page-head"><h1>Contacts</h1></header>

      <div className="searchrow">
        <div className="searchbox">
          <Icon name="search" size={18} />
          <input type="search" placeholder="Search contacts" value={query} onChange={(e) => setQuery(e.target.value)} />
        </div>
        <button className={`icon-btn${flt !== 'all' ? ' on' : ''}`} onClick={() => setShowFilter(!showFilter)} aria-label="Filter"><Icon name="filter" size={18} /></button>
        <label className="upload-btn icon-btn" aria-label="Upload photos"><Icon name="upload" size={18} />
          <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) onUpload(e.target.files); e.target.value = '' }} />
        </label>
      </div>

      {showFilter && (
        <div className="chips">
          {([['all', 'All'], ['review', 'Needs review'], ['dupes', 'Duplicates'], ['followup', 'Follow-ups']] as const).map(([id, label]) => (
            <button key={id} className={flt === id ? 'chip on' : 'chip'} onClick={() => setFlt(id)}>{label}</button>
          ))}
        </div>
      )}

      <div className="chips scroll">
        <select className="chip sortpill" value={sort} onChange={(e) => setSort(e.target.value as Sort)} aria-label="Sort by">
          <option value="recent">Sort: Recent</option>
          <option value="name">Sort: Name</option>
          <option value="company">Sort: Company</option>
        </select>
        <button className={activeEvent === '' ? 'chip on' : 'chip'} onClick={() => onSelectEvent('')}>All</button>
        {events.map((e) => <button key={e.id} className={activeEvent === e.id ? 'chip on' : 'chip'} onClick={() => onSelectEvent(e.id)}>{e.name}</button>)}
        <button className="chip" onClick={() => { const n = prompt('Event / group name'); if (n?.trim()) onNewEvent(n.trim()) }}><Icon name="plus" size={14} /> New</button>
      </div>

      <div className="countbar">
        <span className="muted">{rows.length} contact{rows.length === 1 ? '' : 's'}</span>
        {rows.length > 0 && (sel ? <button className="link" onClick={exit}>Cancel</button> : <button className="chip" onClick={() => setSel(new Set())}>Select</button>)}
      </div>

      {failed.length > 0 && <div className="note">{failed.length} card{failed.length > 1 ? 's' : ''} failed. <button className="link" onClick={onRetryFailed}>Retry all</button></div>}
      {pending.map((c) => (
        <div key={c.id} className="row skeleton" onClick={() => onOpen(c.id, 0)}>
          <Thumb blob={c.image} name="" />
          <div className="grow"><strong>{c.status === 'running' ? 'Reading…' : 'Queued'}</strong><span className="muted">Extracting contacts</span></div>
        </div>
      ))}
      {failed.map((c) => (
        <div key={c.id} className="row" onClick={() => onOpen(c.id, 0)}>
          <Thumb blob={c.image} name="" />
          <div className="grow"><strong className="bad">Couldn't read this card</strong><span className="muted">{c.error}</span></div>
        </div>
      ))}

      {allCards.length === 0 && <div className="empty"><h2>No contacts yet</h2><p>Tap the scan button below.</p></div>}
      {allCards.length > 0 && rows.length === 0 && pending.length + failed.length === 0 && <p className="empty small">Nothing matches.</p>}

      {groups.filter((g) => g.items.length).map((g) => (
        <section key={g.label}>
          <h3 className="group">{g.label}</h3>
          <div className="list">
            {g.items.map((r) => (
              <div key={r.key} className="row" onClick={() => (sel ? toggle(r.key) : onOpen(r.card.id, r.i))}>
                {sel && <span className={`check-dot${sel.has(r.key) ? ' on' : ''}`}>{sel.has(r.key) && <Icon name="check" size={14} />}</span>}
                <Thumb blob={r.card.image} name={r.p.name} />
                <div className="grow">
                  <strong>{r.p.name || '(no name)'}</strong>
                  <span className="muted">{[r.p.title, r.p.company].filter(Boolean).join(', ') || r.p.phones[0] || r.p.emails[0] || ''}</span>
                </div>
                <span className="tags">
                  {dupes.has(r.card.id) && <em className="warn">duplicate?</em>}
                  {r.card.reviewed && <em className="ok"><Icon name="check" size={12} /></em>}
                </span>
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
            <option value="" disabled>Move to…</option>
            <option value="__none">No event</option>
            {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
          </select>
          <button disabled={!chosen.length} onClick={() => { download('contacts.vcf', chosen.map((r) => toVCard(r.p, [eventName(r.card.eventId), r.p.note].filter(Boolean).join(' — '))).join('\r\n'), 'text/vcard'); exit() }} aria-label="Save to phone"><Icon name="download" size={18} /></button>
          <button className="bad" disabled={!chosen.length} onClick={() => { if (confirm(`Delete ${chosen.length} contact(s)?`)) { onDeleteContacts(chosen.map((r) => r.key)); exit() } }} aria-label="Delete"><Icon name="trash" size={18} /></button>
        </div>
      )}
    </>
  )
}
