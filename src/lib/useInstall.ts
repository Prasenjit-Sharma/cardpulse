import { useEffect, useState } from 'react'

interface InstallEvent extends Event { prompt(): Promise<void>; userChoice: Promise<{ outcome: string }> }

const DISMISS = 'cardpulse.installDismissed'
const standalone = () => window.matchMedia('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true
const isIos = () => /iphone|ipad|ipod/i.test(navigator.userAgent)

/** Install affordance: a native prompt where the browser offers one, a how-to hint on iOS, nothing once installed. */
export function useInstall() {
  const [evt, setEvt] = useState<InstallEvent | null>(null)
  const [dismissed, setDismissed] = useState(() => { try { return localStorage.getItem(DISMISS) === '1' } catch { return false } })

  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e as InstallEvent) }
    window.addEventListener('beforeinstallprompt', on)
    window.addEventListener('appinstalled', () => setEvt(null))
    return () => window.removeEventListener('beforeinstallprompt', on)
  }, [])

  const installed = standalone()
  const mode: 'native' | 'ios' | null = installed ? null : evt ? 'native' : isIos() ? 'ios' : null
  return {
    mode,
    visible: mode !== null && !dismissed,
    install: async () => { if (!evt) return; await evt.prompt(); setEvt(null) },
    dismiss: () => { setDismissed(true); try { localStorage.setItem(DISMISS, '1') } catch { /* ignore */ } },
  }
}
