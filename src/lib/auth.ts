import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { APP_AUTH_REDIRECT, authCodeFromUrl, getNative, isApp } from './platform'

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
  const n = isApp ? getNative() : null
  if (!n) { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); return }
  // Google refuses sign-in inside a WebView: open the system browser, and come back through the app's own link
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_AUTH_REDIRECT, skipBrowserRedirect: true } })
  if (error || !data.url) throw error ?? new Error('Sign-in could not start')
  await n.openUrl(data.url)
}

/** Inside the app: finish a sign-in when Google sends the user back. Called once from main.tsx. */
export function startAppAuth(): void {
  const n = getNative()
  if (!n || !supabase) return
  n.onAppUrl((url) => {
    const code = authCodeFromUrl(url)
    void n.closeBrowser()
    if (code) void supabase!.auth.exchangeCodeForSession(code)
  })
}
export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
