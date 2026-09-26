import { useState } from 'react'
import { localISO } from '../lib/followups'
import { dueFigure, rowFigure } from '../lib/watch'
import type { CardRecord } from '../lib/types'
import Icon from './Icon'
import WatchRow from './WatchRow'

const today = () => localISO()                            // the phone's own day, not UTC

export default function Insights({ cards, onBack, onContacts, onAccuracy, onOpen }: {
  cards: CardRecord[]
  onBack: () => void
  onContacts: () => void
  onAccuracy: () => void
  onOpen: (id: string, idx: number) => void
}) {
  const people = cards.filter((c) => c.status === 'done').flatMap((c) => (c.corrected ?? []).map((p, i) => ({ c, p, i })))
  const byCompany = new Map<string, { name: string; n: number }>()
  for (const { p } of people) {
    const key = p.company.trim().toLowerCase()
    if (!key) continue
    const cur = byCompany.get(key) ?? { name: p.company.trim(), n: 0 }
    cur.n++
    byCompany.set(key, cur)
  }
  const top = [...byCompany.values()].sort((a, b) => b.n - a.n).slice(0, 5)
  const due = people.filter((x) => x.p.followUp && x.p.followUp <= today())
  const upcoming = people.filter((x) => x.p.followUp && x.p.followUp > today()).sort((a, b) => a.p.followUp!.localeCompare(b.p.followUp!)).slice(0, 4)
  const priority = people.filter((x) => x.p.priority).length
  const noFollow = people.filter((x) => !x.p.followUp).length

  const insight = people.length === 0
    ? 'Scan a few cards and this page will start telling you who to talk to next.'
    : due.length
      ? `${due.length} follow-up${due.length > 1 ? 's are' : ' is'} due. A quick message today keeps the conversation warm.`
      : noFollow
        ? `${noFollow} contact${noFollow > 1 ? 's have' : ' has'} no follow-up date yet.`
        : 'You are all caught up. Nothing is waiting on you.'

  const [openKey, setOpenKey] = useState('')
  const t = today()

  return (
    <>
      <div className="page-top">
        <header className="page-head">
          <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Insights</h1></div>
        </header>
        <div className="figgrid" style={{ ['--cols' as string]: 4 }} role="group" aria-label="Your contacts at a glance">
          <div><span>Contacts</span><b className="num">{people.length}</b></div>
          <div><span>Companies</span><b className="num">{byCompany.size}</b></div>
          <div className={due.length ? 'due' : ''}><span>Due</span><b className="num">{due.length}</b></div>
          <div><span>Starred</span><b className="num">{priority}</b></div>
        </div>
      </div>

      <div className="plain-list">
        <div className="index-row static">
          <span className="tool-well"><Icon name="spark" size={18} /></span>
          <span className="grow"><strong>What needs you</strong><span className="muted wrap">{insight}</span></span>
          {people.length > 0 && <button className="link" onClick={onContacts}>Open</button>}
        </div>
      </div>

      {upcoming.length + due.length > 0 && (
        <>
          <h3 className="group band">Follow-ups</h3>
          <div className="plain-list">
            {[...due, ...upcoming].slice(0, 5).map(({ c, p, i }, n) => {
              const key = `${c.id}:${i}`
              return (
                <WatchRow key={key} card={c} p={p} i={n} figure={dueFigure(p.followUp, t) ?? rowFigure(p, c.createdAt, t)}
                  open={openKey === key} onToggle={() => setOpenKey(openKey === key ? '' : key)} onOpen={() => onOpen(c.id, i)} />
              )
            })}
          </div>
        </>
      )}

      {top.length > 0 && (
        <>
          <h3 className="group band">Top companies</h3>
          <div className="plain-list">
            {top.map((co) => (
              <div key={co.name} className="index-row static">
                <span className="grow"><strong>{co.name}</strong></span>
                <span className="fig"><b className="num">{co.n}</b><small>{co.n === 1 ? 'person' : 'people'}</small></span>
              </div>
            ))}
          </div>
        </>
      )}

      <h3 className="group band">Reading</h3>
      <div className="plain-list">
        <button className="index-row" onClick={onAccuracy}>
          <span className="tool-well"><Icon name="chart" size={18} /></span>
          <span className="grow"><strong>Accuracy</strong><span className="muted">How well cards are read</span></span>
          <Icon name="chevron" size={18} />
        </button>
      </div>
    </>
  )
}
