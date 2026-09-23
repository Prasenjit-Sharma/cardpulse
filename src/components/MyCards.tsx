import { useRef, useState } from 'react'
import type { CardStats } from '../lib/cloudaccount'
import { MAX_CARDS, type MyCard } from '../lib/mycards'
import CardCanvas from './CardCanvas'
import CardStack from './CardStack'
import Icon from './Icon'

const LONG_PRESS_MS = 600

/** The user's own digital cards: a swipeable row, with Edit and Share for the one in view. A long press opens stall mode. */
const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`

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

  return (
    <>
      <header className="page-head"><h1>My Card</h1></header>

      {cards.length === 0 ? (
        <div className="empty-scan">
          <CardStack />
          <h2>Your digital card</h2>
          <p>A card you can show or send in a second. It works with no signal.</p>
          <button className="cta" onClick={onAdd}><Icon name="plus" size={20} /> Make my card</button>
        </div>
      ) : (
        <>
          <div className="mycards-track" role="region" aria-label="Your cards" tabIndex={0}
            onScroll={(e) => { const el = e.currentTarget; const slide = el.firstElementChild as HTMLElement | null; const pitch = slide ? slide.offsetWidth + 14 : el.clientWidth; setIndex(Math.round(el.scrollLeft / pitch)) }}>
            {cards.map((c, i) => (
              <div key={c.id} className="mycards-item" role="group" aria-roledescription="slide" aria-label={`Card ${i + 1} of ${cards.length}${c.label ? `, ${c.label}` : ''}`}
                onPointerDown={() => startPress(c.id)} onPointerUp={endPress} onPointerLeave={endPress} onPointerCancel={endPress} onContextMenu={(e) => e.preventDefault()}>
                <CardCanvas card={c} />
                {c.label && <span className="mycards-label">{c.label}</span>}
              </div>
            ))}
            {canAdd && (
              <div className="mycards-item">
                <button className="mycards-add" onClick={onAdd}><Icon name="plus" size={22} /> Add a card</button>
              </div>
            )}
          </div>
          {cards.length + (canAdd ? 1 : 0) > 1 && (
            <div className="dots-row" aria-hidden="true">{Array.from({ length: cards.length + (canAdd ? 1 : 0) }, (_, i) => <i key={i} className={i === index ? 'on' : ''} />)}</div>
          )}
          {current && (
            <div className="mycards-actions">
              <button className="outline" onClick={() => onEdit(current.id)}><Icon name="edit" size={18} /> Edit</button>
              <button className="cta" onClick={() => onShare(current.id)}><Icon name="share" size={18} /> Share</button>
            </div>
          )}
          {current && stats?.get(current.id) && (
            <p className="hint mycards-stats">Link opened {plural(stats.get(current.id)!.views, 'time', 'times')} · {plural(stats.get(current.id)!.leads, 'lead', 'leads')}</p>
          )}
          <p className="hint mycards-tip">Press and hold a card, or use Share, to show its QR full screen.</p>
        </>
      )}
    </>
  )
}
