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
export function dictateNative(n: Pick<Required<Native>, 'listen' | 'stopListening'>, onText: (t: string) => void, onEnd: (why?: string) => void): () => void {
  n.listen('en-IN').then(
    (t) => { if (t.trim()) onText(t.trim()); onEnd() },
    (e: unknown) => { const why = e instanceof Error ? e.message : String(e); notify(`Dictation did not start: ${why}`); onEnd(why) },
  )
  return () => { void n.stopListening().catch(() => {}) }
}

export function startDictation(onText: (t: string) => void, onEnd: (why?: string) => void): (() => void) | null {
  const n = getNative()
  if (n?.listen && n.stopListening) return dictateNative({ listen: n.listen, stopListening: n.stopListening }, onText, onEnd)
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'en-IN'
  r.interimResults = false
  r.continuous = true
  r.onresult = (e) => {
    const parts: string[] = []
    for (let i = 0; i < e.results.length; i++) if (e.results[i]!.isFinal) parts.push(e.results[i]![0]!.transcript)
    if (parts.length) onText(parts.join(' ').trim())
  }
  r.onend = () => onEnd()
  r.onerror = () => onEnd()
  r.start()
  return () => r.stop()
}
