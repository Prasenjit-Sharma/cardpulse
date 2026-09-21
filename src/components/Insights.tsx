import type { CardRecord } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

const today = () => new Date().toISOString().slice(0, 10)

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

  return (
    <>
      <header className="page-head">
        <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Insights</h1></div>
      </header>

      <div className="stats2">
        <div><Icon name="users" size={18} /><b className="num">{people.length}</b><span>Contacts</span></div>
        <div><Icon name="building" size={18} /><b className="num">{byCompany.size}</b><span>{byCompany.size === 1 ? 'Company' : 'Companies'}</span></div>
        <div className={due.length ? 'warm' : ''}><Icon name="calendar" size={18} /><b className="num">{due.length}</b><span>Follow-ups due</span></div>
        <div><Icon name="star" size={18} /><b className="num">{priority}</b><span>Priority</span></div>
      </div>

      <section className="card insight">
        <span className="insight-icon"><Icon name="spark" size={18} /></span>
        <div className="grow"><strong>What needs you</strong><p>{insight}</p></div>
        {people.length > 0 && <button className="link" onClick={onContacts}>Open</button>}
      </section>

      {upcoming.length + due.length > 0 && (
        <section>
          <h3 className="group">Follow-ups</h3>
          <div className="list">
            {[...due, ...upcoming].slice(0, 5).map(({ c, p, i }) => (
              <div key={`${c.id}:${i}`} className="row" onClick={() => onOpen(c.id, i)}>
                <Avatar name={p.name} />
                <div className="grow"><strong>{p.name}</strong><span className="muted">{[p.title, p.company].filter(Boolean).join(' · ')}</span></div>
                <span className="tags"><em className={p.followUp! <= today() ? 'warn' : ''}>{p.followUp}</em></span>
              </div>
            ))}
          </div>
        </section>
      )}

      {top.length > 0 && (
        <section>
          <h3 className="group">Top companies</h3>
          <div className="list">
            {top.map((t) => (
              <div key={t.name} className="row static">
                <Avatar name={t.name} />
                <div className="grow"><strong>{t.name}</strong><span className="muted">{t.n} {t.n === 1 ? 'person' : 'people'}</span></div>
              </div>
            ))}
          </div>
        </section>
      )}

      <button className="menu-row" onClick={onAccuracy}><Icon name="chart" /><span className="grow"><strong>Accuracy</strong><small>How well cards are read</small></span><Icon name="back" size={16} /></button>
    </>
  )
}
