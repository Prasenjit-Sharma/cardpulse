import { useEffect, useSyncExternalStore } from 'react'
import { supabase } from './supabase'
import { getBalance, parseBalance, setBalance, subscribe, type Balance } from './balance'
import { useOnline } from './useOnline'

/** Asks the server for this account's balance (my_balance, migration 0005). Silent when it cannot. */
export async function refreshBalance(userId: string) {
  if (!supabase) return
  const { data, error } = await supabase.rpc('my_balance')
  if (error) return
  const b = parseBalance(data)
  if (b) setBalance(b, userId)
}

/** The balance for the signed-in account: fetched on sign-in and when back online; null when signed out. */
export function useBalance(userId: string | undefined): Balance | null {
  const online = useOnline()
  const b = useSyncExternalStore(subscribe, () => (userId ? getBalance(userId) : null))
  useEffect(() => { if (userId && online) void refreshBalance(userId) }, [userId, online])
  return b
}
