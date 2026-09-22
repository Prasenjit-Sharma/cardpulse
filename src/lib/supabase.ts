import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''

/**
 * `null` when the app was built with no Supabase config. Every cloud feature checks this (directly or via
 * `cloudEnabled`) and hides itself rather than erroring, so a build without cloud config still works exactly as before.
 */
export const supabase = url && key ? createClient(url, key) : null
export const cloudEnabled = !!supabase
