import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { log } from '../lib/debug'
import { getNative } from '../lib/platform'
import { nativeDictation, webDictation, type Dictation } from '../lib/speech'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'
import './dictation.css'

const BEAT = 'M0 40 H150 L164 40 L174 18 L188 62 L200 8 L212 40 H250 L258 32 L266 40 H400'
type Status = 'starting' | 'listening' | 'error'
interface View { status: Status; text: string; error?: string }
const LABEL: Record<Status, string> = { starting: 'Getting ready', listening: 'Listening', error: 'Could not listen' }

/**
 * The listening panel: stays open until Done or Cancel, listening through pauses. The Pulse beat rises with the
 * voice (the microphone level), the words build up as they are heard, and an indigo cursor marks it is live.
 */
function DictationPanel({ view, level, finishing, onDone, onCancel, onRetry }: {
  view: View; level: number; finishing: boolean; onDone: () => void; onCancel: () => void; onRetry: () => void
}) {
  useBackClose(true, onCancel)
  const live = view.status === 'listening'
  return createPortal(
    <div className="dict-wrap" role="dialog" aria-modal="true" aria-label="Dictation">
      <div className="scrim" />
      <div className={`dict is-${view.status}`} style={{ ['--level' as string]: live ? level : 0 }}>
        <div className="dict-top">
          <span className="dict-live" aria-hidden="true" />
          <strong>{LABEL[view.status]}</strong>
          <small>English (India)</small>
        </div>
        <svg className="dict-beat" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true">
          <path className="base" d={BEAT} />
          <path className="run" d={BEAT} pathLength="1" />
        </svg>
        <p className={`dict-words${view.text ? '' : ' empty'}`} aria-live="polite">
          {view.text || (view.status === 'error' ? view.error : view.status === 'starting' ? 'One moment…' : 'Start speaking…')}
          {live && <span className="dict-caret" aria-hidden="true" />}
        </p>
        {view.status === 'error' && view.text && <p className="dict-err">{view.error}</p>}
        <p className="dict-hint">{view.status === 'error' ? 'Tap the mic to try again; what you said is kept.' : 'Pauses are fine. Tap Done when you finish.'}</p>
        <div className="dict-acts">
          <button className="outline" onClick={onCancel}>Cancel</button>
          <button className={`dict-mic${live ? ' on' : ''}`} onClick={view.status === 'error' ? onRetry : undefined} disabled={view.status !== 'error'}
            aria-label={view.status === 'error' ? 'Try again' : 'Listening'}>
            <Icon name="mic" size={24} />
          </button>
          <button className="cta" onClick={onDone} disabled={finishing || view.status === 'starting'}>{finishing ? 'Adding…' : 'Done'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Dictation for a note: `toggle` for the mic key, `listening` while the panel is open, and `panel` to render. */
export function useDictation(add: (text: string) => void) {
  const [view, setView] = useState<View | null>(null)
  const [level, setLevel] = useState(0)
  const [finishing, setFinishing] = useState(false)
  const session = useRef<Dictation | null>(null)
  const kept = useRef('')                       // words from before a retry
  const open = useRef(false)
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => () => { open.current = false; void session.current?.cancel() }, [])

  const join = (t: string) => [kept.current, t].filter(Boolean).join(' ')
  const begin = async () => {
    setView((v) => ({ status: 'starting', text: v?.text ?? kept.current }))
    const n = getNative()
    try {
      if (n?.speech) {
        session.current = await nativeDictation(n.speech, {
          lang: 'en-IN',
          onText: (t) => setView((v) => (v ? { ...v, status: 'listening', text: join(t) } : v)),
          onLevel: setLevel,
          onLog: log,
          onError: (m) => {
            void session.current?.cancel(); session.current = null
            setView((v) => { if (!v) return v; kept.current = v.text; return { ...v, status: 'error', error: m } })
          },
        })
      } else {
        let heard = ''
        const stop = webDictation((t) => { heard = t; setView((v) => (v ? { ...v, status: 'listening', text: join(t) } : v)) }, () => {})
        if (!stop) throw new Error('This browser cannot dictate.')
        session.current = { finish: async () => { stop(); return heard }, cancel: async () => { stop() } }
      }
      if (!open.current) { void session.current?.cancel(); session.current = null; return }
      setView((v) => (v ? { ...v, status: 'listening' } : v))
    } catch (e) {
      log(`dictation could not start: ${e instanceof Error ? e.message : String(e)}`)
      setView((v) => (v ? { ...v, status: 'error', error: e instanceof Error ? e.message : String(e) } : v))
    }
  }
  const start = () => { if (open.current) return; open.current = true; kept.current = ''; void begin() }
  const done = async () => {
    const s = session.current
    session.current = null
    setFinishing(true)
    const last = s ? await s.finish() : ''
    const text = s ? join(last) : (view?.text ?? kept.current)
    setFinishing(false)
    open.current = false; kept.current = ''
    setView(null); setLevel(0)
    if (text.trim()) addRef.current(text.trim())
  }
  const cancel = () => { open.current = false; kept.current = ''; void session.current?.cancel(); session.current = null; setView(null); setLevel(0) }
  const retry = () => { if (view?.status === 'error') { kept.current = view.text; void begin() } }
  return {
    listening: !!view,
    toggle: () => (view ? void done() : start()),
    panel: view ? <DictationPanel view={view} level={level} finishing={finishing} onDone={() => void done()} onCancel={cancel} onRetry={retry} /> : null,
  }
}
