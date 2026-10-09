import { useRef, useState } from 'react'
import type { CardStats } from '../lib/cloudaccount'
import type { MyCard } from '../lib/mycards'
import { MY_CARDS, PLANS, rupees, type Tier } from '../../shared/plans'
import CardCanvas from './CardCanvas'
import CardStack from './CardStack'
import Icon from './Icon'
import { readShareLog, tallyShares } from '../lib/sharelog'

const LONG_PRESS_MS = 600
const TIER_NAME: Record<Tier, string> = { free: 'Free', starter: 'Starter', plus: 'Plus', pro: 'Pro', unlimited: 'Unlimited' }

/**
 * The user's own digital cards, shown as a holding: the card, then its figures (views, leads, and the share of views
 * that became leads), then one share bar. Cards swipe; a long press opens stall mode.
 */
export default function MyCards({ cards, locked, limit, pass, tier, stats, onAdd, onEdit, onShare, onStall, onPlans }: {
  /** The cards the plan keeps; only these are shown and shared. */
  cards: MyCard[]
  /** Cards over the plan's limit (after a move to a smaller plan, or a restore): kept, editable, never shared. */
  locked: MyCard[]
  /** How many cards the account keeps: the plan's number (MY_CARDS), or the pass's while one runs. */
  limit: number
  /** The limit comes from a running Exhibition pass. */
  pass: boolean
  /** The account's plan; signed out counts as Free. */
  tier: Tier
  /** Counts for cards that have a public link, by card id. */
  stats?: Map<string, CardStats>
  onAdd: () => void
  onEdit: (id: string) => void
  onShare: (id: string) => void
  onStall: (id: string) => void
  onPlans: () => void
}) {
  const [index, setIndex] = useState(0)
  const press = useRef<number>(0)
  const track = useRef<HTMLDivElement>(null)
  const holder = pass ? 'Your pass' : TIER_NAME[tier]       // who sets the limit, for the rows below
  const held = cards.length + locked.length
  const canAdd = held < limit
  // the cheapest plan that holds more cards than this one, for the row under the list
  const next = PLANS.find((p) => MY_CARDS[p.tier] > limit)
  const onAddSlide = canAdd && index >= cards.length
  const current = onAddSlide ? undefined : cards[Math.min(index, cards.length - 1)]       // on the "Add a card" slide there is no card to edit or share

  const startPress = (id: string) => { clearTimeout(press.current); press.current = window.setTimeout(() => onStall(id), LONG_PRESS_MS) }
  const endPress = () => clearTimeout(press.current)
  const showCard = (i: number) => {
    const el = track.current, slide = el?.children[i] as HTMLElement | undefined
    const behavior: ScrollBehavior = matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth'
    if (el && slide) el.scrollTo({ left: slide.offsetLeft - el.offsetLeft - 16, behavior })       // the track's 16px inset; the same pitch as onScroll
    el?.scrollIntoView({ block: 'nearest', behavior })
  }

  const stat = current ? stats?.get(current.id) : undefined
  // figures this phone records itself, so the holding is never empty when signed out; views and leads come from the server
  const log = readShareLog()
  const tally = current ? tallyShares(log, current.id) : { shared: 0, qr: 0, exchanged: 0 }

  return (
    <>
      {cards.length === 0 ? (
        <>
          <div className="page-top deep"><header className="page-head"><h1>My Card</h1></header></div>
          <div className="empty-scan">
            <CardStack />
            <h2>Your digital card</h2>
            <p>A card you can show or send in a second. It works with no signal.</p>
            <button className="cta" onClick={onAdd} data-tip="mycard"><Icon name="plus" size={20} /> Make my card</button>
          </div>
        </>
      ) : (
        <>
          <section className="mycards-hero page-top deep">
            <header className="mycards-head">
              <h1>My Card{current?.label && <span className="mycards-label">{current.label}</span>}</h1>
              {current && <button className="icon-btn ghost" onClick={() => onEdit(current.id)} aria-label="Edit card"><Icon name="edit" size={20} /></button>}
            </header>
            <div ref={track} className="mycards-track" role="region" aria-label="Your cards" tabIndex={0}
              onScroll={(e) => { const el = e.currentTarget; const slide = el.firstElementChild as HTMLElement | null; const pitch = slide ? slide.offsetWidth + 16 : el.clientWidth; setIndex(Math.round(el.scrollLeft / pitch)) }}>
              {cards.map((c, i) => (
                <div key={c.id} className="mycards-item" role="group" aria-roledescription="slide" aria-label={`Card ${i + 1} of ${cards.length}${c.label ? `, ${c.label}` : ''}`}
                  onPointerDown={() => startPress(c.id)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={(e) => e.preventDefault()}>
                  <CardCanvas card={c} />
                </div>
              ))}
              {canAdd && (
                <div className="mycards-item">
                  <button className="mycards-add" onClick={onAdd}><Icon name="plus" size={22} /> Add a card</button>
                </div>
              )}
            </div>
            {cards.length + (canAdd ? 1 : 0) > 1 && (
              <div className="dots-row mycards-dots" aria-hidden="true">{Array.from({ length: cards.length + (canAdd ? 1 : 0) }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>
            )}
            {current && (
              <div className="figgrid" style={{ ['--cols' as string]: 4 }} role="group" aria-label="This card's figures">
                <div><span>Shared</span><b className="num">{tally.shared + tally.exchanged}</b></div>
                <div><span>QR shown</span><b className="num">{tally.qr}</b></div>
                <div><span>Views</span><b className="num">{stat ? stat.views : '–'}</b></div>
                <div><span>Leads</span><b className={`num${stat?.leads ? ' up' : ''}`}>{stat ? stat.leads : '–'}</b></div>
              </div>
            )}
          </section>
          {current && (
            <>
              {!stat && <p className="holding-note">Views and leads count when you are signed in.</p>}
              <div className="mycards-actions">
                <button className="cta" onClick={() => onShare(current.id)}><Icon name="share" size={19} /> Share card</button>
                <button className="trade sq" onClick={() => onStall(current.id)} aria-label="Show QR full screen" title="Show QR"><Icon name="qr" size={20} /></button>
              </div>
              <button className="index-row stall-row" onClick={() => onStall(current.id)}>
                <span className="grow"><strong>At a stall</strong><span className="muted">Show your QR full screen. Or press and hold the card.</span></span>
                <Icon name="chevron" size={18} />
              </button>
            </>
          )}

          <section aria-label="Your cards">
            <h3 className="group band">Your cards<span className="num band-count">{held > limit ? `${held}, ${limit} live` : `${held} of ${limit}`}</span></h3>
            <div className="plain-list">
              {cards.map((c, i) => {
                const on = c.id === current?.id
                return (
                  <button key={c.id} className={`index-row mycard-row${on ? ' on' : ''}`} onClick={() => showCard(i)} aria-current={on ? 'true' : undefined}>
                    <span aria-hidden="true" className="mycard-mini-wrap"><CardCanvas card={c} className="mycard-mini" /></span>
                    <span className="grow">
                      <strong>{c.label || c.name || 'Untitled card'}</strong>
                      <span className="muted">{[c.label ? c.name : '', c.company || c.title].filter(Boolean).join(' · ') || 'No details yet'}</span>
                    </span>
                    {on ? <span className="mycard-tag">Showing</span> : <Icon name="chevron" size={18} />}
                  </button>
                )
              })}
              {locked.map((c) => (
                <div key={c.id} className="mycard-locked">
                  <button className="index-row mycard-row" onClick={onPlans}>
                    <span aria-hidden="true" className="mycard-mini-wrap"><CardCanvas card={c} className="mycard-mini" /><span className="mycard-lock"><Icon name="lock" size={14} /></span></span>
                    <span className="grow">
                      <strong>{c.label || c.name || 'Untitled card'}</strong>
                      <span className="muted">Locked. {holder} keeps {limit} {limit === 1 ? 'card' : 'cards'}</span>
                    </span>
                  </button>
                  <button className="icon-btn ghost" onClick={() => onEdit(c.id)} aria-label={`Edit or delete ${c.label || c.name || 'this card'}`}><Icon name="edit" size={18} /></button>
                </div>
              ))}
              {canAdd ? (
                <button className="index-row" onClick={onAdd}>
                  <span className="tool-well"><Icon name="plus" size={20} /></span>
                  <span className="grow"><strong>Add a card</strong><span className="muted">Another business, brand or language. {limit - held} more on {pass ? 'your pass' : TIER_NAME[tier]}</span></span>
                  <Icon name="chevron" size={18} />
                </button>
              ) : next ? (
                <button className="index-row" onClick={onPlans}>
                  <span className="tool-well"><Icon name="lock" size={18} /></span>
                  <span className="grow">
                    <strong>{locked.length ? `Unlock with ${next.name}` : `${MY_CARDS[next.tier]} cards with ${next.name}`}</strong>
                    <span className="muted wrap">{locked.length ? `${MY_CARDS[next.tier]} cards live, or delete one to swap it in` : 'One for each business or brand you run'}, {rupees(next.monthly)} a month</span>
                  </span>
                  <Icon name="chevron" size={18} />
                </button>
              ) : null}
            </div>
          </section>

          {current && <CardFacts card={current} onEdit={() => onEdit(current.id)} />}
        </>
      )}
    </>
  )
}

/** What the shown card gives away, as a flat label | value table, so it can be checked before it is shared. */
function CardFacts({ card, onEdit }: { card: MyCard; onEdit: () => void }) {
  const rows: [string, string][] = [
    ['Name', card.name], ['Title', card.title], ['Company', card.company],
    ...card.phones.map((v, i): [string, string] => [i ? '' : card.phones.length > 1 ? 'Phones' : 'Phone', v]),
    ...card.emails.map((v, i): [string, string] => [i ? '' : card.emails.length > 1 ? 'Emails' : 'Email', v]),
    ['Website', card.website], ['Address', card.address],
    ...card.social.map((v, i): [string, string] => [i ? '' : 'Social', v]),
  ]
  const shown = rows.filter(([, v]) => v)
  return (
    <section aria-label="On this card">
      <h3 className="group band">On this card<button className="link" onClick={onEdit}>Edit</button></h3>
      <dl className="field-table mycard-facts">
        {shown.map(([k, v], i) => <div key={i}><dt>{k}</dt><dd>{v}</dd></div>)}
      </dl>
    </section>
  )
}
