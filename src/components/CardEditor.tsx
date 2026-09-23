import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ACCENTS } from '../lib/accents'
import { cardQr } from '../lib/cardqr'
import { reachable, type Dropped } from '../lib/cardvcf'
import { preparePhoto } from '../lib/cardphoto'
import { FONTS, MAX_LIST, sanitizeCard, TEMPLATES, type FontId, type MyCard, type TemplateId } from '../lib/mycards'
import { useBackClose } from '../lib/useBackClose'
import CardCanvas from './CardCanvas'
import Icon from './Icon'
import { confirmAsk } from './Dialog'

const TEMPLATE_NAME: Record<TemplateId, string> = { ledger: 'Ledger', header: 'Header', split: 'Split', noir: 'Noir', bold: 'Bold' }
const FONT_NAME: Record<FontId, string> = { archivo: 'Archivo', inter: 'Inter' }
const DROPPED_WORDS: Record<Dropped, string> = { social: 'social links', address: 'address', emails: 'extra emails', phones: 'extra phone numbers' }

function Row({ label, children }: { label: string; children: ReactNode }) {
  return <div className="frow" role="group" aria-label={label}><span aria-hidden="true">{label}</span><div>{children}</div></div>
}

/** Up to three values in one field group, each its own input, with a way to add another. */
function ListRows({ label, values, placeholder, inputMode, onChange }: {
  label: string; values: string[]; placeholder: string; inputMode?: 'tel' | 'email' | 'url'; onChange: (v: string[]) => void
}) {
  const rows = values.length ? values : ['']
  return (
    <Row label={label}>
      {rows.map((v, i) => (
        <div key={i} className="lrow">
          <input value={v} inputMode={inputMode} placeholder={placeholder} maxLength={120} aria-label={rows.length > 1 ? `${label} ${i + 1}` : label}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))} />
          {v && <button className="x" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}><Icon name="x" size={16} /></button>}
        </div>
      ))}
      {rows.length < MAX_LIST && rows[rows.length - 1] !== '' && <button className="link add with-icon" onClick={() => onChange([...values, ''])}><Icon name="plus" size={14} /> Add</button>}
    </Row>
  )
}

/** Make or change one card. A live preview stays in view while the fields below it change. */
export default function CardEditor({ card, isNew, onSave, onDelete, onClose }: {
  card: MyCard
  isNew: boolean
  onSave: (c: MyCard) => Promise<void>
  onDelete: (id: string) => void
  onClose: () => void
}) {
  const [draft, setDraft] = useState<MyCard>(card)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [photoMsg, setPhotoMsg] = useState('')
  const [saveError, setSaveError] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (p: Partial<MyCard>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true) }

  const qr = useMemo(() => cardQr(draft), [draft])
  const dropped = qr.dropped
  const canSave = draft.name.trim().length > 0 && !busy

  const requestClose = (): boolean | void => {
    // Back stays on this screen while the question is open; the answer then closes it or not.
    if (dirty) { void confirmAsk({ title: 'Discard your changes?', confirmLabel: 'Discard', cancelLabel: 'Keep editing', danger: true }).then((ok) => ok && onClose()); return false }
    onClose()
  }
  useBackClose(true, requestClose)

  const pickPhoto = async (f?: File) => {
    if (!f) return
    setPhotoMsg('')
    const photo = await preparePhoto(f)
    if (photo) set({ photo }); else setPhotoMsg('That picture could not be used. Try a JPEG or PNG.')
  }
  const save = async () => {
    setBusy(true); setSaveError(false)
    try { await onSave(sanitizeCard(draft)) } catch { setSaveError(true) } finally { setBusy(false) }
  }

  return (
    <div className="page-plain card-editor">
      <header className="bar-top">
        <button className="icon-btn ghost" onClick={requestClose} aria-label="Back"><Icon name="back" /></button>
        <span className="grow"><strong>{isNew ? 'New card' : 'Edit card'}</strong></span>
        <button className="cta small" disabled={!canSave} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </header>

      <div className="editor-preview"><CardCanvas card={draft} /></div>
      {!draft.name.trim() && <p className="hint" role="status">Add your name to save this card.</p>}
      {saveError && <p className="hint bad" role="alert">Could not save the card. Check that the phone has free space, then try again.</p>}

      <h3 className="group">Details</h3>
      <div className="panel">
        <Row label="Card name"><input value={draft.label} placeholder="Work, Personal, Stall" aria-label="Card name" maxLength={30} onChange={(e) => set({ label: e.target.value })} /></Row>
        <Row label="Name"><input value={draft.name} aria-label="Name" maxLength={80} onChange={(e) => set({ name: e.target.value })} /></Row>
        <Row label="Job title"><input value={draft.title} aria-label="Job title" maxLength={80} onChange={(e) => set({ title: e.target.value })} /></Row>
        <Row label="Company"><input value={draft.company} aria-label="Company" maxLength={80} onChange={(e) => set({ company: e.target.value })} /></Row>
      </div>
      <div className="panel">
        <ListRows label="Phone" values={draft.phones} placeholder="Enter phone" inputMode="tel" onChange={(v) => set({ phones: v })} />
        <ListRows label="Email" values={draft.emails} placeholder="Enter email" inputMode="email" onChange={(v) => set({ emails: v })} />
        <Row label="Web"><input value={draft.website} placeholder="Enter web" inputMode="url" aria-label="Web" maxLength={200} onChange={(e) => set({ website: e.target.value })} /></Row>
        <Row label="Address"><textarea rows={2} value={draft.address} aria-label="Address" maxLength={300} onChange={(e) => set({ address: e.target.value })} /></Row>
        <ListRows label="Social" values={draft.social} placeholder="LinkedIn or handle" onChange={(v) => set({ social: v })} />
      </div>
      {!reachable(sanitizeCard(draft)) && <p className="hint" role="status">Add a phone or email so people can reach you.</p>}
      {qr.trimmed && <p className="hint" role="status">The details are too long for one QR, so it carries a shortened card: name, company, first phone and email.</p>}
      {!qr.trimmed && dropped.length > 0 && <p className="hint" role="status">To keep the QR quick to scan, it leaves out {dropped.map((d) => DROPPED_WORDS[d]).join(' and ')}. They still show on the card.</p>}

      <h3 className="group">Photo or logo</h3>
      <div className="panel photo-row">
        <button className="outline" onClick={() => fileRef.current?.click()}><Icon name="image" size={18} /> {draft.photo ? 'Change picture' : 'Add photo or logo'}</button>
        {draft.photo && <button className="link" onClick={() => { set({ photo: undefined }); setPhotoMsg('') }}>Remove</button>}
        <input ref={fileRef} type="file" accept="image/*" hidden onChange={(e) => { void pickPhoto(e.target.files?.[0]); e.target.value = '' }} />
        {photoMsg && <p className="hint bad" role="alert">{photoMsg}</p>}
      </div>

      <h3 className="group">Design</h3>
      <div className="panel design-panel">
        <span className="accent-label">Template <b>{TEMPLATE_NAME[draft.template]}</b></span>
        <div className="choice-row" role="group" aria-label="Template">
          {TEMPLATES.map((t) => <button key={t} aria-pressed={draft.template === t} className="choice" onClick={() => set({ template: t })}>{TEMPLATE_NAME[t]}</button>)}
        </div>
        <span className="accent-label">Accent colour <b>{ACCENTS.find((a) => a.id === draft.accent)?.name}</b></span>
        <div className="accent-row" role="group" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button key={a.id} aria-pressed={draft.accent === a.id} aria-label={a.name} title={a.name} className="accent-sw"
              style={{ ['--sw' as string]: a.hex, ['--sw-l' as string]: a.lite }} onClick={() => set({ accent: a.id })} />
          ))}
        </div>
        <span className="accent-label">Font <b>{FONT_NAME[draft.font]}</b></span>
        <div className="choice-row" role="group" aria-label="Font">
          {FONTS.map((f) => <button key={f} aria-pressed={draft.font === f} className="choice" onClick={() => set({ font: f })}>{FONT_NAME[f]}</button>)}
        </div>
      </div>

      {!isNew && <button className="danger wide" onClick={() => void confirmAsk({ title: 'Delete this card?', message: 'Its link stops working too.', confirmLabel: 'Delete', danger: true }).then((ok) => ok && onDelete(card.id))}>Delete card</button>}
    </div>
  )
}
