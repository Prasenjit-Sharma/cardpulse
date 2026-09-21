import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useObjectUrl } from '../lib/useObjectUrl'
import { attentionReasons } from '../lib/attention'
import { browserEnv, download, saveToPhone, shareContact, telHref, toVCard, waNumber } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { log } from '../lib/debug'
import { speechSupported, startDictation } from '../lib/speech'
import { emptyContact, type CardRecord, type Contact, type EventRec, type FieldKey } from '../lib/types'
import Sheet, { SheetItem } from './Sheet'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'
import StarButton from './StarButton'
import Picker from './Picker'

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
  const [listening, setListening] = useState(false)
  const [tagsOpen, setTagsOpen] = useState(false)
  const [noteOpen, setNoteOpen] = useState(false)
  const [followOpen, setFollowOpen] = useState(false)
  const [newTag, setNewTag] = useState('')
  const tagsRef = useRef<HTMLDivElement>(null)
  const noteRef = useRef<HTMLDivElement>(null)
  const noteInput = useRef<HTMLTextAreaElement>(null)
  const followRef = useRef<HTMLDivElement>(null)
  const followInput = useRef<HTMLInputElement>(null)
  const [fab, setFab] = useState(false)
  const [flash, setFlash] = useState('')
  const stopRef = useRef<(() => void) | null>(null)
  useBackClose(fab, () => setFab(false))
  useBackClose(!!light, () => setLight(''))
  const canRead = !!card.image && !card.thumbOnly
  const busy = card.status === 'pending' || card.status === 'running'
  const eventName = events.find((e) => e.id === card.eventId)?.name ?? ''
  const c = contacts[idx]

  useEffect(() => () => stopRef.current?.(), [])
  // Only cards the user has actually opened count towards accuracy.
  useEffect(() => { if (card.status === 'done' && !card.opened) void onSave({ ...card, opened: true }) }, [card.status, card.opened])  // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!tagsOpen && !noteOpen && !followOpen) return
    const onDown = (e: PointerEvent) => {
      const t = e.target as HTMLElement
      if (t.closest?.('[data-adder]')) return                                   // the toggle buttons handle themselves
      const within = (r: { current: HTMLElement | null }) => !!r.current?.contains(t)
      if (tagsOpen && !within(tagsRef)) setTagsOpen(false)
      if (noteOpen && !within(noteRef) && !(contacts[idx]?.note ?? '').trim()) setNoteOpen(false)
      if (followOpen && !within(followRef) && !contacts[idx]?.followUp) setFollowOpen(false)
    }
    document.addEventListener('pointerdown', onDown)
    return () => document.removeEventListener('pointerdown', onDown)
  }, [tagsOpen, noteOpen, followOpen, contacts, idx])
  // Opened while still being read (or after a re-read): take the new contacts as soon as the reading finishes.
  useEffect(() => {
    if (card.status !== 'done') return
    setContacts(card.corrected ?? [])
    setIdx((i) => Math.min(i, Math.max(0, (card.corrected?.length ?? 1) - 1)))
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [card.status])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2600); return () => clearTimeout(t) }, [flash])

  /** Editing a basic field means the user has looked at the card, so nothing stays flagged; notes, tags, follow-ups and priority don't count. */
  const commit = (next: Contact[], reviewed: boolean) => { setContacts(next); void onSave({ ...card, corrected: next, reviewed }) }
  const patch = (p: Partial<Contact>, basicField = true) =>
    commit(contacts.map((x, j) => (j === idx ? { ...x, ...p } : x)), basicField ? true : card.reviewed)
  const reasons = attentionReasons(card, dupes.length > 0)
  const flagged = card.status === 'done' && !card.reviewed && reasons.length > 0
  const changed = (k: FieldKey) => {
    const orig = card.extracted?.[idx]
    return !!orig && !!c && JSON.stringify(orig[k]) !== JSON.stringify(c[k])
  }
  /** Leaving edit mode counts as having reviewed the model's caveat, so it stops showing. */
  const finishEditing = () => { setEditing(false); if (card.aiNotes) void onSave({ ...card, corrected: contacts, aiNotes: undefined }) }
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
    const env = browserEnv((m) => log(m))
    const fmt = currentNameFormat()
    const out = kind === 'save' ? await saveToPhone(c, noteFor(), env, fmt) : await shareContact(c, noteFor(), env, fmt)
    const why = out.problem ? ` (${out.problem})` : ''
    if (out.result === 'copied') setFlash(`Share sheet unavailable${why}. Contact details copied.`)
    else if (out.result === 'downloaded') setFlash(`Downloaded a contact file${why}. Open it to add to Contacts.`)
  }

  const slides = [url, backUrl].filter(Boolean)
  const today = new Date().toISOString().slice(0, 10)

  return (
    <div className="page-plain">
      <header className="bar-top">
        <button className="icon-btn ghost" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <span className="grow" />
        {card.status === 'done' && c && <StarButton on={!!c.priority} onToggle={() => patch({ priority: !c.priority }, false)} />}
        {card.status === 'done' && c && (
          <button className={`icon-btn ghost${editing ? ' on' : ''}`} onClick={() => (editing ? finishEditing() : setEditing(true))} aria-label={editing ? 'Done editing' : 'Edit'}><Icon name={editing ? 'check' : 'edit'} size={20} /></button>
        )}
        <button className="icon-btn ghost" onClick={() => setMenu(true)} aria-label="More options"><Icon name="more" /></button>
      </header>

      <Sheet open={menu} onClose={() => setMenu(false)} title={c?.name || 'Contact'}>
        {c && <SheetItem icon="file" label="Download contact file (.vcf)" onClick={() => { setMenu(false); download(`${c.name || 'contact'}.vcf`, toVCard(c, noteFor(), currentNameFormat()), 'text/x-vcard'); setFlash('Downloaded. Open the file to choose Contacts.') }} />}
        <SheetItem icon="trash" danger label="Delete contact" onClick={() => { setMenu(false); if (confirm('Remove this person?')) removePerson() }} />
        <SheetItem icon="trash" danger label="Delete card" onClick={() => { setMenu(false); if (confirm('Delete the whole card and all its contacts?')) onDelete() }} />
      </Sheet>

      {contacts.length > 1 && (
        <div className="chips scroll">
          {contacts.map((p, i) => <button key={i} className={i === idx ? 'chip on' : 'chip'} onClick={() => setIdx(i)}>{p.name || `Person ${i + 1}`}</button>)}
          <button className="chip" onClick={() => { commit([...contacts, emptyContact()], false); setIdx(contacts.length); setEditing(true) }}><Icon name="plus" size={14} /> Person</button>
        </div>
      )}

      {light && <div className="lightbox" onClick={() => setLight('')}><img src={light} alt="Card" /></div>}
      {card.status === 'error' && <div className="banner">{card.error} {canRead && <button className="link" onClick={onRetry}>Retry</button>}</div>}
      {busy && <p className="muted">Reading card…</p>}

      {card.status === 'done' && !c && (
        <div className="empty small"><p>No contacts were found on this card.</p>
          <button className="cta small" onClick={() => { commit([emptyContact()], false); setIdx(0); setEditing(true) }}><Icon name="plus" size={16} /> Add a contact</button></div>
      )}

      {card.status === 'done' && c && !editing && (
        <>
          <div className="namecard">
            <h1>{c.name || '(no name)'}</h1>
            {c.title && <strong>{c.title}</strong>}
            {c.company && <span className="co">{c.company}</span>}
          </div>

          {flagged && (
            <div className="note attn" role="status">
              <strong>Worth a quick check</strong>
              <ul>{reasons.map((r) => <li key={r}>{r}</li>)}</ul>
              {dupes.length > 0 && <p>Shares a phone or email with: {dupes.map((d) => d.corrected?.map((p) => p.name).filter(Boolean).join(' & ') || 'unnamed card').join('; ')}</p>}
              {card.aiNotes && <p>Reader's note: {card.aiNotes}</p>}
              <button className="link" onClick={() => commit(contacts, true)}>Looks fine</button>
            </div>
          )}

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

          <div className="adders" role="group" aria-label="Add to this contact">
            <button data-adder className={`adder${tagsOpen || (c.tags ?? []).length ? ' on' : ''}`} aria-pressed={tagsOpen} onClick={() => setTagsOpen(!tagsOpen)}>
              <Icon name="tag" size={13} /> Tags{(c.tags ?? []).length > 0 && <b>{(c.tags ?? []).length}</b>}
            </button>
            <button data-adder className={`adder${noteOpen || c.note ? ' on' : ''}`} aria-pressed={noteOpen || !!c.note}
              onClick={() => (c.note ? noteInput.current?.focus() : setNoteOpen(!noteOpen))}>
              <Icon name="note" size={13} /> Notes
            </button>
            <button data-adder className={`adder${followOpen || c.followUp ? ' on' : ''}`} aria-pressed={followOpen || !!c.followUp}
              onClick={() => (c.followUp ? (followInput.current?.showPicker?.() ?? followInput.current?.focus()) : setFollowOpen(!followOpen))}>
              <Icon name="calendar" size={13} /> Follow-up
            </button>
          </div>

          {(c.tags ?? []).length > 0 && (
            <div className="chipline">
              {(c.tags ?? []).map((t) => <button key={t} className="tagchip" onClick={() => patch({ tags: (c.tags ?? []).filter((x) => x !== t) }, false)} aria-label={`Remove tag ${t}`}>{t}<Icon name="x" size={11} /></button>)}
            </div>
          )}
          {tagsOpen && (
            <div className="editor-box" ref={tagsRef}>
              <div className="chipline">
                {SUGGESTED_TAGS.filter((t) => !(c.tags ?? []).includes(t)).map((t) => <button key={t} className="tagchip add" onClick={() => patch({ tags: [...(c.tags ?? []), t] }, false)}>+ {t}</button>)}
              </div>
              <form className="newtag" onSubmit={(e) => { e.preventDefault(); const t = newTag.trim(); if (t) { patch({ tags: [...new Set([...(c.tags ?? []), t])] }, false); setNewTag('') } }}>
                <input value={newTag} onChange={(e) => setNewTag(e.target.value)} placeholder="Your own tag" maxLength={24} aria-label="New tag" />
                <button type="submit" className="tinted small" disabled={!newTag.trim()}>Add</button>
              </form>
            </div>
          )}
          {(c.note || noteOpen) && (
            <div className="editor-box notebox" ref={noteRef}>
              <textarea ref={noteInput} rows={2} autoFocus={noteOpen && !c.note} placeholder="Note, like writing on the back of a card"
                value={c.note ?? ''} onChange={(e) => patch({ note: e.target.value }, false)}
                onBlur={(e) => { if (!e.target.value.trim()) setNoteOpen(false) }} aria-label="Note" />
              <div className="editor-acts">
                {speechSupported && <button className={`mic${listening ? ' on' : ''}`} onClick={dictate} aria-label="Dictate note"><Icon name="mic" size={16} /></button>}
                <button className="x-btn" onClick={() => { patch({ note: '' }, false); setNoteOpen(false) }} aria-label="Remove note"><Icon name="x" size={16} /></button>
              </div>
            </div>
          )}
          {(c.followUp || followOpen) && (
            <div className="editor-box followbox" ref={followRef}>
              <span className="lbl">Follow up on</span>
              <input ref={followInput} type="date" value={c.followUp ?? ''} autoFocus={followOpen && !c.followUp} onChange={(e) => { patch({ followUp: e.target.value }, false); if (!e.target.value) setFollowOpen(false) }} aria-label="Follow-up date" />
              {c.followUp && c.followUp <= today && <small className="due">Due</small>}
              <button className="x-btn" onClick={() => { patch({ followUp: '' }, false); setFollowOpen(false) }} aria-label="Remove follow-up"><Icon name="x" size={16} /></button>
            </div>
          )}

          <h3 className="section">Connection</h3>
          <div className="infos">
            <div className="line"><Icon name="clock" size={18} /><span>Added on {when(card.createdAt)}</span></div>
            <div className="line"><Icon name="camera" size={18} /><span>{eventName ? `Scanned at ${eventName}` : 'Scanned contact'}</span></div>
          </div>
          <div className="field-box pickbox">
            <span>Associated event</span>
            <Picker className="pick flat" title="Associated event" value={card.eventId ?? ''} onChange={onMoveEvent}
              options={[{ value: '', label: 'None' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
          </div>

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
          <button className="outline" style={{ marginTop: 8 }} onClick={finishEditing}>Done</button>
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
