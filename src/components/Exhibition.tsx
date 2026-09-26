import { useState } from 'react'
import { download } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import type { CardRecord, EventRec } from '../lib/types'
import EmptyState from './EmptyState'
import Icon from './Icon'
import Sheet, { SheetItem } from './Sheet'
import { eventState, eventWhen, featuredEvents, showEvent } from '../lib/eventname'
import { rowFigure, shortDate } from '../lib/watch'
import { localISO } from '../lib/followups'
import WatchRow from './WatchRow'

export default function Exhibition({ cards, events, activeEvent, onNew, onEdit, onDelete, onScanHere, onView, onOpenContact, onTogglePriority }: {
  cards: CardRecord[]
  events: EventRec[]
  activeEvent: string
  onNew: () => void
  onEdit: (id: string) => void
  onDelete: (id: string) => void
  onScanHere: (id: string) => void
  onView: (id: string) => void
  onOpenContact: (id: string, idx: number) => void
  onTogglePriority: (id: string, idx: number) => void
}) {
  const [menu, setMenu] = useState('')
  const [openKey, setOpenKey] = useState('')
  const today = localISO()
  // live first, then the next to start, then the most recent
  const ordered = featuredEvents(events, today, events.length)
  // the event taking scans (or the one leading the list): its latest people, so the tab shows the haul, not just totals
  const focus = events.find((e) => e.id === activeEvent) ?? ordered[0]
  const latest = focus ? cards.filter((c) => c.eventId === focus.id && c.status === 'done').sort((a, b) => b.createdAt - a.createdAt)
    .flatMap((c) => (c.corrected ?? []).map((p, i) => ({ card: c, p, i, key: `${c.id}:${i}` }))).slice(0, 6) : []
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  return (
    <>
      <header className="page-head">
        <h1>Events {events.length > 0 && <span className="count num">{events.length}</span>}</h1>
        <button className="icon-btn ghost" onClick={onNew} aria-label="New event"><Icon name="plus" size={20} /></button>
      </header>

      {events.length === 0 && (
        <EmptyState icon="booth" title="No events yet" text="Trade shows, meetings, anywhere you collect cards. Create one, then scan into it."
          action={<button className="cta small" onClick={onNew}><Icon name="plus" size={18} /> New event</button>} />
      )}

      {events.length > 0 && <h3 className="group band">Live and upcoming first<span className="num band-count">Cards</span></h3>}
      <div className="plain-list">
        {ordered.map((e, i) => {
          const mine = cards.filter((c) => c.eventId === e.id)
          const done = mine.filter((c) => c.status === 'done')
          const people = done.flatMap((c) => c.corrected ?? [])
          const companies = new Set(people.map((p) => p.company.trim().toLowerCase()).filter(Boolean)).size
          const starred = people.filter((p) => p.priority).length
          const busy = mine.filter((c) => c.status === 'pending' || c.status === 'running').length
          const state = eventState(e, today)
          // an undated event is live while it takes the scans, as before dates existed
          const live = state === 'live' || (state === 'undated' && activeEvent === e.id)
          const facts = [eventWhen(e, today, (t) => shortDate(t)), `${people.length} ${people.length === 1 ? 'person' : 'people'}`, `${companies} ${companies === 1 ? 'co.' : 'cos.'}`, starred ? `${starred} starred` : '', busy ? `reading ${busy}` : ''].filter(Boolean).join(' · ')
          return (
            <div key={e.id} className={`event-row${live ? ' live' : ''}${state === 'past' ? ' past' : ''}`} style={{ ['--i' as string]: i }}>
              <button className="event-main" onClick={() => onView(e.id)}>
                <span className="grow">
                  <strong>{live && <em className="live-tag">Live</em>}{showEvent(e.name)}</strong>
                  <span className="muted">{facts}</span>
                </span>
                <span className="fig"><b className="num">{mine.length}</b><small>{mine.length === 1 ? 'card' : 'cards'}</small></span>
              </button>
              <button className="icon-btn" onClick={() => onScanHere(e.id)} aria-label={`Scan into ${showEvent(e.name)}`} title="Scan into this event"><Icon name="camera" size={18} /></button>
              <button className="icon-btn ghost" onClick={() => setMenu(e.id)} aria-label="Event options"><Icon name="more" /></button>
              <Sheet open={menu === e.id} onClose={() => setMenu('')} title={showEvent(e.name)}>
                <SheetItem icon="file" label="Export CSV" disabled={!done.length} onClick={() => { setMenu(''); download(`${fileSafe(e.name)}.csv`, buildCsv(done, eventName), 'text/csv') }} />
                <SheetItem icon="download" label="Export vCard" disabled={!done.length} onClick={() => { setMenu(''); download(`${fileSafe(e.name)}.vcf`, buildVcf(done, eventName, currentNameFormat()), 'text/vcard') }} />
                <SheetItem icon="edit" label="Edit name and dates" onClick={() => { setMenu(''); onEdit(e.id) }} />
                <SheetItem icon="trash" danger label="Delete event" onClick={() => { setMenu(''); onDelete(e.id) }} />
              </Sheet>
            </div>
          )
        })}
      </div>

      {focus && latest.length > 0 && (
        <>
          <h3 className="group band">Latest from {showEvent(focus.name)} <button className="link" onClick={() => onView(focus.id)}>All</button></h3>
          <div className="plain-list">
            {latest.map((x, n) => (
              <WatchRow key={x.key} card={x.card} p={x.p} i={n} figure={rowFigure(x.p, x.card.createdAt, today)}
                open={openKey === x.key} onToggle={() => setOpenKey(openKey === x.key ? '' : x.key)}
                onOpen={() => onOpenContact(x.card.id, x.i)} onStar={() => onTogglePriority(x.card.id, x.i)} />
            ))}
          </div>
        </>
      )}
    </>
  )
}
