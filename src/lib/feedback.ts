/** Where feedback goes when the phone cannot share it. Set this to a real address once there is one. */
export const SUPPORT_EMAIL = ''

export interface Diagnostics {
  version: string
  userAgent: string
  online: boolean
  installed: boolean
  screen: string
  cards: { total: number; failed: number; waiting: number }
  settings: { keepPhotos: string; theme: string; ownKey: boolean }
  failures: string[]
  recentLog: string[]
}

/**
 * The report a person sends: what they wrote, and, only if they agree, a plain summary of how the app is doing.
 * It never contains names, numbers, emails, photos or the API key.
 */
export function buildFeedback(message: string, diag?: Diagnostics): string {
  const out = [message.trim() || '(no message)']
  if (diag) {
    out.push('', '--- Diagnostics (no contact details) ---',
      `App: CardPulse v${diag.version}${diag.installed ? ' (installed)' : ' (browser)'}`,
      `Device: ${diag.userAgent}`, `Screen: ${diag.screen}`, `Online: ${diag.online ? 'yes' : 'no'}`,
      `Cards: ${diag.cards.total} total, ${diag.cards.failed} failed, ${diag.cards.waiting} waiting`,
      `Settings: photos=${diag.settings.keepPhotos}, theme=${diag.settings.theme}, own key=${diag.settings.ownKey ? 'yes' : 'no'}`)
    if (diag.failures.length) out.push('Recent read errors:', ...diag.failures.map((f) => `  - ${f}`))
    if (diag.recentLog.length) out.push('Recent activity:', ...diag.recentLog.map((l) => `  ${l}`))
  }
  return out.join('\n')
}

export type Sent = 'shared' | 'mailed' | 'copied'

/** The share sheet where there is one (WhatsApp, Gmail), else a ready-addressed email, else the clipboard. */
export async function sendFeedback(text: string): Promise<Sent> {
  if (navigator.share) {
    try { await navigator.share({ title: 'CardPulse feedback', text }); return 'shared' } catch (e) { if ((e as Error)?.name === 'AbortError') throw e }
  }
  if (SUPPORT_EMAIL) {
    location.href = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('CardPulse feedback')}&body=${encodeURIComponent(text.slice(0, 1800))}`
    return 'mailed'
  }
  await navigator.clipboard.writeText(text)
  return 'copied'
}
