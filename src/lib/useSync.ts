import { useCallback, useEffect, useRef, useState } from 'react'
import { onLocalChange } from './outbox'
import { disableSync, enableSync, loadSyncState, onSyncStatus, resetSyncState, runSync, syncStatus, type SyncStatus } from './sync'

const AFTER_CHANGE_MS = 4000
const EVERY_MS = 5 * 60_000

export interface SyncControl {
  enabled: boolean
  status: SyncStatus
  turnOn: () => Promise<void>
  turnOff: () => Promise<void>
  /** The server copy was deleted: forget this phone's sync position too. */
  cleared: () => Promise<void>
}

/**
 * Runs sync for the signed-in user while it is on: at start, when the network returns, when the app comes back to the
 * foreground, a few seconds after a local change, and every few minutes while open. `onChanged` reloads the app's lists.
 */
export function useSync(userId: string | undefined, online: boolean, onChanged: () => void): SyncControl {
  const [enabled, setEnabled] = useState(false)
  const [status, setStatus] = useState<SyncStatus>(syncStatus)
  const changedRef = useRef(onChanged)
  changedRef.current = onChanged
  useEffect(() => onSyncStatus(setStatus), [])
  useEffect(() => {
    let live = true
    void loadSyncState().then((s) => { if (live) setEnabled(!!userId && s.enabled && s.userId === userId) })
    return () => { live = false }
  }, [userId])

  const run = useCallback(async () => {
    if (!userId) return
    if (await runSync(userId)) changedRef.current()
  }, [userId])

  useEffect(() => {
    if (!enabled) return
    void run()
    let timer = 0
    const soon = () => { clearTimeout(timer); timer = window.setTimeout(() => void run(), AFTER_CHANGE_MS) }
    const off = onLocalChange(soon)
    const onVisible = () => { if (document.visibilityState === 'visible') void run() }
    document.addEventListener('visibilitychange', onVisible)
    const every = window.setInterval(() => { if (document.visibilityState === 'visible') void run() }, EVERY_MS)
    return () => { off(); clearTimeout(timer); clearInterval(every); document.removeEventListener('visibilitychange', onVisible) }
  }, [enabled, run])
  useEffect(() => { if (enabled && online) void run() }, [enabled, online, run])

  return {
    enabled, status,
    turnOn: async () => { if (!userId) return; await enableSync(userId); setEnabled(true) },
    turnOff: async () => { await disableSync(); setEnabled(false) },
    cleared: async () => { await resetSyncState(); setEnabled(false) },
  }
}
