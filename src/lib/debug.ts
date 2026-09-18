/** Tiny on-screen diagnostics: survives page reloads (sessionStorage) so we can see if the page is being reloaded. */
const KEY = 'cardpulse.debug'
const listeners = new Set<() => void>()

export function readLog(): string[] {
  try { return JSON.parse(sessionStorage.getItem(KEY) ?? '[]') } catch { return [] }
}
export function log(msg: string) {
  const line = `${new Date().toLocaleTimeString()} ${msg}`
  try { sessionStorage.setItem(KEY, JSON.stringify([...readLog(), line].slice(-40))) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export function clearLog() {
  try { sessionStorage.removeItem(KEY) } catch { /* ignore */ }
  listeners.forEach((l) => l())
}
export function subscribe(fn: () => void) { listeners.add(fn); return () => { listeners.delete(fn) } }

window.addEventListener('error', (e) => log(`ERROR ${e.message}`))
window.addEventListener('unhandledrejection', (e) => log(`REJECTION ${e.reason?.name ?? ''} ${e.reason?.message ?? e.reason}`))
log(`page loaded (${location.protocol}, secure=${window.isSecureContext})`)
