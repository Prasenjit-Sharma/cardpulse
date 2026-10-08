import type { ReadFailure } from './errors'

export const MAX_ATTEMPTS = 3
export const RETRY_DELAY_MS = 30_000

/**
 * When to read a failed card again, and whether that try uses up one of its attempts. A brake wait does not: it is the
 * server pacing the account, not the card failing. Being offline does not either.
 */
export function nextRetry(f: ReadFailure, online: boolean): { delayMs: number; countsAsAttempt: boolean } {
  if (f.retryAfterMs) return { delayMs: f.retryAfterMs, countsAsAttempt: false }
  return { delayMs: RETRY_DELAY_MS, countsAsAttempt: online }
}
