// Dictation. In the app, the phone's own speech recognition (Android's, through a plugin behind platform.ts's Native
// interface): the WebView the app runs in has no working Web Speech API, and the app had no microphone permission. In a
// browser, the Web Speech API (Chrome). `speechSupported` is false where neither exists.
import { getNative, isApp, notify, type Native } from './platform.ts'

interface Recognition {
  lang: string
  interimResults: boolean
  continuous: boolean
  onresult: ((e: { results: ArrayLike<ArrayLike<{ transcript: string }> & { isFinal: boolean }> }) => void) | null
  onend: (() => void) | null
  onerror: (() => void) | null
  start(): void
  stop(): void
}
type Ctor = new () => Recognition

const Ctor = typeof window === 'undefined' ? undefined
  : (window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition
    ?? (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition

export const speechSupported = isApp || !!Ctor

/**
 * One utterance through the phone's recognizer: the text heard goes to `onText`, then `onEnd` (with the reason when it
 * failed, such as a refused microphone). Returns Stop.
 */
export function dictateNative(n: Pick<Required<Native>, 'listen' | 'stopListening'>, onText: (t: string) => void, onEnd: (why?: string) => void, onPartial?: (t: string) => void): () => void {
  n.listen('en-IN', onPartial).then(
    (t) => { if (t.trim()) onText(t.trim()); onEnd() },
    (e: unknown) => { const why = e instanceof Error ? e.message : String(e); notify(`Dictation did not start: ${why}`); onEnd(why) },
  )
  return () => { void n.stopListening().catch(() => {}) }
}

/** `onPartial` gets the words heard so far, as they arrive, for the listening panel. */
export function startDictation(onText: (t: string) => void, onEnd: (why?: string) => void, onPartial?: (t: string) => void): (() => void) | null {
  const n = getNative()
  if (n?.listen && n.stopListening) return dictateNative({ listen: n.listen, stopListening: n.stopListening }, onText, onEnd, onPartial)
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'en-IN'
  r.interimResults = !!onPartial
  r.continuous = true
  r.onresult = (e) => {
    const done: string[] = [], all: string[] = []
    for (let i = 0; i < e.results.length; i++) { all.push(e.results[i]![0]!.transcript); if (e.results[i]!.isFinal) done.push(e.results[i]![0]!.transcript) }
    onPartial?.(all.join(' ').trim())
    if (done.length === e.results.length && done.length) onText(done.join(' ').trim())
  }
  r.onend = () => onEnd()
  r.onerror = () => onEnd()
  r.start()
  return () => r.stop()
}

/* ---------- a dictation session ---------- */

export interface SessionView { status: 'listening' | 'paused' | 'error'; text: string; live: string; error?: string }

/**
 * Dictation that lasts until Done or Cancel. Android's recognizer hears one utterance and stops at every pause (even a
 * comma), so each time it ends the next utterance is started and the words are joined. Two quiet utterances in a row
 * (about 15 seconds of silence) pause the session rather than closing it; `resume` carries on. A failure (no mic, no
 * recognizer) shows as an error the panel can offer to retry.
 */
export function dictationSession(
  listen: (onPartial: (t: string) => void) => Promise<string>,
  stopNow: () => Promise<void>,
  onView: (v: SessionView) => void,
  quietRounds = 2,
) {
  let text = '', live = '', status: SessionView['status'] = 'listening', error = '', ended = false
  let loopDone: Promise<void> = Promise.resolve()
  const show = () => onView({ status, text, live, ...(error ? { error } : {}) })
  const run = async () => {
    let quiet = 0
    while (status === 'listening' && !ended) {
      live = ''; show()
      let got: string
      try { got = (await listen((t) => { if (!ended) { live = t; show() } })).trim() }
      catch (e) { if (!ended) { status = 'error'; error = e instanceof Error ? e.message : String(e); live = ''; show() } return }
      live = ''
      if (got) { text = text ? `${text} ${got}` : got; quiet = 0 }
      else if (++quiet >= quietRounds) status = 'paused'
      if (!ended) show()
    }
  }
  loopDone = run()
  return {
    resume() {
      if (ended || status === 'listening') return
      status = 'listening'; error = ''
      loopDone = run()
    },
    /** Stops listening, waits for the last words, and returns everything said. */
    async finish(): Promise<string> {
      ended = true
      if (status === 'listening') await stopNow()
      await loopDone
      return text
    },
    cancel() { ended = true; void stopNow() },
  }
}
