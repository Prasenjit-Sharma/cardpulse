import { telHref, waNumber } from '../lib/actions'
import { callNumber, whatsAppNumber } from '../lib/phones'
import type { CardRecord, Contact } from '../lib/types'
import type { Figure } from '../lib/watch'
import CardThumb from './CardThumb'
import Icon from './Icon'

/**
 * One person on a watchlist. The row reads like a trading row: who on the left, one figure on the right in tabular
 * numerals. Tapping it opens its depth drawer in place (Call, WhatsApp, Email, Star, Open), so the next action is one
 * tap from the list; while selecting, a tap selects instead and the row inverts.
 */
export default function WatchRow({ card, p, figure, sub, note, open, onToggle, onOpen, onStar, selecting = false, selected = false, i = 0 }: {
  card: CardRecord
  p: Contact
  figure?: Figure
  /** Second line; company and title by default. */
  sub?: string
  /** An amber line under the name: something to check. */
  note?: string
  open: boolean
  onToggle: () => void
  onOpen: () => void
  onStar?: () => void
  selecting?: boolean
  selected?: boolean
  i?: number
}) {
  const phone = callNumber(p)
  const wa = whatsAppNumber(p)
  const email = p.emails[0]
  const line = sub ?? ([p.company, p.title].filter(Boolean).join(' · ') || phone || email || '')
  const name = p.name || '(no name)'
  return (
    <div className={`watch-row${open ? ' open' : ''}${selected ? ' sel' : ''}`} style={{ ['--i' as string]: i }}>
      <button className="watch-main" onClick={onToggle} aria-expanded={selecting ? undefined : open} aria-pressed={selecting ? selected : undefined}>
        {selecting && <span className={`check-dot${selected ? ' on' : ''}`} aria-hidden="true">{selected && <Icon name="check" size={14} />}</span>}
        <CardThumb blob={card.image} name={p.name} />
        <span className="grow">
          <strong>{p.priority && <span className="star-mark" aria-label="Starred"><Icon name="star" size={12} /></span>}{name}</strong>
          {line && <span className="muted">{line}</span>}
          {note && <span className="dup-note">{note}</span>}
        </span>
        {figure && (
          <span className={`fig ${figure.tone}`}>
            <b className="num">{figure.text}</b>
            <small>{figure.sub}</small>
          </span>
        )}
      </button>
      {open && !selecting && (
        <div className="depth" role="group" aria-label={`Actions for ${name}`}>
          {phone ? <a className="depth-act" href={telHref(phone)}><Icon name="phone" size={18} /><span>Call</span></a> : <span className="depth-act off" aria-hidden="true"><Icon name="phone" size={18} /><span>Call</span></span>}
          {wa ? <a className="depth-act" href={`https://wa.me/${waNumber(wa)}`} target="_blank" rel="noreferrer"><Icon name="chat" size={18} /><span>WhatsApp</span></a> : <span className="depth-act off" aria-hidden="true"><Icon name="chat" size={18} /><span>WhatsApp</span></span>}
          {email ? <a className="depth-act" href={`mailto:${email}`}><Icon name="mail" size={18} /><span>Email</span></a> : <span className="depth-act off" aria-hidden="true"><Icon name="mail" size={18} /><span>Email</span></span>}
          {onStar && <button className={`depth-act${p.priority ? ' starred' : ''}`} onClick={onStar} aria-pressed={!!p.priority}><Icon name="star" size={18} /><span>{p.priority ? 'Starred' : 'Star'}</span></button>}
          <button className="depth-act go" onClick={onOpen}><Icon name="chevron" size={18} /><span>Open</span></button>
        </div>
      )}
    </div>
  )
}
