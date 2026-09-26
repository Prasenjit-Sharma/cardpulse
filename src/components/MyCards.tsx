import { useRef, useState } from 'react'
import type { CardStats } from '../lib/cloudaccount'
import { MAX_CARDS, type MyCard } from '../lib/mycards'
import CardCanvas from './CardCanvas'
import CardStack from './CardStack'
import Icon from './Icon'
import { readShareLog, SHARE_LABEL, tallyShares, type ShareKind } from '../lib/sharelog'
import { shortDate } from '../lib/watch'

const LONG_PRESS_MS = 600

/**
 * The user's own digital cards, shown as a holding: the card, then its figures (views, leads, and the share of views
 * that became leads), then one share bar. Cards swipe; a long press opens stall mode.
 */
export default function MyCards({ cards, stats, onAdd, onEdit, onShare, onStall }: {
  cards: MyCard[]
  /** Counts for cards that have a public link, by card id. */
  stats?: Map<string, CardStats>
  onAdd: () => void
  onEdit: (id: string) => void
  onShare: (id: string) => void
  onStall: (id: string) => void
}) {
  const [index, setIndex] = useState(0)
  const press = useRef<number>(0)
  const canAdd = cards.length < MAX_CARDS
  const onAddSlide = canAdd && index >= cards.length
  const current = onAddSlide ? undefined : cards[Math.min(index, cards.length - 1)]       // on the "Add a card" slide there is no card to edit or share

  const startPress = (id: string) => { clearTimeout(press.current); press.current = window.setTimeout(() => onStall(id), LONG_PRESS_MS) }
  const endPress = () => clearTimeout(press.current)

  const stat = current ? stats?.get(current.id) : undefined
  // figures this phone records itself, so the holding is never empty when signed out; views and leads come from the server
  const log = readShareLog()
  const tally = current ? tallyShares(log, current.id) : { shared: 0, qr: 0, exchanged: 0 }
  const recent = current ? log.filter((e) => e.card === current.id).slice(0, 5) : []
  const icon: Record<ShareKind, 'qr' | 'file' | 'image' | 'note' | 'refresh'> = { qr: 'qr', file: 'file', picture: 'image', text: 'note', exchange: 'refresh' }

  return (
    <>
      {cards.length === 0 ? (
        <>
          <div className="page-top"><header className="page-head"><h1>My Card</h1></header></div>
          <div className="empty-scan">
            <CardStack />
            <h2>Your digital card</h2>
            <p>A card you can show or send in a second. It works with no signal.</p>
            <button className="cta" onClick={onAdd}><Icon name="plus" size={20} /> Make my card</button>
          </div>
        </>
      ) : (
        <>
          <section className="mycards-hero page-top">
            <header className="mycards-head">
              <h1>My Card{current?.label && <span className="mycards-label">{current.label}</span>}</h1>
              {current && <button className="icon-btn ghost" onClick={() => onEdit(current.id)} aria-label="Edit card"><Icon name="edit" size={20} /></button>}
            </header>
            <div className="mycards-track" role="region" aria-label="Your cards" tabIndex={0}
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

              <h3 className="group band">Recent sharing</h3>
              <div className="plain-list">
                {recent.length === 0 && <p className="wl-empty">Nothing shared from this phone yet. Share card sends a link, a picture or a contact file.</p>}
                {recent.map((e) => (
                  <div key={e.at} className="index-row static">
                    <span className="lead-ico"><Icon name={icon[e.kind]} size={16} /></span>
                    <span className="grow"><strong>{SHARE_LABEL[e.kind]}</strong></span>
                    <span className="fig"><b className="num">{shortDate(e.at)}</b><small>{new Date(e.at).toLocaleTimeString('en-IN', { hour: 'numeric', minute: '2-digit' })}</small></span>
                  </div>
                ))}
              </div>

            </>
          )}
        </>
      )}
    </>
  )
}
