import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { startDictation } from '../lib/speech'
import { useBackClose } from '../lib/useBackClose'
import './dictation.css'

const BEAT = 'M0 40 H150 L164 40 L174 18 L188 62 L200 8 L212 40 H250 L258 32 L266 40 H400'

/**
 * The listening panel: rises from the bottom while the phone listens, with the CardPulse beat running and the words
 * appearing as they are heard. Done keeps them (so does a pause: it stops by itself); Cancel drops them.
 */
function DictationPanel({ heard, onDone, onCancel }: { heard: string; onDone: () => void; onCancel: () => void }) {
  useBackClose(true, onCancel)
  return createPortal(
    <div className="dict-wrap" role="dialog" aria-modal="true" aria-label="Dictation">
      <div className="scrim" onClick={onDone} />
      <div className="dict">
        <div className="dict-top">
          <span className="dict-live" aria-hidden="true" />
          <strong>Listening</strong>
          <small>English (India)</small>
        </div>
        <svg className="dict-beat" viewBox="0 0 400 72" preserveAspectRatio="none" aria-hidden="true">
          <path className="base" d={BEAT} />
          <path className="run" d={BEAT} pathLength="1" />
        </svg>
        <p className={`dict-words${heard ? '' : ' empty'}`} aria-live="polite">{heard || 'Start speaking…'}</p>
        <p className="dict-hint">Pause when you finish; it stops by itself.</p>
        <div className="dict-acts">
          <button className="outline" onClick={onCancel}>Cancel</button>
          <button className="cta" onClick={onDone}>Done</button>
        </div>
      </div>
    </div>,
    document.body,
  )
}

/** Dictation for a note: `toggle` for the mic key, `listening` for its state, and `panel` to render while listening. */
export function useDictation(add: (text: string) => void) {
  const [listening, setListening] = useState(false)
  const [heard, setHeard] = useState('')
  const stop = useRef<(() => void) | null>(null)
  const dropped = useRef(false)
  const addRef = useRef(add)
  addRef.current = add
  useEffect(() => () => { dropped.current = true; stop.current?.() }, [])

  const start = () => {
    dropped.current = false
    setHeard('')
    const s = startDictation(
      (t) => { if (!dropped.current) addRef.current(t) },
      () => { setListening(false); stop.current = null },
      (t) => setHeard(t),
    )
    if (s) { stop.current = s; setListening(true) }
  }
  const done = () => stop.current?.()
  const cancel = () => { dropped.current = true; stop.current?.(); setListening(false) }
  return {
    listening,
    toggle: () => (listening ? done() : start()),
    panel: listening ? <DictationPanel heard={heard} onDone={done} onCancel={cancel} /> : null,
  }
}
