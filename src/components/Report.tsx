import { useState } from 'react'
import { download } from '../lib/actions'
import { buildCsv, buildVcf, fileSafe } from '../lib/export'
import Icon from './Icon'
import { ALL_FIELDS, type CardRecord, type EventRec } from '../lib/types'
import { accuracy, overall, scoreCard, sumTallies, type CardScore } from '../lib/score'

const pct = (n: number | null) => (n == null ? '–' : `${(n * 100).toFixed(1)}%`)

export default function Report({ cards: allCards, events, dupes, onBack }: { cards: CardRecord[]; events: EventRec[]; dupes: Map<string, CardRecord[]>; onBack: () => void }) {
  const [evId, setEvId] = useState('')
  const cards = evId ? allCards.filter((c) => c.eventId === evId) : allCards
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const [skipDupes, setSkipDupes] = useState(false)
  const done = cards.filter((c) => c.status === 'done')
  const reviewed = done.filter((c) => c.reviewed)
  const scored = reviewed.map((c) => ({ c, s: scoreCard(c) })).filter((x): x is { c: CardRecord; s: CardScore } => !!x.s)
  const totals = sumTallies(scored.map((x) => x.s))
  const countOk = scored.filter((x) => x.s.contactCountOk).length
  const multi = scored.filter((x) => x.s.trueCount > 1)
  const multiOk = multi.filter((x) => x.s.contactCountOk).length
  const perfect = scored.filter((x) => ALL_FIELDS.every((f) => x.s.fields[f].fp === 0 && x.s.fields[f].fn === 0)).length
  const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0)
  const latency = avg(done.map((c) => c.latencyMs ?? 0).filter(Boolean))

  // Keeping only the earliest of a group of duplicates means a re-scanned card is exported once.
  const keep = () => done.filter((c) => !skipDupes || !(dupes.get(c.id) ?? []).some((d) => d.createdAt < c.createdAt))
  const suffix = () => (evId ? '-' + fileSafe(eventName(evId)) : '')
  const exportVcf = () => download(`contacts${suffix()}.vcf`, buildVcf(keep(), eventName), 'text/vcard')
  const exportCsv = () => download(`contacts${suffix()}.csv`, buildCsv(keep(), eventName), 'text/csv')
  const exportJson = () => {
    const data = done.map(({ image: _image, ...rest }) => rest)
    download('cardpulse-results.json', JSON.stringify(data, null, 2), 'application/json')
  }

  return (
    <>
      <header className="bar-top"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button></header>
      <h1>Accuracy lab</h1>
      <div className="eventbar">
        <select value={evId} onChange={(e) => setEvId(e.target.value)} aria-label="Event">
          <option value="">All events</option>
          {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
        </select>
      </div>
      <p className="muted">
        {done.length} cards read · {reviewed.length} reviewed. Scores use only reviewed cards — open a card, fix mistakes, tap “Mark as reviewed”.
      </p>

      {scored.length === 0 ? (
        <p className="empty">No reviewed cards yet.</p>
      ) : (
        <>
          <div className="stats">
            <div><b>{pct(overall(totals))}</b><span>Field accuracy</span></div>
            <div><b>{pct(perfect / scored.length)}</b><span>Cards fully perfect</span></div>
            <div><b>{pct(countOk / scored.length)}</b><span>Right # of people</span></div>
            <div><b>{multi.length ? pct(multiOk / multi.length) : '–'}</b><span>Multi-contact cards ({multi.length})</span></div>
          </div>

          <table>
            <thead><tr><th>Field</th><th>Accuracy</th><th title="Model values you kept">✓</th><th title="Model values you removed or changed">Wrong</th><th title="Values you had to add">Missed</th></tr></thead>
            <tbody>
              {ALL_FIELDS.map((f) => (
                <tr key={f}><td>{f}</td><td>{pct(accuracy(totals[f]))}</td><td>{totals[f].tp}</td><td>{totals[f].fp}</td><td>{totals[f].fn}</td></tr>
              ))}
            </tbody>
          </table>
          <p className="hint">Accuracy = kept ÷ (kept + wrong + missed), per field value. A phone number written with a different format but the same digits counts as correct.</p>
        </>
      )}

      <div className="stats">
        <div><b>{latency ? `${(latency / 1000).toFixed(1)}s` : '–'}</b><span>Avg time / card</span></div>
        <div><b>{Math.round(avg(done.map((c) => c.tokensIn ?? 0)))}</b><span>Avg input tokens</span></div>
        <div><b>{Math.round(avg(done.map((c) => c.tokensOut ?? 0)))}</b><span>Avg output tokens</span></div>
      </div>

      <label className="check"><input type="checkbox" checked={skipDupes} onChange={(e) => setSkipDupes(e.target.checked)} /> Export duplicates once only ({[...dupes.keys()].filter((id) => done.some((c) => c.id === id)).length} cards flagged)</label>
      <div className="actions">
        <button onClick={exportCsv} disabled={!done.length}>Export CSV</button>
        <button onClick={exportVcf} disabled={!done.length}>Export vCard (phone)</button>
        <button onClick={exportJson} disabled={!done.length}>Results JSON</button>
      </div>
    </>
  )
}
