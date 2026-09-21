import { useEffect, useState } from 'react'

/** Keeps the screen on while `active`. Where the phone does not support it, stall mode still works and the screen may dim. */
export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported] = useState(() => typeof navigator !== 'undefined' && 'wakeLock' in navigator)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined
    let gone = false
    const get = async () => { try { lock = await navigator.wakeLock.request('screen') } catch { /* denied, or the page is hidden: nothing to do */ } }
    void get()
    const again = () => { if (document.visibilityState === 'visible' && !gone) void get() }          // the lock is dropped when the page is hidden
    document.addEventListener('visibilitychange', again)
    return () => { gone = true; document.removeEventListener('visibilitychange', again); void lock?.release() }
  }, [active])
  return { supported }
}
