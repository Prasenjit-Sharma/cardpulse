import { useState } from 'react'
import { download } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import Icon from './Icon'
import Picker from './Picker'
import { ALL_FIELDS, type CardRecord, type EventRec, type FieldKey } from '../lib/types'
import { overall, scoreCard, sumTallies, type CardScore } from '../lib/score'
import Check from './Check'

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
      <header className="bar-top"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button></header>
      <h1>Accuracy</h1>
      {events.length > 0 && (
        <div className="eventbar">
          <Picker title="Event" value={evId} onChange={setEvId} options={[{ value: '', label: 'All events' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
        </div>
      )}

      {scored.length === 0 ? (
        <p className="empty small">Open a few contacts and this page will show how well your cards were read.</p>
      ) : (
        <>
          <p className="muted">Based on {scored.length} {scored.length === 1 ? 'card' : 'cards'} you have opened.</p>
          <div className="stats">
            <div><b>{pct(overall(totals))}</b><span>Read right, no changes</span></div>
            <div><b>{unchanged} of {scored.length}</b><span>Cards needing no changes</span></div>
          </div>

          <h3 className="group">Most corrected</h3>
          {corrected.length === 0 ? (
            <p className="muted">Nothing has needed correcting.</p>
          ) : (
            <div className="stats">
              {corrected.map(({ f, n }) => <div key={f}><b>{n} {n === 1 ? 'card' : 'cards'}</b><span>{LABEL[f]}</span></div>)}
            </div>
          )}
        </>
      )}

      <h3 className="group">Export</h3>
      <Check checked={skipDupes} onChange={setSkipDupes}>Export duplicates once only ({[...dupes.keys()].filter((id) => done.some((c) => c.id === id)).length} cards flagged)</Check>
      <div className="actions">
        <button onClick={exportCsv} disabled={!done.length}>Export CSV</button>
        <button onClick={exportVcf} disabled={!done.length}>Export vCard (phone)</button>
      </div>
    </>
  )
}
