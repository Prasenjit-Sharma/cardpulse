// Dictation. In the app: the phone's own speech recognizer through Capgo's speech plugin (platform.ts's Native.speech),
// in its continuous mode, which keeps listening across pauses until Done, carries the text over its restarts, mutes
// the restart beep, and reports errors and the microphone level. In a browser: the Web Speech API (Chrome).
import { isApp, type SpeechPlugin } from './platform.ts'

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

/** Whether dictation is offered: always in the app (through the plugin), in a browser when it has the Web Speech API. */
export const speechSupported = isApp || !!Ctor

export interface DictationHandlers {
  lang: string
  /** Everything heard so far in this session. */
  onText: (text: string) => void
  /** The microphone level, 0 to 1, a few times a second. */
  onLevel?: (level: number) => void
  /** A failure while listening (not silence, which the plugin listens through). */
  onError: (message: string) => void
}

export interface Dictation {
  /** Stops listening, waits for the last words (at most `waitMs`), and returns everything said. */
  finish(waitMs?: number): Promise<string>
  /** Stops and drops the words. */
  cancel(): Promise<void>
}

/**
 * Starts continuous dictation through the speech plugin. Rejects when the microphone is refused, the phone has no
 * recognizer, or the start fails, so the panel can say so.
 */
export async function nativeDictation(p: SpeechPlugin, h: DictationHandlers): Promise<Dictation> {
  if ((await p.requestPermissions()).speechRecognition !== 'granted') throw new Error('The microphone is not allowed. Allow it in Settings, Apps, CardPulse, Permissions.')
  if (!(await p.available()).available) throw new Error('This phone has no speech recognition. Install or update the Google app.')
  await p.removeAllListeners()
  let text = ''
  let stopped: (() => void) | null = null
  await p.addListener('partialResults', (e: { accumulatedText?: string; matches?: string[] }) => {
    const t = (e.accumulatedText ?? e.matches?.[0] ?? '').trim()
    if (t) { text = t; h.onText(t) }
  })
  await p.addListener('audioLevel', (e: { level?: number }) => { if (typeof e.level === 'number') h.onLevel?.(e.level) })
  await p.addListener('error', (e: { message?: string; code?: string }) => h.onError(e.message || e.code || 'The speech service stopped.'))
  await p.addListener('listeningState', (e: { state?: string; status?: string }) => { if ((e.state ?? e.status) === 'stopped') stopped?.() })
  await p.setPTTState({ held: true })
  try {
    await p.start({ language: h.lang, maxResults: 1, partialResults: true, popup: false, continuousPTT: true, muteRecognizerBeep: true })
  } catch (e) {
    await p.setPTTState({ held: false }).catch(() => {})
    await p.removeAllListeners().catch(() => {})
    throw e instanceof Error ? e : new Error(String(e))
  }
  const end = async () => { await p.removeAllListeners().catch(() => {}) }
  return {
    async finish(waitMs = 1500) {
      const done = new Promise<void>((resolve) => { stopped = resolve; setTimeout(resolve, waitMs) })
      await p.setPTTState({ held: false }).catch(() => {})
      await p.stop().catch(() => {})
      await done
      await end()
      return text
    },
    async cancel() {
      await p.setPTTState({ held: false }).catch(() => {})
      await p.stop().catch(() => {})
      await end()
    },
  }
}

/** Browser dictation (Web Speech API), continuous: `onText` gets everything heard so far. Returns Stop, or null. */
export function webDictation(onText: (t: string) => void, onEnd: () => void): (() => void) | null {
  if (!Ctor) return null
  const r = new Ctor()
  r.lang = 'en-IN'
  r.interimResults = true
  r.continuous = true
  r.onresult = (e) => {
    const all: string[] = []
    for (let i = 0; i < e.results.length; i++) all.push(e.results[i]![0]!.transcript)
    onText(all.join(' ').replace(/\s+/g, ' ').trim())
  }
  r.onend = onEnd
  r.onerror = onEnd
  r.start()
  return () => r.stop()
}
