import { useEffect, useRef, useState } from 'react'
import { companyList } from '../lib/companies'
import type { CardRecord } from '../lib/types'
import Avatar from './Avatar'
import Icon from './Icon'

/** Every company with how many people work there. Tapping one opens Contacts filtered to it. */
export default function Companies({ cards, onBack, onOpenCompany }: { cards: CardRecord[]; onBack: () => void; onOpenCompany: (name: string) => void }) {
  const [searching, setSearching] = useState(false)
  const [query, setQuery] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => { if (searching) input.current?.focus() }, [searching])

  const all = companyList(cards)
  const q = query.trim().toLowerCase()
  const shown = q ? all.filter((c) => c.name.toLowerCase().includes(q)) : all
  const top = q ? [] : all.filter((c) => c.n > 1).slice(0, 5)
  const alphabetical = [...shown].sort((a, b) => a.name.localeCompare(b.name))

  const row = (c: { key: string; name: string; n: number }) => (
    <button key={c.key} className="row company-row" onClick={() => onOpenCompany(c.name)}>
      <Avatar name={c.name} />
      <span className="grow"><strong>{c.name}</strong></span>
      <span className="count num">{c.n}</span>
      <Icon name="chevron" size={18} />
    </button>
  )

  return (
    <>
      <div className="page-top">
        <header className="page-head">
          <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Companies</h1></div>
          <button className={`icon-btn ghost${searching ? ' on' : ''}`} onClick={() => { setSearching(!searching); if (searching) setQuery('') }} aria-label={searching ? 'Close search' : 'Search companies'} aria-pressed={searching}><Icon name="search" size={20} /></button>
        </header>
        {all.length > 0 && (
          <div className="figgrid" role="group" aria-label="Companies at a glance">
            <div><span>Companies</span><b className="num">{all.length}</b></div>
            <div><span>2+ people</span><b className="num">{all.filter((c) => c.n > 1).length}</b></div>
            <div><span>People</span><b className="num">{all.reduce((n, c) => n + c.n, 0)}</b></div>
          </div>
        )}
      </div>

      {searching && (
        <div className="searchbox">
          <Icon name="search" size={18} />
          <input ref={input} type="search" placeholder={`Search ${all.length} companies`} value={query} onChange={(e) => setQuery(e.target.value)} aria-label="Search companies" />
        </div>
      )}

      {all.length === 0 && <p className="empty small">Companies appear here as you scan cards.</p>}
      {all.length > 0 && shown.length === 0 && <p className="empty small">No company matches “{query.trim()}”.</p>}

      {top.length > 0 && (
        <section>
          <h3 className="group band">Top companies</h3>
          <div className="plain-list">{top.map(row)}</div>
        </section>
      )}
      {shown.length > 0 && (
        <section>
          <h3 className="group band">{q ? `${shown.length} found` : 'A to Z'}<span className="num band-count">{shown.length}</span></h3>
          <div className="plain-list">{alphabetical.map(row)}</div>
        </section>
      )}
    </>
  )
}
