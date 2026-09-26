import { useState } from 'react'
import { download } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import Icon from './Icon'
import Picker from './Picker'
import { ALL_FIELDS, type CardRecord, type EventRec, type FieldKey } from '../lib/types'
import { overall, scoreCard, sumTallies, type CardScore } from '../lib/score'
import Check from './Check'
import { showEvent } from '../lib/eventname'

const LABEL: Record<FieldKey, string> = {
  name: 'Name', title: 'Job title', company: 'Company', website: 'Website', address: 'Address', gstin: 'GSTIN',
  phones: 'Phone numbers', emails: 'Email addresses', social: 'Social links',
}
const pct = (n: number | null) => (n == null ? '–' : `${Math.round(n * 100)}%`)

/** How well cards were read, in plain terms. Model, token and timing detail belongs to the admin console, not here. */
export default function Report({ cards: allCards, events, dupes, onBack }: { cards: CardRecord[]; events: EventRec[]; dupes: Map<string, CardRecord[]>; onBack: () => void }) {
  const [evId, setEvId] = useState('')
  const cards = evId ? allCards.filter((c) => c.eventId === evId) : allCards
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const [skipDupes, setSkipDupes] = useState(false)
  const done = cards.filter((c) => c.status === 'done')
  // A card the user never changed counts as read right; only cards they have opened are counted.
  const scored = done.filter((c) => c.opened).map((c) => scoreCard(c)).filter((s): s is CardScore => !!s)
  const totals = sumTallies(scored)
  const unchanged = scored.filter((s) => ALL_FIELDS.every((f) => s.fields[f].fp === 0 && s.fields[f].fn === 0)).length
  const corrected = ALL_FIELDS
    .map((f) => ({ f, n: scored.filter((s) => s.fields[f].fp + s.fields[f].fn > 0).length }))
    .filter((x) => x.n > 0)
    .sort((a, b) => b.n - a.n)
    .slice(0, 4)

  // Keeping only the earliest of a group of duplicates means a re-scanned card is exported once.
  const keep = () => done.filter((c) => !skipDupes || !(dupes.get(c.id) ?? []).some((d) => d.createdAt < c.createdAt))
  const suffix = () => (evId ? '-' + fileSafe(eventName(evId)) : '')
  const exportVcf = () => download(`contacts${suffix()}.vcf`, buildVcf(keep(), eventName, currentNameFormat()), 'text/vcard')
  const exportCsv = () => download(`contacts${suffix()}.csv`, buildCsv(keep(), eventName), 'text/csv')

  return (
    <>
      <div className="page-top">
        <header className="page-head">
          <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Accuracy</h1></div>
          {events.length > 0 && (
            <Picker title="Event" value={evId} onChange={setEvId} options={[{ value: '', label: 'All events' }, ...events.map((e) => ({ value: e.id, label: showEvent(e.name) }))]} />
          )}
        </header>
        {scored.length > 0 && (
          <div className="figgrid" role="group" aria-label="Reading at a glance">
            <div><span>Read right</span><b className="num">{pct(overall(totals))}</b><small>fields, no changes</small></div>
            <div><span>Untouched</span><b className="num">{unchanged}</b><small>of {scored.length} cards</small></div>
            <div><span>Opened</span><b className="num">{scored.length}</b><small>{scored.length === 1 ? 'card counted' : 'cards counted'}</small></div>
          </div>
        )}
      </div>

      {scored.length === 0 ? (
        <p className="empty small">Open a few contacts and this page will show how well your cards were read.</p>
      ) : (
        <>
          <h3 className="group band">Most corrected</h3>
          <div className="plain-list">
            {corrected.length === 0 && <p className="wl-empty">Nothing has needed correcting.</p>}
            {corrected.map(({ f, n }) => (
              <div key={f} className="index-row static">
                <span className="grow"><strong>{LABEL[f]}</strong><span className="muted">Corrected after reading</span></span>
                <span className="fig"><b className="num">{n}</b><small>{n === 1 ? 'card' : 'cards'}</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="group band">Export{evId ? ` ${showEvent(eventName(evId))}` : ''}</h3>
      <div className="tools full-bleed" style={{ ['--cols' as string]: 2 }} role="group" aria-label="Export">
        <button onClick={exportCsv} disabled={!done.length}><span className="tool-well"><Icon name="file" size={20} /></span>Spreadsheet (CSV)</button>
        <button onClick={exportVcf} disabled={!done.length}><span className="tool-well"><Icon name="users" size={20} /></span>Phone contacts (vCard)</button>
      </div>
      <Check checked={skipDupes} onChange={setSkipDupes}>Export duplicates once only ({[...dupes.keys()].filter((id) => done.some((c) => c.id === id)).length} cards flagged)</Check>
    </>
  )
}
