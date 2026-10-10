import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase.ts'
import { withTimeout } from './withTimeout.ts'

/**
 * The sign-in token for the reading service, made to survive a weak signal. Supabase renews the token every hour, and on a
 * bad network that renewal can fail or hang; before this, a signed-in user then looked signed out ("Waiting for sign-in").
 * Now: a renewal gets a few seconds, and if it does not answer, the last good token is used (the server is the judge), and
 * the app remembers it is signed in until Supabase itself says the sign-in ended.
 */
export interface TokenSource {
  /** A token to send: a fresh one if it comes in time, else the last good one; undefined only when signed out. */
  get: () => Promise<string | undefined>
  /** Ask for a new token now (after the server refused an old one); the same fallbacks as `get`. */
  renew: () => Promise<string | undefined>
  /** This phone holds a sign-in, whatever the network is doing. */
  signedIn: () => boolean
  /** Keep a session the app was told about (sign-in, renewal), or forget it on sign-out (null). */
  note: (s: Pick<Session, 'access_token'> | null) => void
}

type Fetch = () => Promise<Pick<Session, 'access_token'> | null>

export function makeTokenSource(current: Fetch, refresh: Fetch, timeoutMs = 4000): TokenSource {
  let last: string | undefined
  // undefined: no answer in time (or an error), so fall back; null: Supabase answered that there is no session
  const ask = async (f: Fetch) => {
    const s = await withTimeout(f().then((x) => x ?? null), timeoutMs, undefined)
    if (s) last = s.access_token
    return s === undefined ? last : s?.access_token ?? last
  }
  return {
    get: () => ask(current),
    renew: () => ask(refresh),
    signedIn: () => !!last,
    note: (s) => { last = s?.access_token || undefined },
  }
}

export const tokens: TokenSource = makeTokenSource(
  async () => (supabase ? (await supabase.auth.getSession()).data.session : null),
  async () => (supabase ? (await supabase.auth.refreshSession()).data.session : null),
)

// Supabase says when a sign-in starts, renews or ends; SIGNED_OUT is the only thing that makes the app forget the token
supabase?.auth.onAuthStateChange((event, s) => { if (event === 'SIGNED_OUT') tokens.note(null); else if (s) tokens.note(s) })
