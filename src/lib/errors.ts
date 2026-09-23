export interface ReadFailure {
  /** What the user sees, in plain words with the way out. */
  message: string
  /** Worth trying again by itself: no connection, a busy or stuck reader. A bad photo is not. */
  transient: boolean
}

/** Turns whatever went wrong while reading a card into a message a person can act on, and says whether to retry. */
export function classifyFailure(e: unknown): ReadFailure {
  const status = (e as { status?: number } | null)?.status
  const text = e instanceof Error ? e.message : String(e)
  if (/today's limit/i.test(text)) return { message: text, transient: false }
  if (status === 429) return { message: 'The reader is busy. Trying again shortly.', transient: true }
  if (typeof status === 'number' && status >= 500) return { message: 'The reading service had a problem. Trying again shortly.', transient: true }
  if (/taking too long/i.test(text)) return { message: 'The reader is taking too long. Trying again shortly.', transient: true }
  if (/network error|failed to fetch|load failed|offline/i.test(text)) return { message: 'No connection. It will be read when you are back online.', transient: true }
  if (/^blocked/i.test(text)) return { message: 'This photo could not be read. Try taking it again.', transient: false }
  return { message: 'This card could not be read. Tap to try again.', transient: false }
}
