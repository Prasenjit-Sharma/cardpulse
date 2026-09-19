import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useObjectUrl } from '../lib/useObjectUrl'
import { prepareImage } from '../lib/image'
import { download, telHref, toVCard, waNumber } from '../lib/actions'
import { speechSupported, startDictation } from '../lib/speech'
import { emptyContact, type CardRecord, type Contact, type EventRec, type FieldKey } from '../lib/types'
import Avatar from './Avatar'
import Camera from './Camera'
import Icon from './Icon'

const SUGGESTED_TAGS = ['Customer', 'Supplier', 'Partner', 'Investor', 'Hot lead']
const withProtocol = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`)

function Row({ label, edited, children }: { label: string; edited?: boolean; children: ReactNode }) {
  return <div className={`frow${edited ? ' edited' : ''}`}><span>{label}</span><div>{children}</div></div>
}

function ListRows({ label, values, edited, placeholder, inputMode, onChange }: {
  label: string; values: string[]; edited: boolean; placeholder: string; inputMode?: 'tel' | 'email' | 'url'
  onChange: (v: string[]) => void
}) {
  const rows = values.length ? values : ['']
  return (
    <Row label={label} edited={edited}>
      {rows.map((v, i) => (
        <div key={i} className="lrow">
          <input value={v} inputMode={inputMode} placeholder={placeholder} onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))}
            onBlur={() => onChange(rows.map((x) => x.trim()).filter(Boolean))} />
          {v && <button className="x" onClick={() => onChange(rows.filter((_, j) => j !== i).filter(Boolean))} aria-label="Remove"><Icon name="x" size={16} /></button>}
        </div>
      ))}
      {values.length > 0 && values[values.length - 1] !== '' && <button className="link add" onClick={() => onChange([...values, ''])}>+ Add</button>}
    </Row>
  )
}

export default function ContactDetail({ card, index, events, dupes, onClose, onSave, onRetry, onDelete, onMoveEvent }: {
  card: CardRecord
  index: number
  events: EventRec[]
  dupes: CardRecord[]
  onClose: () => void
  onSave: (c: CardRecord) => Promise<void>
  onRetry: () => void
  onDelete: () => void
  onMoveEvent: (eventId: string) => void
}) {
  const url = useObjectUrl(card.image)
  const backUrl = useObjectUrl(card.back)
  const [contacts, setContacts] = useState<Contact[]>(card.corrected ?? [])
  const [idx, setIdx] = useState(Math.min(index, Math.max(0, (card.corrected?.length ?? 1) - 1)))
  const [slide, setSlide] = useState(0)
  const [light, setLight] = useState('')
  const [menu, setMenu] = useState(false)
  const [camOpen, setCamOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const stopRef = useRef<(() => void) | null>(null)
  const hasLiveCamera = !!navigator.mediaDevices?.getUserMedia
  const canRead = !!card.image && !card.thumbOnly
  const busy = card.status === 'pending' || card.status === 'running'
  const eventName = events.find((e) => e.id === card.eventId)?.name ?? ''
  const c = contacts[idx]

  useEffect(() => () => stopRef.current?.(), [])

  /** `accuracy` edits invalidate the "reviewed" stamp; notes and reminders don't. */
  const commit = (next: Contact[], reviewed: boolean) => { setContacts(next); void onSave({ ...card, corrected: next, reviewed }) }
  const patch = (p: Partial<Contact>, affectsAccuracy = true) =>
    commit(contacts.map((x, j) => (j === idx ? { ...x, ...p } : x)), affectsAccuracy ? false : card.reviewed)
  const changed = (k: FieldKey) => {
    const orig = card.extracted?.[idx]
    return !!orig && !!c && JSON.stringify(orig[k]) !== JSON.stringify(c[k])
  }

  const setBack = async (back: Blob | undefined) => { await onSave({ ...card, back, reviewed: false }); onRetry() }
  const pickBack = async (f?: File) => { if (f) await setBack(await prepareImage(f)) }

  const removePerson = () => {
    if (contacts.length <= 1) return onDelete()
    const next = contacts.filter((_, j) => j !== idx)
    setIdx(Math.max(0, idx - 1))
    commit(next, false)
  }

  const dictate = () => {
    if (listening) { stopRef.current?.(); return }
    const stop = startDictation((t) => patch({ note: [c?.note, t].filter(Boolean).join(' ') }, false), () => { setListening(false); stopRef.current = null })
    if (stop) { stopRef.current = stop; setListening(true) }
  }

  const share = async () => {
    if (!c) return
    const note = [eventName, c.note].filter(Boolean).join(' — ')
    const file = new File([toVCard(c, note)], `${c.name || 'contact'}.vcf`, { type: 'text/vcard' })
    try {
      if (navigator.canShare?.({ files: [file] })) await navigator.share({ files: [file], title: c.name })
      else if (navigator.share) await navigator.share({ title: c.name, text: [c.name, c.title, c.company, ...c.phones, ...c.emails].filter(Boolean).join('\n') })
      else download(file.name, toVCard(c, note), 'text/vcard')
    } catch { /* share sheet dismissed */ }
  }

  const phone = c?.phones.find((p) => p.replace(/\D/g, '').length >= 8)
  const email = c?.emails.find(Boolean)
  const slides = [url, backUrl].filter(Boolean)

  return (
    <div className="editor">
      <header className="bar-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <h2 className="title">{c?.name || 'Contact'}</h2>
        <div className="menu-wrap">
          <button className="icon-btn" onClick={() => setMenu(!menu)} aria-label="More"><Icon name="more" /></button>
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              {canRead && <button onClick={onRetry}>Re-read card</button>}
              {canRead && !card.back && hasLiveCamera && <button onClick={() => setCamOpen(true)}>Add back side (camera)</button>}
              {canRead && !card.back && <button onClick={() => document.getElementById('back-file')?.click()}>Add back side (photo)</button>}
              {card.back && <button onClick={() => confirm('Remove the back side and re-read?') && void setBack(undefined)}>Remove back side</button>}
              <button className="bad" onClick={() => confirm('Remove this person?') && removePerson()}>Delete this contact</button>
              <button className="bad" onClick={() => confirm('Delete the whole card and all its contacts?') && onDelete()}>Delete card</button>
            </div>
          )}
        </div>
        <input id="back-file" type="file" accept="image/*" hidden onChange={(e) => { void pickBack(e.target.files?.[0]); e.target.value = '' }} />
      </header>

      {contacts.length > 1 && (
        <div className="chips scroll">
          {contacts.map((p, i) => <button key={i} className={i === idx ? 'chip on' : 'chip'} onClick={() => setIdx(i)}>{p.name || `Person ${i + 1}`}</button>)}
          <button className="chip" onClick={() => { commit([...contacts, emptyContact()], false); setIdx(contacts.length) }}><Icon name="plus" size={14} /> Person</button>
        </div>
      )}

      {slides.length > 0 && (
        <>
          <div className="carousel" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
            {slides.map((s, i) => <img key={i} src={s} alt={i ? 'Back of card' : 'Front of card'} onClick={() => setLight(s)} />)}
          </div>
          {slides.length > 1 && <div className="dots">{slides.map((_, i) => <i key={i} className={i === slide ? 'on' : ''} />)}</div>}
        </>
      )}
      {light && <div className="lightbox" onClick={() => setLight('')}><img src={light} alt="Card" /></div>}
      {camOpen && <Camera single sidedOnly eventLabel="" onCard={(fs) => { void setBack(fs[0]) }} onClose={() => setCamOpen(false)} />}

      {card.status === 'error' && <div className="banner">{card.error} {canRead && <button className="link" onClick={onRetry}>Retry</button>}</div>}
      {busy && <p className="muted">Reading card…</p>}

      {card.status === 'done' && (!c ? (
        <div className="empty small"><p>No contacts were found on this card.</p>
          <button onClick={() => { commit([emptyContact()], false); setIdx(0) }}><Icon name="plus" size={16} /> Add a contact</button></div>
      ) : (
        <>
          <div className="profile">
            <div className="avatar-wrap"><Avatar name={c.name} size={64} />{c.priority && <span className="star"><Icon name="star" size={12} /></span>}</div>
            <h2>{c.name || '(no name)'}</h2>
            <span className="muted">{[c.title, c.company].filter(Boolean).join(' · ')}</span>
            <span className="met">Met {eventName ? `at ${eventName} · ` : ''}{new Date(card.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}</span>
          </div>

          <div className="qa5">
            <a className={phone ? '' : 'off'} href={phone ? telHref(phone) : undefined}><Icon name="phone" size={20} /><span>Call</span></a>
            <a className={phone ? '' : 'off'} href={phone ? `https://wa.me/${waNumber(phone)}` : undefined} target="_blank" rel="noreferrer"><Icon name="chat" size={20} /><span>WhatsApp</span></a>
            <a className={email ? '' : 'off'} href={email ? `mailto:${email}` : undefined}><Icon name="mail" size={20} /><span>Email</span></a>
            <a className={c.address ? '' : 'off'} href={c.address ? `https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}` : undefined} target="_blank" rel="noreferrer"><Icon name="pin" size={20} /><span>Map</span></a>
            <a className={c.website ? '' : 'off'} href={c.website ? withProtocol(c.website) : undefined} target="_blank" rel="noreferrer"><Icon name="globe" size={20} /><span>Web</span></a>
          </div>

          <div className="trio">
            <button className={c.priority ? 'tile on' : 'tile'} onClick={() => patch({ priority: !c.priority }, false)}><Icon name="star" size={18} /><span>{c.priority ? 'Priority' : 'Mark priority'}</span></button>
            <button className="tile" onClick={() => download(`${c.name || 'contact'}.vcf`, toVCard(c, [eventName, c.note].filter(Boolean).join(' — ')), 'text/vcard')}><Icon name="download" size={18} /><span>Save to phone</span></button>
            <button className="tile" onClick={() => void share()}><Icon name="share" size={18} /><span>Share</span></button>
          </div>

          <div className="panel tags-panel">
            <span className="lab">Why this connection matters</span>
            <div className="chips">
              {[...SUGGESTED_TAGS, ...(c.tags ?? []).filter((t) => !SUGGESTED_TAGS.includes(t))].map((t) => {
                const on = (c.tags ?? []).includes(t)
                return <button key={t} className={on ? 'chip on' : 'chip'} onClick={() => patch({ tags: on ? (c.tags ?? []).filter((x) => x !== t) : [...(c.tags ?? []), t] }, false)}>{t}</button>
              })}
              <button className="chip" onClick={() => { const t = prompt('New tag')?.trim(); if (t) patch({ tags: [...new Set([...(c.tags ?? []), t])] }, false) }}><Icon name="plus" size={14} /> Tag</button>
            </div>
          </div>

          {dupes.length > 0 && <p className="note">Possible duplicate — shares a phone or email with: {dupes.map((d) => d.corrected?.map((p) => p.name).filter(Boolean).join(' & ') || 'unnamed card').join('; ')}</p>}
          {card.aiNotes && <p className="note">Model note: {card.aiNotes}</p>}

          <div className="panel">
            <Row label="Group">
              <select value={card.eventId ?? ''} onChange={(e) => onMoveEvent(e.target.value)}>
                <option value="">None</option>
                {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
              </select>
            </Row>
            <Row label="Follow up"><input type="date" value={c.followUp ?? ''} onChange={(e) => patch({ followUp: e.target.value }, false)} /></Row>
          </div>

          <div className="panel note-panel">
            <textarea rows={2} placeholder="Add note" value={c.note ?? ''} onChange={(e) => patch({ note: e.target.value }, false)} />
            {speechSupported && <button className={`mic${listening ? ' on' : ''}`} onClick={dictate} aria-label="Dictate note"><Icon name="mic" /></button>}
          </div>

          <div className="panel">
            <Row label="Full name" edited={changed('name')}><input value={c.name} onChange={(e) => patch({ name: e.target.value })} /></Row>
            <Row label="Company" edited={changed('company')}><input value={c.company} onChange={(e) => patch({ company: e.target.value })} /></Row>
            <Row label="Job title" edited={changed('title')}><input value={c.title} onChange={(e) => patch({ title: e.target.value })} /></Row>
            <ListRows label="Phone" values={c.phones} edited={changed('phones')} placeholder="Enter phone" inputMode="tel" onChange={(v) => patch({ phones: v })} />
            <ListRows label="Email" values={c.emails} edited={changed('emails')} placeholder="Enter email" inputMode="email" onChange={(v) => patch({ emails: v })} />
          </div>
          <div className="panel">
            <ListRows label="Social" values={c.social} edited={changed('social')} placeholder="LinkedIn / handle" onChange={(v) => patch({ social: v })} />
            <Row label="Web" edited={changed('website')}><input value={c.website} placeholder="Enter web" onChange={(e) => patch({ website: e.target.value })} /></Row>
          </div>
          <div className="panel">
            <Row label="Address" edited={changed('address')}><textarea rows={2} value={c.address} onChange={(e) => patch({ address: e.target.value })} /></Row>
            <Row label="GSTIN" edited={changed('gstin')}><input value={c.gstin} onChange={(e) => patch({ gstin: e.target.value })} /></Row>
          </div>

          <h3 className="group">Recent activity</h3>
          <div className="panel timeline">
            <div><i /><span><strong>Card scanned</strong><small>{new Date(card.createdAt).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}{eventName ? ` · ${eventName}` : ''}</small></span></div>
            {c.note && <div><i /><span><strong>Note added</strong><small>{c.note.length > 60 ? `${c.note.slice(0, 60)}…` : c.note}</small></span></div>}
            {c.followUp && <div className="warm"><i /><span><strong>Follow-up {c.followUp <= new Date().toISOString().slice(0, 10) ? 'due' : 'planned'}</strong><small>{c.followUp}</small></span></div>}
          </div>

          <p className="hint meta">
            {card.model} · {((card.latencyMs ?? 0) / 1000).toFixed(1)}s{card.tokensIn != null && ` · ${card.tokensIn}+${card.tokensOut ?? 0} tokens`}
            {card.languages?.length ? ` · ${card.languages.join(', ')}` : ''}. Highlighted fields were corrected by you.
          </p>
          <button className={card.reviewed ? 'wide ok' : 'wide primary'} onClick={() => commit(contacts, !card.reviewed)}>
            {card.reviewed ? <><Icon name="check" size={18} /> Reviewed. Tap to undo</> : 'Mark card as reviewed'}
          </button>
        </>
      ))}

    </div>
  )
}
