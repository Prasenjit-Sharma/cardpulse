import { createClient } from '@supabase/supabase-js'
import { isApp } from './platform.ts'

// import.meta.env only exists under Vite; Node's own test runner (which loads this module transitively through
// src/lib/cloudcards.ts and src/lib/leads.ts) leaves it undefined, so read through a guarded fallback.
const env = (import.meta.env as Record<string, string | undefined> | undefined) ?? {}
const url = env.VITE_SUPABASE_URL ?? ''
const key = env.VITE_SUPABASE_PUBLISHABLE_KEY ?? ''

/**
 * `null` when the app was built with no Supabase config. Every cloud feature checks this (directly or via
 * `cloudEnabled`) and hides itself rather than erroring, so a build without cloud config still works exactly as before.
 */
// The app signs in through the system browser and returns with a code (PKCE); it never reads a session from its own URL.
export const supabase = url && key ? createClient(url, key, isApp ? { auth: { flowType: 'pkce', detectSessionInUrl: false } } : undefined) : null
export const cloudEnabled = !!supabase
