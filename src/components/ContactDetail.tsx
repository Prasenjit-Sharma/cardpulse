import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useObjectUrl } from '../lib/useObjectUrl'
import { prepareImage } from '../lib/image'
import { saveToPhone, shareContact, telHref, waNumber } from '../lib/actions'
import { speechSupported, startDictation } from '../lib/speech'
import { emptyContact, type CardRecord, type Contact, type EventRec, type FieldKey } from '../lib/types'
import Camera from './Camera'
import Icon from './Icon'

const SUGGESTED_TAGS = ['Customer', 'Supplier', 'Partner', 'Investor', 'Hot lead']
const withProtocol = (w: string) => (/^https?:\/\//i.test(w) ? w : `https://${w}`)
const when = (t: number) => new Date(t).toLocaleString(undefined, { month: 'short', day: 'numeric', year: 'numeric', hour: 'numeric', minute: '2-digit' })

/** Card-shaped photos fill the frame; anything else (tables of cards, tall photos) is shown whole. */
const fitImage = (e: React.SyntheticEvent<HTMLImageElement>) => {
  const im = e.currentTarget
  const r = im.naturalWidth / im.naturalHeight
  im.dataset.fit = r > 1.3 && r < 2.3 ? 'cover' : 'contain'
}

/* ---------- edit-mode building blocks ---------- */
function Row({ label, edited, children }: { label: string; edited?: boolean; children: ReactNode }) {
  return <div className={`frow${edited ? ' edited' : ''}`}><span>{label}</span><div>{children}</div></div>
}
function ListRows({ label, values, edited, placeholder, inputMode, onChange }: {
  label: string; values: string[]; edited: boolean; placeholder: string; inputMode?: 'tel' | 'email' | 'url'; onChange: (v: string[]) => void
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

/* ---------- view-mode building block: icon badge, text, trailing actions ---------- */
function Info({ icon, label, children, actions }: { icon: 'pin' | 'phone' | 'mail' | 'globe' | 'building' | 'star'; label?: string; children: ReactNode; actions?: ReactNode }) {
  return (
    <div className="info">
      <span className="badge"><Icon name={icon} size={18} /></span>
      <div className="grow"><span className="val">{children}</span>{label && <small>{label}</small>}</div>
      {actions && <div className="acts">{actions}</div>}

    </div>
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
  const [editing, setEditing] = useState(false)
  const [slide, setSlide] = useState(0)
  const [light, setLight] = useState('')
  const [menu, setMenu] = useState(false)
  const [camOpen, setCamOpen] = useState(false)
  const [listening, setListening] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const [fab, setFab] = useState(false)
  const [flash, setFlash] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  const hasLiveCamera = !!navigator.mediaDevices?.getUserMedia
  const canRead = !!card.image && !card.thumbOnly
  const busy = card.status === 'pending' || card.status === 'running'
  const eventName = events.find((e) => e.id === card.eventId)?.name ?? ''
  const c = contacts[idx]

  useEffect(() => () => stopRef.current?.(), [])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2600); return () => clearTimeout(t) }, [flash])

  /** Accuracy edits invalidate the "reviewed" stamp; notes, tags and reminders don't. */
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
    setIdx(Math.max(0, idx - 1))
    commit(contacts.filter((_, j) => j !== idx), false)
  }
  const dictate = () => {
    if (listening) { stopRef.current?.(); return }
    const stop = startDictation((t) => patch({ note: [c?.note, t].filter(Boolean).join(' ') }, false), () => { setListening(false); stopRef.current = null })
    if (stop) { stopRef.current = stop; setListening(true) }
  }
  const noteFor = () => [eventName, c?.note].filter(Boolean).join(' — ')
  // Both actions must start inside the tap (Android needs the user gesture to open Contacts or the share sheet).
  const run = async (kind: 'save' | 'share') => {
    if (!c) return
    setFab(false)
    const result = kind === 'save' ? await saveToPhone(c, noteFor()) : await shareContact(c, noteFor())
    const msg = { contacts: 'Opening Contacts…', copied: 'Contact details copied', downloaded: 'Contact file downloaded', shared: '', cancelled: '' }[result]
    if (msg) setFlash(msg)
    if (result === 'contacts') {
      // If the Contacts app really opened, this page is hidden a moment later. If it is still showing, say so instead of doing nothing.
      setTimeout(() => { if (document.visibilityState === 'visible') setFlash('Contacts did not open. Try Share contact instead.') }, 2000)
    }
  }

  const slides = [url, backUrl].filter(Boolean)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page-plain">
      <header className="bar-top">
        <button className="icon-btn ghost" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <h2 className="title">{c?.name || 'Contact'}</h2>
        {card.status === 'done' && c && (
          <button className={`icon-btn ghost${editing ? ' on' : ''}`} onClick={() => setEditing(!editing)} aria-label={editing ? 'Done editing' : 'Edit'}><Icon name={editing ? 'check' : 'edit'} size={20} /></button>
        )}
        <div className="menu-wrap">
          <button className="icon-btn ghost" onClick={() => setMenu(!menu)} aria-label="More"><Icon name="more" /></button>
          {menu && (
            <div className="menu" onClick={() => setMenu(false)}>
              {c && <button onClick={() => patch({ priority: !c.priority }, false)}>{c.priority ? 'Remove priority' : 'Mark as priority'}</button>}
              {canRead && <button onClick={onRetry}>Re-read card</button>}
              {canRead && !card.back && hasLiveCamera && <button onClick={() => setCamOpen(true)}>Add back side (camera)</button>}
              {canRead && !card.back && <button onClick={() => document.getElementById('back-file')?.click()}>Add back side (photo)</button>}
              {card.back && <button onClick={() => confirm('Remove the back side and re-read?') && void setBack(undefined)}>Remove back side</button>}
              <button className="bad" onClick={() => confirm('Remove this person?') && removePerson()}>Delete contact</button>
              <button className="bad" onClick={() => confirm('Delete the whole card and all its contacts?') && onDelete()}>Delete card</button>
            </div>
          )}
        </div>
        <input id="back-file" type="file" accept="image/*" hidden onChange={(e) => { void pickBack(e.target.files?.[0]); e.target.value = '' }} />
      </header>

      {contacts.length > 1 && (
        <div className="chips scroll">
          {contacts.map((p, i) => <button key={i} className={i === idx ? 'chip on' : 'chip'} onClick={() => setIdx(i)}>{p.name || `Person ${i + 1}`}</button>)}
          <button className="chip" onClick={() => { commit([...contacts, emptyContact()], false); setIdx(contacts.length); setEditing(true) }}><Icon name="plus" size={14} /> Person</button>
        </div>
      )}

      {light && <div className="lightbox" onClick={() => setLight('')}><img src={light} alt="Card" /></div>}
      {camOpen && <Camera single sidedOnly eventLabel="" onCard={(fs) => { void setBack(fs[0]) }} onClose={() => setCamOpen(false)} />}
      {card.status === 'error' && <div className="banner">{card.error} {canRead && <button className="link" onClick={onRetry}>Retry</button>}</div>}
      {busy && <p className="muted">Reading card…</p>}

      {card.status === 'done' && !c && (
        <div className="empty small"><p>No contacts were found on this card.</p>
          <button className="cta small" onClick={() => { commit([emptyContact()], false); setIdx(0); setEditing(true) }}><Icon name="plus" size={16} /> Add a contact</button></div>
      )}

      {card.status === 'done' && c && !editing && (
        <>
          <div className="namecard">
            <h1>{c.name || '(no name)'}{c.priority && <span className="star-mark"><Icon name="star" size={16} /></span>}</h1>
            {c.title && <strong>{c.title}</strong>}
            {c.company && <span className="co">{c.company}</span>}
          </div>

          {dupes.length > 0 && <p className="note">Possible duplicate. Shares a phone or email with: {dupes.map((d) => d.corrected?.map((p) => p.name).filter(Boolean).join(' & ') || 'unnamed card').join('; ')}</p>}
          {card.aiNotes && <p className="note">Model note: {card.aiNotes}</p>}

          <div className="infos">
            {c.address && <Info icon="pin" actions={<a className="act" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(c.address)}`} target="_blank" rel="noreferrer" aria-label="Open map"><Icon name="chevron" size={18} /></a>}>{c.address}</Info>}
            {c.phones.map((ph) => (
              <Info key={ph} icon="phone" label="mobile" actions={<>
                <a className="act" href={`https://wa.me/${waNumber(ph)}`} target="_blank" rel="noreferrer" aria-label={`WhatsApp ${ph}`}><Icon name="chat" size={18} /></a>
                <a className="act" href={telHref(ph)} aria-label={`Call ${ph}`}><Icon name="phone" size={18} /></a></>}>{ph}</Info>
            ))}
            {c.emails.map((em) => <Info key={em} icon="mail" actions={<a className="act" href={`mailto:${em}`} aria-label={`Email ${em}`}><Icon name="mail" size={18} /></a>}>{em}</Info>)}
            {c.website && <Info icon="globe" actions={<a className="act" href={withProtocol(c.website)} target="_blank" rel="noreferrer" aria-label="Open website"><Icon name="chevron" size={18} /></a>}>{c.website}</Info>}
            {c.social.map((s) => <Info key={s} icon="globe">{s}</Info>)}
            {c.gstin && <Info icon="building" label="GSTIN">{c.gstin}</Info>}
            {!c.address && !c.phones.length && !c.emails.length && !c.website && <p className="muted">No contact details yet. Tap the pencil to add some.</p>}
          </div>

          <div className="add-row">
            {(c.tags ?? []).map((t) => <button key={t} className="tagchip" onClick={() => patch({ tags: (c.tags ?? []).filter((x) => x !== t) }, false)}>{t} <Icon name="x" size={12} /></button>)}
            <button className="dashed" onClick={() => setTagsOpen(!tagsOpen)}><Icon name="plus" size={16} /> Tags</button>
            {!(c.note || noteOpen) && <button className="dashed" onClick={() => setNoteOpen(true)}><Icon name="plus" size={16} /> Notes</button>}
            {!(c.followUp || followOpen) && <button className="dashed" onClick={() => setFollowOpen(true)}><Icon name="plus" size={16} /> Follow-up</button>}
          </div>
          {tagsOpen && (
            <div className="add-row suggest">
              {SUGGESTED_TAGS.filter((t) => !(c.tags ?? []).includes(t)).map((t) => <button key={t} className="chip" onClick={() => patch({ tags: [...(c.tags ?? []), t] }, false)}>{t}</button>)}
              <button className="chip" onClick={() => { const t = prompt('New tag')?.trim(); if (t) patch({ tags: [...new Set([...(c.tags ?? []), t])] }, false) }}>Custom…</button>
            </div>
          )}
          {(c.note || noteOpen) && (
            <div className="field-box notebox">
              <span>Notes</span>
              <textarea rows={3} autoFocus={noteOpen && !c.note} placeholder="Just like writing on the back of a business card." value={c.note ?? ''} onChange={(e) => patch({ note: e.target.value }, false)} />
              {speechSupported && <button className={`mic${listening ? ' on' : ''}`} onClick={dictate} aria-label="Dictate note"><Icon name="mic" size={18} /></button>}
            </div>
          )}
          {(c.followUp || followOpen) && (
            <label className="field-box"><span>Follow up on</span>
              <input type="date" value={c.followUp ?? ''} onChange={(e) => patch({ followUp: e.target.value }, false)} />
              {c.followUp && c.followUp <= today && <small className="due">Due</small>}
            </label>
          )}

          <h3 className="section">Connection</h3>
          <div className="infos">
            <div className="line"><Icon name="clock" size={18} /><span>Added on {when(card.createdAt)}</span></div>
            <div className="line"><Icon name="camera" size={18} /><span>{eventName ? `Scanned at ${eventName}` : 'Scanned contact'}</span></div>
          </div>
          <label className="field-box">
            <span>Associated event</span>
            <select value={card.eventId ?? ''} onChange={(e) => onMoveEvent(e.target.value)}>
              <option value="">None</option>
              {events.map((e) => <option key={e.id} value={e.id}>{e.name}</option>)}
            </select>
          </label>

          {slides.length > 0 && (
            <>
              <h3 className="section">Scanned card</h3>
              <div className="carousel" onScroll={(e) => setSlide(Math.round(e.currentTarget.scrollLeft / e.currentTarget.clientWidth))}>
                {slides.map((s, i) => <img key={i} src={s} alt={i ? 'Back of card' : 'Front of card'} onClick={() => setLight(s)} onLoad={fitImage} />)}
              </div>
              {slides.length > 1 && <div className="dots-row">{slides.map((_, i) => <i key={i} className={i === slide ? 'on' : ''} />)}</div>}
            </>
          )}
        </>
      )}

      {card.status === 'done' && c && editing && (
        <>
          <p className="hint">Fix anything that was misread. Corrected fields are highlighted and count against accuracy.</p>
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
          <p className="hint">{card.model} · {((card.latencyMs ?? 0) / 1000).toFixed(1)}s{card.tokensIn != null && ` · ${card.tokensIn}+${card.tokensOut ?? 0} tokens`}{card.languages?.length ? ` · ${card.languages.join(', ')}` : ''}</p>
          <button className={card.reviewed ? 'outline ok' : 'cta small'} onClick={() => commit(contacts, !card.reviewed)}>
            {card.reviewed ? <><Icon name="check" size={18} /> Reviewed. Tap to undo</> : 'Mark card as reviewed'}
          </button>
          <button className="outline" style={{ marginTop: 8 }} onClick={() => setEditing(false)}>Done</button>
        </>
      )}

      {flash && <div className="flash" role="status">{flash}</div>}
      {card.status === 'done' && c && !editing && (
        <>
          {fab && <div className="scrim" onClick={() => setFab(false)} />}
          <div className="fab-menu">
            {fab && (
              <>
                <button className="fab-item" onClick={() => void run('save')}><span>Save to phone</span><i><Icon name="download" size={22} /></i></button>
                <button className="fab-item" onClick={() => void run('share')}><span>Share contact</span><i><Icon name="share" size={22} /></i></button>
              </>
            )}
            <button className={`fab-main${fab ? ' open' : ''}`} onClick={() => setFab(!fab)} aria-label={fab ? 'Close actions' : 'More actions'} aria-expanded={fab}><Icon name={fab ? 'x' : 'more'} size={26} /></button>
          </div>
        </>
      )}
    </div>
  )
}
