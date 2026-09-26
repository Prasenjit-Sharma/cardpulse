# CardPulse Android App Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A debug APK of CardPulse, built on this Mac with Capacitor 8 from the existing React + Vite code, with the web files bundled inside, that the user installs on their Android phone.

**Architecture:** One pure module, `src/lib/platform.ts`, is the only code that knows whether it runs in the app. It holds the app/browser decisions (public link base, share and save routing) behind small interfaces, and gets its native abilities injected at start-up from `src/lib/native.ts`, the only file that imports Capacitor plugins. Library code and tests import `platform.ts` only, so the Node test runner never loads Capacitor. `main.tsx` wires the native side when running in the app.

**Tech Stack:** Capacitor 8 (`@capacitor/core`, `cli`, `android`, `filesystem`, `share`, `app`, `browser`), Supabase JS (PKCE flow in the app), Vite modes (`--mode android`), Gradle (Android debug build), Homebrew `openjdk@21` and `android-commandlinetools`, Node's built-in test runner.

**Spec:** `docs/superpowers/specs/2026-09-24-android-app-design.md` (approved by the user on 2026-09-26).

**Skills to consult while executing:** `capacitor-app-development` (references `edge-to-edge.md`, `file-handling.md`, `troubleshooting-android.md`), `capacitor-deep-linking` (custom scheme section), `safe-area-handling`.

## Global Constraints

- App id `in.cardpulse.app`, app name `CardPulse`.
- Web content bundled in the APK (`webDir: 'dist'`); never a shell pointing at the live site.
- Android scheme `https`: the app's own origin is `https://localhost`.
- Built on this Mac; nothing from the Android toolchain goes into the repo (except the generated `android/` project).
- Public links (card links, QR codes, lead links) always use the GitHub Pages address `https://prasenjit-sharma.github.io/cardpulse/` inside the app, never `https://localhost`.
- Google sign-in in the app goes through the system browser and returns to `in.cardpulse.app://auth/callback`.
- The web app on GitHub Pages behaves exactly as today; all existing tests stay green.
- The camera stays the web camera (getUserMedia) inside the WebView.
- No service worker inside the app.
- Actions needing the user's approval are asked before running: installing the Java and Android tools, editing `~/.zshrc`, redeploying the Worker.

## Review Focus

1. **User cancels the Android share sheet** (Save to phone, Share card, Backup): expected to be treated as a cancel, not an error or a fallback download. Test in Task 1 (`makeAppNav` maps Capacitor's cancel to `AbortError`).
2. **A card link shared from the app**: must open on another phone, so it must be the Pages address even though the app runs on `https://localhost`. Test in Task 1 (`publicBaseFor`) and Task 3 (`publicCardUrl` in app mode).
3. **Sign-in returns with an error or with no code** (user backs out of Google, or the link is opened by hand): the app stays signed out and shows nothing broken; only a URL with `code` is exchanged. Test in Task 5 (`authCodeFromUrl`).
4. **File names with spaces or non-Latin characters** (a contact named "राजेश शाह", "Plast India.csv"): written to the cache under a safe name so the share does not fail. Test in Task 1 (`cacheName`).
5. **Status bar icons unreadable** on the light wash pages or in dark mode: icons must be light on indigo and dark on the light wash. Covered by `statusBarIcons` test in Task 6, then the phone checklist in Task 8.

---

## File structure

| File | Responsibility |
|---|---|
| `src/lib/platform.ts` (new) | Pure: `isApp`, `publicBase()`, the native registry (`setNative`/`getNative`), `shareNav()`, `saveBlob()`, `makeAppNav()`, `cacheName()`, `authCodeFromUrl()`, `statusBarIcons()` |
| `src/lib/native.ts` (new) | The only Capacitor importer: implements the `Native` interface with Filesystem, Share, Browser, App, SystemBars |
| `src/main.tsx` | Wires `native` when in the app; registers the service worker only in the browser |
| `src/lib/actions.ts` | `download()` and `browserEnv()` route through `platform.ts` |
| `src/lib/backup.ts`, `src/lib/feedback.ts`, `src/components/CardShare.tsx` | Use `shareNav()` / `saveBlob()` instead of `navigator.share` and anchors |
| `src/lib/cloudcards.ts`, `src/lib/auth.ts`, `src/lib/supabase.ts` | Public links from `publicBase()`; sign-in through the system browser in the app |
| `src/lib/useInstall.ts` | No install prompt inside the app |
| `src/App.tsx` | Status bar icon colour follows the screen |
| `src/styles.css` | Safe-area values read through `--inset-top` / `--inset-bottom` with a Capacitor fallback |
| `capacitor.config.ts`, `.env.android`, `android/` (new) | The native project and its build configuration |
| `package.json`, `.gitignore` | Capacitor dependencies, `build:android`, `apk:install` scripts; `.env.android` committed |
| `server/wrangler.toml` | `https://localhost` added to `ALLOWED_ORIGINS` |
| `test/platform.test.mjs` (new) | Tests for everything pure in `platform.ts` |

---

### Task 1: The platform module (pure core)

**Files:**
- Create: `src/lib/platform.ts`
- Test: `test/platform.test.mjs`
- Modify: `package.json` (add the test file to the `test` script)

**Interfaces:**
- Produces:
  - `detectApp(w?: { Capacitor?: { isNativePlatform?: () => boolean } }): boolean`
  - `isApp: boolean`
  - `publicBaseFor(app: boolean, loc: { origin: string; pathname: string } | undefined, configured: string | undefined): string` (always ends with `/`)
  - `publicBase(): string`
  - `interface NativeShare { title?: string; text?: string; files?: string[] }`
  - `interface Native { writeCache(name: string, data: Blob): Promise<string>; share(o: NativeShare): Promise<void>; openUrl(url: string): Promise<void>; closeBrowser(): Promise<void>; onAppUrl(cb: (url: string) => void): void; setStatusBar(icons: 'light' | 'dark'): Promise<void> }`
  - `setNative(n: Native): void`, `getNative(): Native | null`
  - `cacheName(name: string): string`
  - `interface ShareNav { share?: (d: { title?: string; text?: string; files?: File[] }) => Promise<void>; canShare?: (d: { files?: File[] }) => boolean; clipboard?: { writeText(t: string): Promise<void> } }`
  - `makeAppNav(n: Pick<Native, 'writeCache' | 'share'>, clipboard?: ShareNav['clipboard']): ShareNav`
  - `shareNav(): ShareNav`
  - `saveBlob(name: string, blob: Blob): Promise<void>`

- [ ] **Step 1: Write the failing tests**

`test/platform.test.mjs`:

```js
// Run: node --test test/platform.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cacheName, detectApp, makeAppNav, publicBaseFor } from '../src/lib/platform.ts'

test('the app is detected only through Capacitor', () => {
  assert.equal(detectApp(undefined), false)
  assert.equal(detectApp({}), false)
  assert.equal(detectApp({ Capacitor: { isNativePlatform: () => false } }), false)
  assert.equal(detectApp({ Capacitor: { isNativePlatform: () => true } }), true)
})

test('public links: the page itself in a browser, the Pages address in the app', () => {
  const loc = { origin: 'https://prasenjit-sharma.github.io', pathname: '/cardpulse/' }
  assert.equal(publicBaseFor(false, loc, undefined), 'https://prasenjit-sharma.github.io/cardpulse/')
  const app = { origin: 'https://localhost', pathname: '/' }
  assert.equal(publicBaseFor(true, app, 'https://prasenjit-sharma.github.io/cardpulse/'), 'https://prasenjit-sharma.github.io/cardpulse/')
  assert.equal(publicBaseFor(true, app, 'https://prasenjit-sharma.github.io/cardpulse'), 'https://prasenjit-sharma.github.io/cardpulse/')   // slash added
  assert.throws(() => publicBaseFor(true, app, undefined), /VITE_PUBLIC_URL/)                         // never silently localhost
})

test('cache file names are safe but still readable', () => {
  assert.equal(cacheName('Rajesh Shah.vcf'), 'Rajesh_Shah.vcf')
  assert.equal(cacheName('राजेश शाह.vcf'), 'राजेश_शाह.vcf')
  assert.equal(cacheName('a/b\\c:d?.csv'), 'a_b_c_d_.csv')
  assert.equal(cacheName('.vcf'), 'file.vcf')
})

function fakeNative({ cancel = false } = {}) {
  const calls = { written: [], shared: [] }
  return {
    calls,
    n: {
      writeCache: async (name, blob) => { calls.written.push({ name, size: blob.size }); return `file:///cache/${name}` },
      share: async (o) => { if (cancel) throw new Error('Share canceled'); calls.shared.push(o) },
    },
  }
}

test('app share: files are written to the cache and handed to the share sheet together', async () => {
  const { n, calls } = fakeNative()
  const nav = makeAppNav(n)
  assert.equal(nav.canShare({ files: [new File(['x'], 'a.vcf')] }), true)
  await nav.share({ title: 'Rajesh', text: 'hello', files: [new File(['BEGIN:VCARD'], 'Rajesh Shah.vcf', { type: 'text/x-vcard' })] })
  assert.deepEqual(calls.written.map((w) => w.name), ['Rajesh_Shah.vcf'])
  assert.deepEqual(calls.shared, [{ title: 'Rajesh', text: 'hello', files: ['file:///cache/Rajesh_Shah.vcf'] }])
})

test('app share: text alone goes straight to the share sheet', async () => {
  const { n, calls } = fakeNative()
  await makeAppNav(n).share({ title: 'Feedback', text: 'It works' })
  assert.equal(calls.written.length, 0)
  assert.deepEqual(calls.shared, [{ title: 'Feedback', text: 'It works', files: undefined }])
})

test('app share: closing the share sheet is a cancel (AbortError), like the browser', async () => {
  const { n } = fakeNative({ cancel: true })
  await assert.rejects(makeAppNav(n).share({ text: 'x' }), (e) => e.name === 'AbortError')
})
```

Add `test/platform.test.mjs` to the `test` script in `package.json`, before `server/test/worker.test.mjs`.

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/platform.test.mjs`
Expected: FAIL, `Cannot find module '.../src/lib/platform.ts'`.

- [ ] **Step 3: Write `src/lib/platform.ts`**

```ts
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

/** A file name Android's cache and every share target accept: letters in any script, digits, dot, dash, underscore. */
export function cacheName(name: string): string {
  const clean = name.replace(/[^\p{L}\p{N}._-]+/gu, '_')
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
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `node --test test/platform.test.mjs` → all 7 tests PASS.
Then: `npm test` → all tests pass (the existing 249 plus these).

- [ ] **Step 5: Commit**

```bash
git add src/lib/platform.ts test/platform.test.mjs package.json
git commit -m "platform.ts: the one place that knows app from browser (public link base, native share and save behind an injected interface)"
```

---

### Task 2: Route every share and save through the platform module

**Files:**
- Modify: `src/lib/actions.ts` (the `download` function and `browserEnv`)
- Modify: `src/lib/backup.ts:83-92` (`saveBackupFile`)
- Modify: `src/lib/feedback.ts:36-41`
- Modify: `src/components/CardShare.tsx:44-48` (share as picture)
- Test: `test/actions.test.mjs` (existing, must stay green), `test/backup.test.mjs`, `test/feedback.test.mjs`

**Interfaces:**
- Consumes: `shareNav(): ShareNav`, `saveBlob(name, blob): Promise<void>` from Task 1.
- Produces: no new names; `download(name, text, type)` and `browserEnv(log?)` keep their signatures.

- [ ] **Step 1: Change `download` and `browserEnv` in `src/lib/actions.ts`**

Add to the imports: `import { saveBlob, shareNav } from './platform.ts'`

Replace the body of `download`:

```ts
/** A file to keep: a download in a browser, the share sheet in the app (the WebView cannot download). */
export function download(name: string, text: string, type: string) {
  void saveBlob(name, new Blob([text], { type }))
}
```

Replace `browserEnv`:

```ts
export const browserEnv = (log?: (m: string) => void): ActionEnv => ({ nav: shareNav() as ActionEnv['nav'], download, log })
```

- [ ] **Step 2: Change `saveBackupFile` in `src/lib/backup.ts`**

Replace the function with:

```ts
/** Hands the backup to the phone: the share sheet where files are supported (Drive, WhatsApp, Files), else a download. */
export async function saveBackupFile(blob: Blob, name: string): Promise<void> {
  const file = new File([blob], name, { type: 'application/zip' })
  const nav = shareNav()
  if (nav.canShare?.({ files: [file] })) {
    try { await nav.share!({ files: [file], title: 'CardPulse backup' }); return } catch (e) { if ((e as Error)?.name === 'AbortError') throw e }
  }
  await saveBlob(name, blob)
}
```

and add `import { saveBlob, shareNav } from './platform.ts'` to its imports.

- [ ] **Step 3: Change the share in `src/lib/feedback.ts`**

Replace `if (navigator.share) { try { await navigator.share({ title: 'CardPulse feedback', text }); ...` with:

```ts
  const nav = shareNav()
  if (nav.share) {
    try { await nav.share({ title: 'CardPulse feedback', text }); return 'shared' } catch (e) { if ((e as Error)?.name === 'AbortError') throw e }
  }
```

and add `import { shareNav } from './platform.ts'`.

- [ ] **Step 4: Change the picture share in `src/components/CardShare.tsx`**

Replace `if (navigator.canShare?.({ files: [file] })) { await navigator.share({ files: [file], title: card.name }); noteShare(card.id, 'picture'); return }` with:

```tsx
    const nav = shareNav()
    if (nav.canShare?.({ files: [file] })) { await nav.share!({ files: [file], title: card.name }); noteShare(card.id, 'picture'); return }
```

and add `import { shareNav } from '../lib/platform'`.

- [ ] **Step 5: Run the checks**

Run: `npx tsc -b && npm test`
Expected: no type errors; all tests pass. The existing share tests pass their own fake `env`, so they still exercise `shareVcf`'s logic unchanged. In a browser `shareNav()` returns `navigator` and `saveBlob` downloads, so the web app behaves as before.

- [ ] **Step 6: Check nothing else calls Web Share directly**

Run: `grep -rn "navigator.share\|navigator.canShare\|a.download =" src`
Expected: only `src/lib/platform.ts` (the anchor in `saveBlob`) remains.

- [ ] **Step 7: Commit**

```bash
git add src/lib/actions.ts src/lib/backup.ts src/lib/feedback.ts src/components/CardShare.tsx
git commit -m "Every share and save goes through platform.ts, so the app can use Android's share sheet where the WebView has none"
```

---

### Task 3: Public links never point at the app itself

**Files:**
- Modify: `src/lib/cloudcards.ts:30-31` (`publicCardUrl`)
- Test: `test/cloudcards.test.mjs` (add a test)

**Interfaces:**
- Consumes: `publicBase()` from Task 1; `publicBaseFor` for the test.

- [ ] **Step 1: Write the failing test**

Read `test/cloudcards.test.mjs` first to reuse its imports. Add:

```js
import { publicBaseFor } from '../src/lib/platform.ts'

test('a card link built in the app points at the public site, never at localhost', () => {
  const base = publicBaseFor(true, { origin: 'https://localhost', pathname: '/' }, 'https://prasenjit-sharma.github.io/cardpulse/')
  const u = new URL(publicCardUrlFrom(base, 'arham-t', 'e1', 'Plast India'))
  assert.equal(u.origin + u.pathname, 'https://prasenjit-sharma.github.io/cardpulse/')
  assert.equal(u.searchParams.get('card'), 'arham-t')
  assert.equal(u.searchParams.get('event'), 'e1')
})
```

Add `publicCardUrlFrom` to that file's existing import from `../src/lib/cloudcards.ts`.

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/cloudcards.test.mjs`
Expected: FAIL, `publicCardUrlFrom is not a function`.

- [ ] **Step 3: Split `publicCardUrl` in `src/lib/cloudcards.ts`**

Replace `const u = new URL(window.location.origin + window.location.pathname)` so the builder takes its base:

```ts
/** A card's public link from a given site address (testable without a window). */
export const publicCardUrlFrom = (base: string, slug: string, eventId?: string, eventName?: string): string => {
  const u = new URL(base)
  u.searchParams.set('card', slug)
  if (eventId) u.searchParams.set('event', eventId)
  // keep the rest of the existing body unchanged from here (the event name parameter and the return)
```

Move the remaining lines of the old `publicCardUrl` body into `publicCardUrlFrom` unchanged, then define:

```ts
export const publicCardUrl = (slug: string, eventId?: string, eventName?: string): string => publicCardUrlFrom(publicBase(), slug, eventId, eventName)
```

and add `import { publicBase } from './platform.ts'`.

- [ ] **Step 4: Check for other public links**

Run: `grep -rn "location.origin\|location.href" src`
Expected: only `src/lib/auth.ts` (handled in Task 5) and `src/lib/platform.ts`. Anything else that builds a link someone else opens must use `publicBase()`.

- [ ] **Step 5: Run the tests**

Run: `npm test` → all pass.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cloudcards.ts test/cloudcards.test.mjs
git commit -m "Card, QR and lead links come from publicBase(), so a card shared from the app opens on the public site"
```

---

### Task 4: The Capacitor project, its config and the app-only start-up

**Files:**
- Create: `capacitor.config.ts`, `.env.android`, `src/lib/native.ts`, `android/` (generated)
- Modify: `package.json`, `.gitignore`, `src/main.tsx`, `src/lib/useInstall.ts`, `android/app/src/main/AndroidManifest.xml`

**Interfaces:**
- Consumes: `Native`, `setNative`, `isApp` from Task 1.
- Produces: `native: Native` (from `src/lib/native.ts`); npm scripts `build:android`, `apk:install`.

- [ ] **Step 1: Install Capacitor**

```bash
npm install @capacitor/core@^8 @capacitor/android@^8 @capacitor/filesystem@^8 @capacitor/share@^8 @capacitor/app@^8 @capacitor/browser@^8
npm install -D @capacitor/cli@^8
```

Then check the installed version: `npx cap --version` → `8.x`.

- [ ] **Step 2: Write `capacitor.config.ts`**

```ts
import type { CapacitorConfig } from '@capacitor/cli'

const config: CapacitorConfig = {
  appId: 'in.cardpulse.app',
  appName: 'CardPulse',
  webDir: 'dist',
  android: { },
  server: { androidScheme: 'https' },
}

export default config
```

- [ ] **Step 3: Write `.env.android` and let git keep it**

`.env.android` (all values are the public ones the Pages build already ships):

```
VITE_BASE=/
VITE_PUBLIC_URL=https://prasenjit-sharma.github.io/cardpulse/
VITE_API_URL=https://cardpulse-api.cardpulse-app.workers.dev
VITE_SUPABASE_URL=https://xqwslvteyhfmnxcnlpsg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf
```

In `.gitignore`, directly under the `.env*` line, add `!.env.android`. Vite gives `.env.[mode]` priority over `.env.local`, so a developer's local values never leak into the app build.

- [ ] **Step 4: Add the scripts to `package.json`**

```json
"build:android": "tsc -b && vite build --mode android && cap sync android && cd android && ./gradlew assembleDebug",
"apk:install": "adb install -r android/app/build/outputs/apk/debug/app-debug.apk"
```

- [ ] **Step 5: Write `src/lib/native.ts`**

Read `node_modules/@capacitor/core/types/core-plugins.d.ts` first and use the exact `SystemBars` names it declares (Capacitor 8 ships `SystemBars` in core). The shape below assumes `SystemBars.setStyle({ style: SystemBarsStyle.Dark | SystemBarsStyle.Light })`; adjust to the declared API if it differs.

```ts
import { SystemBars, SystemBarsStyle } from '@capacitor/core'
import { App } from '@capacitor/app'
import { Browser } from '@capacitor/browser'
import { Directory, Filesystem } from '@capacitor/filesystem'
import { Share } from '@capacitor/share'
import type { Native } from './platform'

/** Base64 without the data-URL prefix, as Filesystem.writeFile expects. */
const toBase64 = (blob: Blob) => new Promise<string>((resolve, reject) => {
  const r = new FileReader()
  r.onload = () => resolve(String(r.result).split(',')[1] ?? '')
  r.onerror = () => reject(r.error)
  r.readAsDataURL(blob)
})

/** The app's native abilities. The only file that imports Capacitor plugins; main.tsx hands it to platform.ts. */
export const native: Native = {
  writeCache: async (name, data) => (await Filesystem.writeFile({ path: name, data: await toBase64(data), directory: Directory.Cache })).uri,
  share: async ({ title, text, files }) => { await Share.share({ title, text, files, dialogTitle: title }) },
  openUrl: async (url) => { await Browser.open({ url }) },
  closeBrowser: async () => { await Browser.close().catch(() => {}) },
  onAppUrl: (cb) => { void App.addListener('appUrlOpen', (e) => cb(e.url)) },
  // SystemBarsStyle.Dark means light icons (for a dark background), as in Capacitor's docs
  setStatusBar: async (icons) => { await SystemBars.setStyle({ style: icons === 'light' ? SystemBarsStyle.Dark : SystemBarsStyle.Light }) },
}
```

- [ ] **Step 6: Change `src/main.tsx`**

Replace `registerSW({ immediate: true })` with:

```tsx
// Inside the app the files are already on the phone: no service worker, and native abilities are handed to platform.ts.
if (isApp) setNative(native)
else registerSW({ immediate: true })
```

with imports `import { isApp, setNative } from './lib/platform'` and `import { native } from './lib/native'`.

- [ ] **Step 7: Hide the install prompt inside the app**

In `src/lib/useInstall.ts`, change `const installed = standalone()` to `const installed = isApp || standalone()` and add `import { isApp } from './platform'`.

- [ ] **Step 8: Generate the Android project**

```bash
npx vite build --mode android
npx cap add android
```

Expected: an `android/` folder. Record the SDK levels for Task 7: `grep -E "compileSdkVersion|targetSdkVersion|minSdkVersion" android/variables.gradle`.

- [ ] **Step 9: Permissions and the sign-in link in `android/app/src/main/AndroidManifest.xml`**

Before `<application`, add:

```xml
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-feature android:name="android.hardware.camera" android:required="false" />
```

Inside the main `<activity>`, after its existing launcher `<intent-filter>`, add:

```xml
            <!-- Google sign-in returns here from the system browser (only this app answers the scheme) -->
            <intent-filter>
                <action android:name="android.intent.action.VIEW" />
                <category android:name="android.intent.category.DEFAULT" />
                <category android:name="android.intent.category.BROWSABLE" />
                <data android:scheme="in.cardpulse.app" android:host="auth" />
            </intent-filter>
```

Check the activity keeps `android:launchMode="singleTask"` (Capacitor's template sets it), so the return opens the running app instead of a second copy.

- [ ] **Step 10: Run the checks**

Run: `npx tsc -b && npm test && npm run build`
Expected: no type errors, all tests pass, the web build still succeeds (Capacitor plugins have web fallbacks, and none is called in the browser).

- [ ] **Step 11: Commit**

```bash
git add capacitor.config.ts .env.android .gitignore package.json package-lock.json src/lib/native.ts src/main.tsx src/lib/useInstall.ts android
git commit -m "Capacitor Android project (in.cardpulse.app, web bundled from dist): native share, save and browser behind platform.ts; no service worker or install prompt inside the app; camera permission and the sign-in return link"
```

---

### Task 5: Google sign-in through the system browser

**Files:**
- Modify: `src/lib/supabase.ts`, `src/lib/auth.ts`, `src/main.tsx`
- Modify: `src/lib/platform.ts` (add `authCodeFromUrl`), `test/platform.test.mjs`

**Interfaces:**
- Consumes: `isApp`, `getNative()` from Task 1; `native.openUrl`, `native.closeBrowser`, `native.onAppUrl` from Task 4.
- Produces: `APP_AUTH_REDIRECT = 'in.cardpulse.app://auth/callback'`, `authCodeFromUrl(url: string): string | null` (platform.ts), `startAppAuth(): void` (auth.ts).

- [ ] **Step 1: Write the failing test** (append to `test/platform.test.mjs`, and add `authCodeFromUrl` to its import)

```js
test('sign-in return: only our own callback with a code is exchanged', () => {
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback?code=abc123'), 'abc123')
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback?error=access_denied&error_description=cancelled'), null)
  assert.equal(authCodeFromUrl('in.cardpulse.app://auth/callback'), null)
  assert.equal(authCodeFromUrl('in.cardpulse.app://something-else?code=abc'), null)
  assert.equal(authCodeFromUrl('https://evil.example/auth/callback?code=abc'), null)
  assert.equal(authCodeFromUrl('not a url'), null)
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/platform.test.mjs`
Expected: FAIL, `authCodeFromUrl is not a function`.

- [ ] **Step 3: Add to `src/lib/platform.ts`**

```ts
/** Where Google sign-in returns inside the app. Listed in Supabase's redirect URLs; only this app answers the scheme. */
export const APP_AUTH_REDIRECT = 'in.cardpulse.app://auth/callback'

/** The sign-in code from a link the app was opened with, or null for anything that is not our own successful return. */
export function authCodeFromUrl(url: string): string | null {
  if (!url.startsWith(APP_AUTH_REDIRECT)) return null
  try { return new URL(url).searchParams.get('code') } catch { return null }
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run: `node --test test/platform.test.mjs` → PASS.

- [ ] **Step 5: PKCE in the app, in `src/lib/supabase.ts`**

```ts
import { isApp } from './platform.ts'
// ...
// The app signs in through the system browser and returns with a code (PKCE); it never reads a session from its own URL.
export const supabase = url && key ? createClient(url, key, isApp ? { auth: { flowType: 'pkce', detectSessionInUrl: false } } : undefined) : null
```

- [ ] **Step 6: Sign-in through the system browser, in `src/lib/auth.ts`**

```ts
import { APP_AUTH_REDIRECT, authCodeFromUrl, getNative, isApp } from './platform'

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return
  const n = isApp ? getNative() : null
  if (!n) { await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } }); return }
  // Google refuses sign-in inside a WebView: open the system browser, and come back through the app's own link
  const { data, error } = await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: APP_AUTH_REDIRECT, skipBrowserRedirect: true } })
  if (error || !data.url) throw error ?? new Error('Sign-in could not start')
  await n.openUrl(data.url)
}

/** Inside the app: finish a sign-in when Google sends the user back. Called once from main.tsx. */
export function startAppAuth(): void {
  const n = getNative()
  if (!n || !supabase) return
  n.onAppUrl((url) => {
    const code = authCodeFromUrl(url)
    void n.closeBrowser()
    if (code) void supabase!.auth.exchangeCodeForSession(code)
  })
}
```

(Keep `useSession` and `signOut` unchanged.)

- [ ] **Step 7: Start it in `src/main.tsx`**

Change the app branch to `if (isApp) { setNative(native); startAppAuth() }` and add `import { startAppAuth } from './lib/auth'`.

- [ ] **Step 8: Run the checks**

Run: `npx tsc -b && npm test && npm run build` → all pass.

- [ ] **Step 9: Commit**

```bash
git add src/lib/platform.ts test/platform.test.mjs src/lib/supabase.ts src/lib/auth.ts src/main.tsx
git commit -m "Google sign-in in the app goes through the system browser and returns to in.cardpulse.app://auth/callback (PKCE); the web flow is unchanged"
```

---

### Task 6: Status bar and safe areas on Android

**Files:**
- Modify: `src/styles.css` (the 24 `env(safe-area-inset-top|bottom)` uses)
- Modify: `src/lib/platform.ts` (add `statusBarIcons`), `test/platform.test.mjs`
- Modify: `src/App.tsx` (an effect that sets the status bar)

**Interfaces:**
- Consumes: `getNative().setStatusBar` from Task 4.
- Produces: `statusBarIcons(s: { deepTop: boolean; dark: boolean; camera: boolean }): 'light' | 'dark'`.

- [ ] **Step 1: Write the failing test** (append to `test/platform.test.mjs`, add `statusBarIcons` to the import)

```js
test('status bar icons: light on indigo, the camera and dark mode; dark on the light wash', () => {
  assert.equal(statusBarIcons({ deepTop: true, dark: false, camera: false }), 'light')    // Home, Contacts, Events, My Card
  assert.equal(statusBarIcons({ deepTop: false, dark: false, camera: false }), 'dark')    // Insights, a contact, Settings
  assert.equal(statusBarIcons({ deepTop: false, dark: true, camera: false }), 'light')
  assert.equal(statusBarIcons({ deepTop: false, dark: false, camera: true }), 'light')
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `node --test test/platform.test.mjs` → FAIL, `statusBarIcons is not a function`.

- [ ] **Step 3: Add to `src/lib/platform.ts`**

```ts
/** Status bar icons must read against what is under them: the deep indigo top, the black camera, a dark theme, or the light wash. */
export const statusBarIcons = (s: { deepTop: boolean; dark: boolean; camera: boolean }): 'light' | 'dark' =>
  s.deepTop || s.dark || s.camera ? 'light' : 'dark'
```

- [ ] **Step 4: Run it to verify it passes**

Run: `node --test test/platform.test.mjs` → PASS.

- [ ] **Step 5: Set the status bar from `src/App.tsx`**

After the existing state declarations (where `tab`, `open`, `camOpen`, `editingCard` and `settings` are all defined), add:

```tsx
  // Android app: the status bar sits over the page top, so its icons follow the screen under them
  const deepTop = !open && !editingCard && (tab === 'home' || tab === 'contacts' || tab === 'exhibition' || tab === 'mycard')
  const darkTheme = settings.theme === 'dark' || (settings.theme !== 'light' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => { void getNative()?.setStatusBar(statusBarIcons({ deepTop, dark: darkTheme, camera: camOpen || qrOpen })) }, [deepTop, darkTheme, camOpen, qrOpen])
```

with `import { getNative, statusBarIcons } from './lib/platform'`. (`qrOpen` is the QR scanner's open state already in App; if the name differs, use that state.)

- [ ] **Step 6: Safe-area fallback in `src/styles.css`**

In `:root`, add:

```css
  /* Safe areas: Capacitor 8 sets --safe-area-inset-* on Android (older WebViews misreport env()); browsers use env() */
  --inset-top: var(--safe-area-inset-top, env(safe-area-inset-top, 0px));
  --inset-bottom: var(--safe-area-inset-bottom, env(safe-area-inset-bottom, 0px));
```

Then replace every use:

```bash
sed -i '' 's/env(safe-area-inset-top)/var(--inset-top)/g; s/env(safe-area-inset-bottom)/var(--inset-bottom)/g' src/styles.css
```

Run: `grep -c "env(safe-area" src/styles.css` → `2` (only the two fallbacks in `:root`).

- [ ] **Step 7: Run the checks**

Run: `npx tsc -b && npm test && npm run build` → all pass. The web app renders the same (the variables fall back to `env()`).

- [ ] **Step 8: Commit**

```bash
git add src/lib/platform.ts test/platform.test.mjs src/App.tsx src/styles.css
git commit -m "Android status bar icons follow the screen (light on indigo, the camera and dark mode); safe areas read through --inset-* with Capacitor's values first"
```

---

### Task 7: The Android toolchain on this Mac and the first APK

**Approval gate:** before Step 1, ask the user to approve installing `openjdk@21` and `android-commandlinetools` (about 3 to 4 GB) and adding two lines to `~/.zshrc`. Do not continue without a yes.

**Files:**
- Modify: `~/.zshrc` (outside the repo)

- [ ] **Step 1: Install Java and the Android command-line tools**

```bash
brew install openjdk@21
brew install --cask android-commandlinetools
```

- [ ] **Step 2: Point the shell at them** (append to `~/.zshrc`, then `source ~/.zshrc`)

```bash
export JAVA_HOME="$(brew --prefix openjdk@21)/libexec/openjdk.jdk/Contents/Home"
export ANDROID_HOME="$(brew --prefix)/share/android-commandlinetools"
export PATH="$JAVA_HOME/bin:$ANDROID_HOME/platform-tools:$PATH"
```

Check: `java -version` → `21`; `sdkmanager --version` prints a version.

- [ ] **Step 3: Install the SDK pieces the project asks for**

Use the `compileSdkVersion` recorded in Task 4 Step 8 as `<N>`:

```bash
yes | sdkmanager --licenses
sdkmanager --install "platform-tools" "platforms;android-<N>" "build-tools;<N>.0.0"
```

If `build-tools;<N>.0.0` does not exist, list with `sdkmanager --list | grep build-tools` and install the newest `<N>.x.x`.

- [ ] **Step 4: Build the APK**

Run: `npm run build:android`
Expected: `BUILD SUCCESSFUL`, and `ls -lh android/app/build/outputs/apk/debug/app-debug.apk` shows the file (roughly 5 to 15 MB). The first run downloads Gradle and takes several minutes. On a failure, consult `troubleshooting-android.md` in the `capacitor-app-development` skill before changing anything.

- [ ] **Step 5: Commit anything the build changed in the repo**

Run `git status`. Capacitor sync may touch `android/app/src/main/assets/capacitor.config.json` or plugin lists. If `android/app/src/main/assets/public` (the copied web build) appears as untracked, add it to `android/.gitignore` rather than committing it (Capacitor's template normally ignores it already).

```bash
git add android/.gitignore android/app/capacitor.build.gradle android/capacitor.settings.gradle 2>/dev/null; git commit -m "Android project after the first debug build" || true
```

---

### Task 8: The server accepts the app, and the phone check

**Approval gate:** before Step 2, ask the user to approve redeploying the Worker (it changes the production allow-list). Before Step 4, the user must have done the Supabase and phone steps below.

**Files:**
- Modify: `server/wrangler.toml:8`

- [ ] **Step 1: Allow the app's origin**

```toml
ALLOWED_ORIGINS = "https://prasenjit-sharma.github.io,https://localhost"
```

Run: `npm run server:test` → all pass.

- [ ] **Step 2: Redeploy the Worker** (after approval)

Run: `npm run server:deploy` → `Deployed cardpulse-api`.

- [ ] **Step 3: Commit and push the branch**

```bash
git add server/wrangler.toml
git commit -m "The reading server accepts the Android app's origin (https://localhost); the quotas, not the origin check, protect it"
git push origin main
```

- [ ] **Step 4: The user's steps (outside the code)**

Tell the user, in plain words:
1. Supabase dashboard → Authentication → URL Configuration → Redirect URLs: add `in.cardpulse.app://auth/callback`.
2. On the phone: Settings → About phone → tap Build number seven times; then Developer options → USB debugging on. Connect the cable and accept the Mac's key when asked.
   (Without a cable: copy `android/app/build/outputs/apk/debug/app-debug.apk` to the phone through Google Drive and open it, allowing "Install unknown apps".)

- [ ] **Step 5: Install on the phone**

Run: `adb devices` → the phone is listed as `device`. Then `npm run apk:install` → `Success`.

- [ ] **Step 6: The real-phone checklist** (the user goes through it; record the results in `ROADMAP.md` under Phase 6)

- [ ] Opens with airplane mode on (the web files are inside the app)
- [ ] The indigo top runs under the status bar with light icons on Home, Contacts, Events, My Card; dark icons on Settings and a contact; nothing hidden under the status bar or the navigation bar
- [ ] Scan a card with auto-detect; the card is read (server origin accepted)
- [ ] Gallery import
- [ ] Save to phone opens the Android share sheet with Contacts; closing the sheet does nothing
- [ ] Share card as a file and as a picture
- [ ] Settings → Export → Spreadsheet, Phone contacts, Backup file; then Restore from that backup
- [ ] Google sign-in opens the browser and comes back signed in; backing out of Google leaves the app signed out and working
- [ ] Publish a card; its link and QR open the card on another phone (the address must be `prasenjit-sharma.github.io/cardpulse/`)
- [ ] QR scan
- [ ] Call, WhatsApp and email links open the dialer, WhatsApp and the mail app
- [ ] Back button closes the camera, a sheet, a contact, then leaves Home
- [ ] Light and dark theme

- [ ] **Step 7: Update the roadmap and the memory**

In `ROADMAP.md`, record the first APK and the checklist results under Phase 6. Update the project memory file `project_android_bundled.md`: the build is done, and list what failed on the phone, if anything.

---

## Self-review (done while writing)

- **Spec coverage:** native project and config (Task 4), `platform.ts` with `isApp`, `publicBase`, share and save helpers (Tasks 1 to 3), system-browser sign-in with PKCE and the custom scheme (Tasks 4 and 5), the Worker allow-list (Task 8), no service worker and no install prompt in the app (Task 4), the Mac toolchain and the debug build (Task 7), install and the phone checklist (Task 8). Spec items checked on the phone rather than coded: back-button behaviour, `tel:`/`mailto:`/WhatsApp links, dictation hiding itself. Icons and splash from `@capacitor/assets` are left for when the logo is final (the user said on 2026-09-26 the logo is not finalised); Capacitor's default icon is used until then.
- **Beyond the spec, from research:** Android 15 edge-to-edge (status bar icons, safe-area fallback) is Task 6. The spec did not know Capacitor 8 enforces it.
- **Names checked across tasks:** `Native` (writeCache, share, openUrl, closeBrowser, onAppUrl, setStatusBar), `setNative`, `getNative`, `shareNav`, `saveBlob`, `makeAppNav`, `cacheName`, `publicBase`, `publicBaseFor`, `publicCardUrlFrom`, `APP_AUTH_REDIRECT`, `authCodeFromUrl`, `startAppAuth`, `statusBarIcons`.
