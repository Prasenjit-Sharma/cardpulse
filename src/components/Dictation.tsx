import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { getNative } from '../lib/platform'
import { dictationSession, startDictation, type SessionView } from '../lib/speech'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'
import './dictation.css'

const BEAT = 'M0 40 H150 L164 40 L174 18 L188 62 L200 8 L212 40 H250 L258 32 L266 40 H400'
const LABEL: Record<SessionView['status'], string> = { listening: 'Listening', paused: 'Paused', error: 'Could not listen' }
const HINT: Record<SessionView['status'], string> = {
  listening: 'Keep talking; pauses are fine. Tap Done when you finish.',
  paused: 'Paused after a quiet spell. Tap the mic to carry on.',
  error: 'Tap the mic to try again.',
}

/**
 * The listening panel: stays open until Done or Cancel. The CardPulse beat runs while the phone listens; the words
 * already caught are set in ink and the words still being recognised in indigo, the app's colour for live.
 */
function DictationPanel({ view, finishing, onDone, onCancel, onResume }: { view: SessionView; finishing: boolean; onDone: () => void; onCancel: () => void; onResume: () => void }) {
  useBackClose(true, onCancel)
  const live = view.status === 'listening'
  const empty = !view.text && !view.live
  return createPortal(
    <div className="dict-wrap" role="dialog" aria-modal="true" aria-label="Dictation">
      <div className="scrim" />
      <div className={`dict is-${view.status}`}>
        <div className="dict-top">
          <span className="dict-live" aria-hidden="true" />
          <strong>{LABEL[view.status]}</strong>
          <small>English (India)</small>
        </div>
        <svg className="dict-beat" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true">
          <path className="base" d={BEAT} />
          {live && <path className="run" d={BEAT} pathLength="1" />}
        </svg>
        <p className={`dict-words${empty ? ' empty' : ''}`} aria-live="polite">
          {empty
            ? (view.status === 'error' ? view.error : live ? 'Start speaking…' : 'Tap the mic to talk')
            : <>{view.text}{view.text && view.live ? ' ' : ''}<span className="dict-now">{view.live}</span></>}
        </p>
        {view.status === 'error' && !empty && <p className="dict-err">{view.error}</p>}
        <p className="dict-hint">{HINT[view.status]}</p>
        <div className="dict-acts">
          <button className="outline" onClick={onCancel}>Cancel</button>
          <button className={`dict-mic${live ? ' on' : ''}`} onClick={live ? undefined : onResume} disabled={live}
            aria-label={live ? 'Listening' : 'Carry on talking'}>
            <Icon name="mic" size={24} />
          </button>
          <button className="cta" onClick={onDone} disabled={finishing}>{finishing ? 'Adding…' : 'Done'}</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Dictation for a note: `toggle` for the mic key, `listening` while the panel is open, and `panel` to render. */
export function useDictation(add: (text: string) => void) {
  const [view, setView] = useState<SessionView | null>(null)
  const [finishing, setFinishing] = useState(false)
  const session = useRef<ReturnType<typeof dictationSession> | null>(null)
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => () => session.current?.cancel(), [])

  const start = () => {
    if (session.current) return
    const n = getNative()
    let webStop: (() => void) | null = null
    const listen = n?.listen ? (p: (t: string) => void) => n.listen!('en-IN', p)
      : (p: (t: string) => void) => new Promise<string>((resolve) => {
        let last = ''
        webStop = startDictation((t) => { last = t }, () => resolve(last), p)
        if (!webStop) resolve('')
      })
    const stopNow = n?.stopListening ? () => n.stopListening!() : async () => { webStop?.() }
    setView({ status: 'listening', text: '', live: '' })
    session.current = dictationSession(listen, stopNow, (v) => setView({ ...v }))
  }
  const done = async () => {
    const s = session.current
    if (!s) return
    session.current = null
    setFinishing(true)
    const text = await s.finish()
    setFinishing(false)
    setView(null)
    if (text) addRef.current(text)
  }
  const cancel = () => { session.current?.cancel(); session.current = null; setView(null) }
  return {
    listening: !!view,
    toggle: () => (view ? void done() : start()),
    panel: view ? <DictationPanel view={view} finishing={finishing} onDone={() => void done()} onCancel={cancel} onResume={() => session.current?.resume()} /> : null,
  }
}
