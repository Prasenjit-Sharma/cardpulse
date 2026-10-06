import { useEffect, useState, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { getBalance, parseBalance, setBalance, subscribe, type Balance } from './balance'
import { log } from './debug'
import { useOnline } from './useOnline'

let lastError = ''
const errorSubs = new Set<() => void>()
const setError = (e: string) => { lastError = e; errorSubs.forEach((f) => f()) }

/**
 * Asks the server for this account's balance (my_balance, migration 0005). A failure is kept (and written to the
 * diagnostic log) so Plan & cards can say why it has nothing to show, and offer to try again.
 */
export async function refreshBalance(userId: string): Promise<void> {
  if (!supabase) return
  const { data, error } = await supabase.rpc('my_balance')
  if (error) {
    log(`my_balance failed: ${error.code ?? ''} ${error.message}`)
    setError(error.message || 'The server did not answer')
    return
  }
  const b = parseBalance(data)
  if (!b) { log(`my_balance: unexpected answer ${JSON.stringify(data).slice(0, 300)}`); setError('The server sent something unexpected'); return }
  setError('')
  setBalance(b, userId)
}

/** The balance for the signed-in account: fetched on sign-in and when back online; null when signed out. */
export function useBalance(userId: string | undefined): Balance | null {
  const online = useOnline()
  const b = useSyncExternalStore(subscribe, () => (userId ? getBalance(userId) : null))
  useEffect(() => { if (userId && online) void refreshBalance(userId) }, [userId, online])
  return b
}

/** Why the last balance request failed, or '' when it did not. */
export function useBalanceError(): string {
  const [, bump] = useState(0)
  useEffect(() => { const f = () => bump((n) => n + 1); errorSubs.add(f); return () => { errorSubs.delete(f) } }, [])
  return lastError
}

/** The last balance seen for this account, without asking the server (screens that open often, like a contact). */
export function useStoredBalance(userId: string | undefined): Balance | null {
  return useSyncExternalStore(subscribe, () => (userId ? getBalance(userId) : null))
}
