/**
 * The one place that knows whether CardPulse runs as the Android app or in a browser. Pure: native abilities are handed in
 * at start-up (`setNative`, from main.tsx with src/lib/native.ts), so library code and Node tests never load Capacitor.
 */

type CapWindow = { Capacitor?: { isNativePlatform?: () => boolean } }

/** Capacitor puts `window.Capacitor` in its WebView; a browser has none. */
export const detectApp = (w?: CapWindow): boolean => !!w?.Capacitor?.isNativePlatform?.()
export const isApp = detectApp(typeof window === 'undefined' ? undefined : (window as unknown as CapWindow))

// import.meta.env only exists under Vite; Node's test runner leaves it undefined.
const env = (import.meta.env as Record<string, string | undefined> | undefined) ?? {}

/**
 * The address other people open (card links, QR codes, lead links). A browser uses its own page. The app runs on
 * https://localhost, which is useless to anyone else, so it uses the Pages address it was built with.
 */
export function publicBaseFor(app: boolean, loc: { origin: string; pathname: string } | undefined, configured: string | undefined): string {
  if (!app) return (loc?.origin ?? '') + (loc?.pathname ?? '/')
  if (!configured) throw new Error('VITE_PUBLIC_URL is not set for the app build')
  return configured.endsWith('/') ? configured : `${configured}/`
}
export const publicBase = (): string => publicBaseFor(isApp, typeof location === 'undefined' ? undefined : location, env.VITE_PUBLIC_URL)

/* ---------- native abilities, injected by main.tsx inside the app ---------- */

export interface NativeShare { title?: string; text?: string; files?: string[] }
export interface Native {
  /** Writes to the app's cache and returns a file URI the share sheet can read. */
  writeCache(name: string, data: Blob): Promise<string>
  share(o: NativeShare): Promise<void>
  openUrl(url: string): Promise<void>
  closeBrowser(): Promise<void>
  onAppUrl(cb: (url: string) => void): void
  setStatusBar(icons: 'light' | 'dark'): Promise<void>
}
let native: Native | null = null
export const setNative = (n: Native): void => { native = n }
export const getNative = (): Native | null => native

/** A file name Android's cache and every share target accept: letters and their vowel signs in any script, digits, dot, dash, underscore. */
export function cacheName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{M}\p{N}._-]+/gu, '_')
  return clean.startsWith('.') ? `file${clean}` : clean
}

/* ---------- sharing: the same shape as navigator's, so existing code keeps one path ---------- */

export interface ShareNav {
  share?: (d: { title?: string; text?: string; files?: File[] }) => Promise<void>
  canShare?: (d: { files?: File[] }) => boolean
  clipboard?: { writeText(t: string): Promise<void> }
}

/** Android's WebView has neither Web Share nor downloads; this gives the app a navigator-shaped share that works. */
export function makeAppNav(n: Pick<Native, 'writeCache' | 'share'>, clipboard?: ShareNav['clipboard']): ShareNav {
  return {
    canShare: () => true,
    clipboard,
    share: async ({ title, text, files }) => {
      const uris = files?.length ? await Promise.all(files.map((f) => n.writeCache(cacheName(f.name), f))) : undefined
      try { await n.share({ title, text, files: uris }) }
      catch (e) {
        // Capacitor rejects with "Share canceled" when the sheet is closed; callers already treat AbortError as a cancel
        if (/cancel/i.test(e instanceof Error ? e.message : String(e))) throw Object.assign(new Error('Share canceled'), { name: 'AbortError' })
        throw e
      }
    },
  }
}

/** Where to share from: the app's native sheet, or the browser's own navigator. Call methods on the returned object. */
export function shareNav(): ShareNav {
  if (native) return makeAppNav(native, typeof navigator === 'undefined' ? undefined : navigator.clipboard)
  return navigator as unknown as ShareNav
}

/** Saves a file: in the app, the share sheet (Files, Drive, WhatsApp); in a browser, a download. */
export async function saveBlob(name: string, blob: Blob): Promise<void> {
  if (native) {
    try { await makeAppNav(native).share!({ title: name, files: [new File([blob], name, { type: blob.type })] }) }
    catch (e) { if ((e as Error)?.name !== 'AbortError') throw e }
    return
  }
  const a = document.createElement('a')
  a.href = URL.createObjectURL(blob)
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
