import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'
import { APP_AUTH_REDIRECT, finishAppSignIn, getNative, isApp, notify } from './platform'

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

/**
 * Inside the app: finish a sign-in when Google sends the user back. Called once from main.tsx. The return arrives as a
 * link while the app runs, or, when Android closed the app while the user was in the browser, as the link it started with.
 */
export function startAppAuth(): void {
  const n = getNative()
  if (!n || !supabase) return
  const finish = (url: string) => finishAppSignIn(url, {
    exchange: async (code) => ({ error: (await supabase!.auth.exchangeCodeForSession(code)).error }),
    close: () => n.closeBrowser(),
    notify,
  })
  n.onAppUrl((url) => void finish(url))
  void n.launchUrl().then((url) => { if (url) void finish(url) })
}
export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
