export interface ReadFailure {
  /** What the user sees, in plain words with the way out. */
  message: string
  /** Worth trying again by itself: no connection, a busy or stuck reader. A bad photo is not. */
  transient: boolean
  /** Not a failure: the card is kept and read once this arrives (cards added, or a sign-in). */
  waiting?: 'cards' | 'sign_in'
  /** Try again after this long (the server's brake said so); the wait is not the card failing. */
  retryAfterMs?: number
}

/** Turns whatever went wrong while reading a card into a message a person can act on, and says whether to retry. */
export function classifyFailure(e: unknown): ReadFailure {
  const status = (e as { status?: number } | null)?.status
  const text = e instanceof Error ? e.message : String(e)
  const code = (e as { code?: string } | null)?.code
  if (code === 'no_cards') return { message: 'Waiting for cards', transient: false, waiting: 'cards' }
  if (code === 'sign_in') return { message: 'Waiting for sign-in', transient: false, waiting: 'sign_in' }
  if (/today's limit/i.test(text)) return { message: text, transient: false }
  if (code === 'rate_limited') {
    const secs = (e as { retryAfter?: number } | null)?.retryAfter
    return { message: 'Waiting a few minutes. Too many scans at once.', transient: true, retryAfterMs: (secs && secs > 0 ? secs : 60) * 1000 }
  }
  if (code === 'unreadable' || status === 422) return { message: 'This card could not be read. Tap to try again.', transient: false }
  if (status === 429) return { message: 'The reader is busy. Trying again shortly.', transient: true }
  if (typeof status === 'number' && status >= 500) return { message: 'The reading service had a problem. Trying again shortly.', transient: true }
  if (/taking too long/i.test(text)) return { message: 'The reader is taking too long. Trying again shortly.', transient: true }
  if (/network error|failed to fetch|load failed|offline/i.test(text)) return { message: 'No connection. It will be read when you are back online.', transient: true }
  if (/^blocked/i.test(text)) return { message: 'This photo could not be read. Try taking it again.', transient: false }
  return { message: 'This card could not be read. Tap to try again.', transient: false }
}
