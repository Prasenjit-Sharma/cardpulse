/** Thin wrapper over the browser's dictation API (Chrome/Android). Returns null where unsupported. */
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

const Ctor = (window as unknown as { SpeechRecognition?: Ctor; webkitSpeechRecognition?: Ctor }).SpeechRecognition
  ?? (window as unknown as { webkitSpeechRecognition?: Ctor }).webkitSpeechRecognition

export const speechSupported = !!Ctor

export function startDictation(onText: (t: string) => void, onEnd: () => void): (() => void) | null {
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
  r.onend = onEnd
  r.onerror = onEnd
  r.start()
  return () => r.stop()
}
