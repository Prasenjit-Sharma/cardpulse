import { useEffect, useRef, useState } from 'react'
import { useBackClose } from '../lib/useBackClose'
import { speechSupported, startDictation } from '../lib/speech'
import { checkFile, checkLink, copyIn, emptyPack, fileSize, loadPack, MAX_FILE_BYTES, MAX_FILES, MAX_LABEL, MAX_NOTE, savePack, type Pack, type PackDraft, type PackFile } from '../lib/visitorpack'
import Icon from './Icon'
import './brief.css'
import './pack.css'

const isStored = (f: PackFile | File): f is PackFile => !(f instanceof File)
const typeName = (t: string) => (t === 'application/pdf' ? 'PDF' : 'Picture')

/**
 * "What visitors get" for one event: a short note, up to 3 files and one web link, shown on the Collect-leads page right
 * after a visitor sends their details. Kept on the server, so it needs sign-in and a connection.
 */
export default function PackPage({ eventId, eventName, userId, online, onClose }: {
  eventId: string; eventName: string; userId: string | undefined; online: boolean; onClose: () => void
}) {
  useBackClose(true, onClose)
  const [saved, setSaved] = useState<Pack | null>(null)
  const [draft, setDraft] = useState<PackDraft>(emptyPack())
  const [loadError, setLoadError] = useState('')
  const [problem, setProblem] = useState('')
  const [busy, setBusy] = useState(false)
  const [flash, setFlash] = useState('')
  const picker = useRef<HTMLInputElement>(null)
  const [listening, setListening] = useState(false)
  const stopListening = useRef<(() => void) | null>(null)
  useEffect(() => () => stopListening.current?.(), [])
  const dictate = () => {
    if (listening) { stopListening.current?.(); return }
    const stop = startDictation((t) => setDraft((d) => ({ ...d, note: [d.note, t].filter(Boolean).join(' ').slice(0, MAX_NOTE) })), () => { setListening(false); stopListening.current = null })
    if (stop) { stopListening.current = stop; setListening(true) }
  }

  const load = () => {
    setLoadError('')
    loadPack(eventId).then((p) => { setSaved(p); setDraft({ ...p, files: [...p.files] }) }).catch((e: Error) => setLoadError(e.message))
  }
  useEffect(() => { if (userId && online) load() }, [userId, online])   // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2200); return () => clearTimeout(t) }, [flash])

  const addFiles = async (list: FileList | null) => {
    setProblem('')
    const room = MAX_FILES - draft.files.length
    const chosen = [...(list ?? [])]
    const tooBig = chosen.find((f) => f.size > MAX_FILE_BYTES)
    if (tooBig) { setProblem(checkFile({ ...tooBig, name: tooBig.name, size: tooBig.size, type: tooBig.type || 'application/pdf' })!); return }
    // read each file now: one from Google Drive can stop being readable before Save ("Failed to fetch")
    let picked: File[]
    try { picked = await Promise.all(chosen.slice(0, room).map(copyIn)) } catch (e) { setProblem(e instanceof Error ? e.message : 'Could not read that file.'); return }
    const bad = picked.map(checkFile).find(Boolean)
    if (bad) { setProblem(bad); return }
    if (chosen.length > room) setProblem(`Up to ${MAX_FILES} files. The first ${room} were added.`)
    setDraft((d) => ({ ...d, files: [...d.files, ...picked] }))
  }
  const link = checkLink(draft.linkUrl)
  const changed = !!saved && JSON.stringify({ ...saved }) !== JSON.stringify({ ...draft, files: draft.files.map((f) => (isStored(f) ? f : f.name)) })
  const save = async () => {
    if (!saved || !userId || 'error' in link) return
    setBusy(true); setProblem('')
    try {
      const p = await savePack(userId, eventId, saved, draft)
      setSaved(p); setDraft({ ...p, files: [...p.files] }); setFlash('Saved. Visitors see it after sending their details.')
    } catch (e) { setProblem(e instanceof Error ? e.message : 'Could not save. Try again.') }
    setBusy(false)
  }

  const blocked = !userId ? 'Sign in from Settings to give visitors files and a link.' : !online ? 'Needs a connection. Your files are kept on the server, so visitors can open them.' : ''
  return (
    <div className="brief-page pack-page" role="dialog" aria-modal="true" aria-label={`What visitors get at ${eventName}`}>
      <header className="bar-top brief-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <div className="brief-title"><strong>What visitors get</strong><small>{eventName}</small></div>
        <span className="pack-top-space" aria-hidden="true" />
      </header>
      <p className="hint pack-intro">Shown on your Collect-leads page right after a visitor sends their details.</p>

      {blocked ? <div className="brief-error" role="status"><p>{blocked}</p></div>
        : loadError ? <div className="brief-error" role="alert"><p>{loadError}</p><button className="outline small" onClick={load}>Try again</button></div>
        : !saved ? <p className="hint pack-intro" role="status">Loading…</p>
        : (
          <>
            <h3 className="group band">Note <span className="band-count num">{draft.note.length}/{MAX_NOTE}</span></h3>
            <div className="log-note pack-note">
              <textarea className="pack-note-input" rows={3} maxLength={MAX_NOTE} value={draft.note} onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                placeholder="A line for visitors, like what the files are and how to reach you" aria-label="Note for visitors" />
              {speechSupported && <button className={`mic${listening ? ' on' : ''}`} onClick={dictate} aria-label={listening ? 'Stop dictating' : 'Dictate note'} aria-pressed={listening}><Icon name="mic" size={16} /></button>}
            </div>

            <h3 className="group band">Files <span className="band-count num">{draft.files.length}/{MAX_FILES}</span></h3>
            <div className="pack-rows edit">
              {draft.files.map((f, i) => (
                <div key={isStored(f) ? f.path : `${f.name}-${i}`} className="pack-row">
                  <span className="badge"><Icon name={f.type === 'application/pdf' ? 'file' : 'image'} size={18} /></span>
                  <span className="grow"><b>{f.name}</b><small>{typeName(f.type)} · {fileSize(f.size)}{isStored(f) ? '' : ' · uploads on Save'}</small></span>
                  <button className="x-btn" onClick={() => setDraft({ ...draft, files: draft.files.filter((_, j) => j !== i) })} aria-label={`Remove ${f.name}`}><Icon name="x" size={16} /></button>
                </div>
              ))}
              {draft.files.length < MAX_FILES && (
                <button className="log-add" onClick={() => picker.current?.click()}><Icon name="plus" size={18} /> Add a PDF or picture</button>
              )}
            </div>
            <input ref={picker} type="file" accept="application/pdf,image/jpeg,image/png,image/webp" multiple hidden
              onChange={(e) => { const files = e.target.files; void addFiles(files).finally(() => { e.target.value = '' }) }} />
            <p className="hint pack-limit">PDF, JPEG, PNG or WebP, up to 10 MB each.</p>

            <h3 className="group band">Web link</h3>
            <div className="log-form pack-link">
              <div className="log-field">
                <span className="log-label">Address</span>
                <input value={draft.linkUrl} onChange={(e) => setDraft({ ...draft, linkUrl: e.target.value })} inputMode="url" placeholder="example.com/page" aria-label="Web link" maxLength={500} />
              </div>
              <div className="log-field">
                <span className="log-label">Button text</span>
                <input value={draft.linkLabel} onChange={(e) => setDraft({ ...draft, linkLabel: e.target.value })} placeholder="Optional, like Visit our website" aria-label="Button text for the link" maxLength={MAX_LABEL} />
              </div>
              {'error' in link && <p className="hint bad">{link.error}</p>}
            </div>

            {problem && <p className="hint bad" role="alert">{problem}</p>}
            <button className="cta wide pack-save" disabled={busy || !changed || 'error' in link} onClick={() => void save()}>{busy ? 'Saving…' : 'Save'}</button>
          </>
        )}
      {flash && <div className="flash brief-flash" role="status">{flash}</div>}
    </div>
  )
}
