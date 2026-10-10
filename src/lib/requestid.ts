/**
 * Request ids that let the server charge a read or a brief once, however many times a weak signal makes the app send it.
 * A read's id comes from its card ids (order does not matter), so every retry of those photos, even after a restart,
 * carries the same id; a brief gets a new id per tap, kept across that tap's retries.
 */
export async function requestIdFor(cardIds: string[]): Promise<string> {
  const bytes = new TextEncoder().encode([...cardIds].sort().join(','))
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes))
  return 'read:' + Array.from(hash.slice(0, 16), (b) => b.toString(16).padStart(2, '0')).join('')
}

export const newRequestId = (prefix = 'brief'): string =>
  `${prefix}:${typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`}`
