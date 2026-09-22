import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** The current session, kept live. `null` whether signed out or cloud is not configured at all. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })
}
export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
