import { useMemo, useRef, useState, type ReactNode } from 'react'
import { ACCENTS } from '../lib/accents'
import { buildCardVcf, reachable, type Dropped } from '../lib/cardvcf'
import { preparePhoto } from '../lib/cardphoto'
import { FONTS, MAX_LIST, sanitizeCard, TEMPLATES, type FontId, type MyCard, type TemplateId } from '../lib/mycards'
import { useBackClose } from '../lib/useBackClose'
import CardCanvas from './CardCanvas'
import Icon from './Icon'

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
          <input value={v} inputMode={inputMode} placeholder={placeholder} aria-label={rows.length > 1 ? `${label} ${i + 1}` : label}
            onChange={(e) => onChange(rows.map((x, j) => (j === i ? e.target.value : x)))} />
          {v && <button className="x" onClick={() => onChange(rows.filter((_, j) => j !== i))} aria-label={`Remove ${label.toLowerCase()} ${i + 1}`}><Icon name="x" size={16} /></button>}
        </div>
      ))}
      {rows.length < MAX_LIST && rows[rows.length - 1] !== '' && <button className="link add" onClick={() => onChange([...values, ''])}>+ Add</button>}
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
  const fileRef = useRef<HTMLInputElement>(null)
  const set = (p: Partial<MyCard>) => { setDraft((d) => ({ ...d, ...p })); setDirty(true) }

  const dropped = useMemo(() => buildCardVcf(sanitizeCard(draft)).dropped, [draft])
  const canSave = draft.name.trim().length > 0 && !busy

  const requestClose = (): boolean | void => {
    if (dirty && !confirm('Discard your changes?')) return false
    onClose()
  }
  useBackClose(true, requestClose)

  const pickPhoto = async (f?: File) => {
    if (!f) return
    setPhotoMsg('')
    const photo = await preparePhoto(f)
    if (photo) set({ photo }); else setPhotoMsg('That picture could not be used. Try a JPEG or PNG.')
  }
  const save = async () => { setBusy(true); try { await onSave(sanitizeCard(draft)) } finally { setBusy(false) } }

  return (
    <div className="page-plain card-editor">
      <header className="bar-top">
        <button className="icon-btn ghost" onClick={requestClose} aria-label="Back"><Icon name="back" /></button>
        <span className="grow"><strong>{isNew ? 'New card' : 'Edit card'}</strong></span>
        <button className="cta small" disabled={!canSave} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
      </header>

      <div className="editor-preview"><CardCanvas card={draft} /></div>
      {!draft.name.trim() && <p className="hint" role="status">Add your name to save this card.</p>}

      <h3 className="group">Details</h3>
      <div className="panel">
        <Row label="Card name"><input value={draft.label} placeholder="Work, Personal, Stall" aria-label="Card name" onChange={(e) => set({ label: e.target.value })} /></Row>
        <Row label="Name"><input value={draft.name} aria-label="Name" onChange={(e) => set({ name: e.target.value })} /></Row>
        <Row label="Job title"><input value={draft.title} aria-label="Job title" onChange={(e) => set({ title: e.target.value })} /></Row>
        <Row label="Company"><input value={draft.company} aria-label="Company" onChange={(e) => set({ company: e.target.value })} /></Row>
      </div>
      <div className="panel">
        <ListRows label="Phone" values={draft.phones} placeholder="Enter phone" inputMode="tel" onChange={(v) => set({ phones: v })} />
        <ListRows label="Email" values={draft.emails} placeholder="Enter email" inputMode="email" onChange={(v) => set({ emails: v })} />
        <Row label="Web"><input value={draft.website} placeholder="Enter web" inputMode="url" aria-label="Web" onChange={(e) => set({ website: e.target.value })} /></Row>
        <Row label="Address"><textarea rows={2} value={draft.address} aria-label="Address" onChange={(e) => set({ address: e.target.value })} /></Row>
        <ListRows label="Social" values={draft.social} placeholder="LinkedIn or handle" onChange={(v) => set({ social: v })} />
      </div>
      {!reachable(sanitizeCard(draft)) && <p className="hint" role="status">Add a phone or email so people can reach you.</p>}
      {dropped.length > 0 && <p className="hint" role="status">To keep the QR quick to scan, it leaves out {dropped.map((d) => DROPPED_WORDS[d]).join(' and ')}. They still show on the card.</p>}

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
        <div className="choice-row" role="radiogroup" aria-label="Template">
          {TEMPLATES.map((t) => <button key={t} role="radio" aria-checked={draft.template === t} className="choice" onClick={() => set({ template: t })}>{TEMPLATE_NAME[t]}</button>)}
        </div>
        <span className="accent-label">Accent colour <b>{ACCENTS.find((a) => a.id === draft.accent)?.name}</b></span>
        <div className="accent-row" role="radiogroup" aria-label="Accent colour">
          {ACCENTS.map((a) => (
            <button key={a.id} role="radio" aria-checked={draft.accent === a.id} aria-label={a.name} title={a.name} className="accent-sw"
              style={{ ['--sw' as string]: a.hex, ['--sw-l' as string]: a.lite }} onClick={() => set({ accent: a.id })} />
          ))}
        </div>
        <span className="accent-label">Font <b>{FONT_NAME[draft.font]}</b></span>
        <div className="choice-row" role="radiogroup" aria-label="Font">
          {FONTS.map((f) => <button key={f} role="radio" aria-checked={draft.font === f} className="choice" onClick={() => set({ font: f })}>{FONT_NAME[f]}</button>)}
        </div>
      </div>

      {!isNew && <button className="danger wide" onClick={() => confirm('Delete this card?') && onDelete(card.id)}>Delete card</button>}
    </div>
  )
}
