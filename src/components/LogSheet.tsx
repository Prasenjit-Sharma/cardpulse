import { useEffect, useRef, useState } from 'react'
import { MAX_NOTE, PRESETS, localISO, newEntry, presetDate, type Interaction, type Kind, type Outcome, type Preset } from '../lib/followups'
import { speechSupported, startDictation } from '../lib/speech'
import Icon from './Icon'
import Sheet from './Sheet'

const KINDS: { id: Kind; label: string }[] = [{ id: 'call', label: 'Call' }, { id: 'meeting', label: 'Meeting' }, { id: 'message', label: 'Message' }]
const OUTCOMES: { id: Outcome; label: string }[] = [{ id: 'connected', label: 'Connected' }, { id: 'no-answer', label: 'No answer' }, { id: 'call-back', label: 'Call back' }]
type Next = 'none' | Preset | 'date'

/** Log what just happened with a contact and when to follow up next, in a few taps. */
export default function LogSheet({ name, onSave, onClose }: { name: string; onSave: (e: Interaction) => void; onClose: () => void }) {
  const [kind, setKind] = useState<Kind>('call')
  const [outcome, setOutcome] = useState<Outcome | undefined>()
  const [note, setNote] = useState('')
  const [next, setNext] = useState<Next>('none')
  const [date, setDate] = useState('')
  const [listening, setListening] = useState(false)
  const stop = useRef<(() => void) | null>(null)
  useEffect(() => () => stop.current?.(), [])

  const nextISO = next === 'none' ? undefined : next === 'date' ? date || undefined : presetDate(next)
  const canSave = note.trim().length > 0 || !!outcome || !!nextISO

  const dictate = () => {
    if (listening) { stop.current?.(); return }
    const s = startDictation((t) => setNote((n) => [n, t].filter(Boolean).join(' ').slice(0, MAX_NOTE)), () => { setListening(false); stop.current = null })
    if (s) { stop.current = s; setListening(true) }
  }
  const save = () => { stop.current?.(); onSave(newEntry({ kind, outcome, note, next: nextISO })) }

  return (
    <Sheet open onClose={onClose} title={`Log with ${name || 'this contact'}`}>
      <div className="log-form">
        <div className="choice-row" role="group" aria-label="What happened">
          {KINDS.map((k) => <button key={k.id} className="choice" aria-pressed={kind === k.id} onClick={() => { setKind(k.id); if (k.id !== 'call') setOutcome(undefined) }}>{k.label}</button>)}
        </div>

        {kind === 'call' && (
          <div className="choice-row" role="group" aria-label="How it went">
            {OUTCOMES.map((o) => <button key={o.id} className="choice" aria-pressed={outcome === o.id} onClick={() => setOutcome(outcome === o.id ? undefined : o.id)}>{o.label}</button>)}
          </div>
        )}

        <div className="log-note">
          <textarea rows={3} value={note} maxLength={MAX_NOTE} onChange={(e) => setNote(e.target.value)} placeholder="What was said? Like writing on the back of a card" aria-label="Note" />
          {speechSupported && <button className={`mic${listening ? ' on' : ''}`} onClick={dictate} aria-label={listening ? 'Stop dictating' : 'Dictate note'} aria-pressed={listening}><Icon name="mic" size={16} /></button>}
        </div>

        <span className="accent-label">Follow up again</span>
        <div className="choice-row" role="group" aria-label="Next follow-up">
          <button className="choice" aria-pressed={next === 'none'} onClick={() => setNext('none')}>No follow-up</button>
          {PRESETS.map((p) => <button key={p.id} className="choice" aria-pressed={next === p.id} onClick={() => setNext(p.id)}>{p.label}</button>)}
          <button className="choice" aria-pressed={next === 'date'} onClick={() => setNext('date')}>Pick a date</button>
        </div>
        {next === 'date' && <input type="date" value={date} min={localISO()} onChange={(e) => setDate(e.target.value)} aria-label="Follow-up date" autoFocus />}

        <button className="cta wide" disabled={!canSave} onClick={save}>Save</button>
      </div>
    </Sheet>
  )
}
