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
  /** The link that cold-started the app, if any (Android can kill the app while the user is in the browser). */
  launchUrl(): Promise<string | undefined>
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

/* ---------- notices: a failure the user should hear about, shown by the app as a banner ---------- */

type NoticeListener = (message: string) => void
const listeners = new Set<NoticeListener>()
/** Subscribe to notices; returns the unsubscribe. */
export function onNotice(cb: NoticeListener): () => void { listeners.add(cb); return () => { listeners.delete(cb) } }
export function notify(message: string): void { for (const cb of listeners) cb(message) }

/* ---------- writing big files through the bridge ---------- */

/** Bytes per write: base64 of a multiple of 3 bytes has no padding, so slices can be appended one after another. */
export const CHUNK_BYTES = 3 * 1024 * 1024
/** [start, end) byte ranges covering `size`, `step` bytes at a time; an empty file is one empty write. */
export function sliceRanges(size: number, step: number = CHUNK_BYTES): [number, number][] {
  if (size === 0) return [[0, 0]]
  const out: [number, number][] = []
  for (let start = 0; start < size; start += step) out.push([start, Math.min(start + step, size)])
  return out
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

/* ---------- Google sign-in inside the app ---------- */

/** Where Google sign-in returns inside the app. Listed in Supabase's redirect URLs; only this app answers the scheme. */
export const APP_AUTH_REDIRECT = 'in.cardpulse.app://auth/callback'

/** The sign-in code from a link the app was opened with, or null for anything that is not our own successful return. */
export function authCodeFromUrl(url: string): string | null {
  if (!url.startsWith(APP_AUTH_REDIRECT)) return null
  try { return new URL(url).searchParams.get('code') } catch { return null }
}

/**
 * Status bar icons must read against what is under them: the deep indigo top, the black camera, a dark theme, or the light
 * wash. Stall mode (the QR shown to visitors) is white in every theme, so it always takes dark icons.
 */
export const statusBarIcons = (s: { deepTop: boolean; dark: boolean; camera: boolean; stall?: boolean }): 'light' | 'dark' =>
  s.stall ? 'dark' : s.deepTop || s.dark || s.camera ? 'light' : 'dark'

/**
 * Finishes a sign-in from a link the app was opened with. Anything that is not our own callback is ignored. Google's
 * error, or a code the server refuses, is reported: the user tapped Sign in and must not be left guessing.
 */
export async function finishAppSignIn(url: string, deps: { exchange(code: string): Promise<{ error: unknown }>; close(): Promise<void>; notify(message: string): void }): Promise<void> {
  if (!url.startsWith(APP_AUTH_REDIRECT)) return
  await deps.close()
  const code = authCodeFromUrl(url)
  if (!code) { deps.notify('Sign-in was cancelled.'); return }
  const { error } = await deps.exchange(code)
  if (error) deps.notify('Sign-in did not finish. Try signing in again.')
}
