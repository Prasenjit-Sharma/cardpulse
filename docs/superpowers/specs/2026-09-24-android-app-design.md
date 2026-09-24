# CardPulse Android app (Capacitor, bundled): design

Date: 2026-09-24. Status: design approved in conversation; this written spec awaits the user's review. No code yet.

## Goal

A real Android app of CardPulse, built from the existing React + Vite codebase with Capacitor, with the web files
bundled inside the APK. First milestone: a debug APK the user installs on their own Android phone to test. The same build
later becomes the Play Store release (Phase 6). The web app on GitHub Pages keeps working unchanged alongside it.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Wrapper | Capacitor | Keeps one codebase; decided on the roadmap (a React Native rewrite only if Capacitor disappoints) |
| Web content | **Bundled in the APK** (user's choice, 2026-09-24), not a shell pointing at the live site | Opens offline in a hall; what the stores accept; the thin shell was rejected as throwaway |
| App id and name | `in.cardpulse.app`, "CardPulse" | Final id from the start, so testing installs upgrade into the release |
| Where it builds | **This Mac** (user's choice, 2026-09-24), with the Android tools installed here | Faster rebuilds while testing, and the APK installs straight onto the phone over USB |
| Camera | Keep the web camera (getUserMedia) inside the WebView | Auto-detect and the tray read live video frames; a native camera plugin would lose them |
| Web caching (service worker) | Off inside the app | The files are already on the phone; a stale cache is the only thing it could add |

## What changes

### 1. The native project
- `capacitor.config.ts` with app id, name, `webDir: 'dist'`, Android scheme `https` (the app's own origin becomes
  `https://localhost`).
- An `android/` project, committed to the repo. `AndroidManifest.xml` adds `CAMERA` (and `RECORD_AUDIO` only if dictation
  is built). Capacitor's WebView grants camera access to the page once Android has granted it.
- Icons and splash screen made from the existing CardPulse logo with `@capacitor/assets`.
- A native build uses `VITE_BASE=/`, not the GitHub Pages sub-path.

### 2. One platform module: `src/lib/platform.ts`
The only place that knows whether the code runs in the app or in a browser. It exposes:
- `isApp`: true inside the Android app.
- `publicBase`: the address other people open. In the browser it is the page's own address; in the app it is a build
  constant, `VITE_PUBLIC_URL` (the GitHub Pages URL). Card links, QR codes and lead links use it instead of
  `window.location.origin`, so a card shared from the app never points at `https://localhost`. The fix is in
  `src/lib/cloudcards.ts` and wherever else a public link is built.
- `shareFile(name, blob, title)` and `saveFile(name, blob)`: in the browser, today's Web Share and download behaviour;
  in the app, the file is written with `@capacitor/filesystem` to the cache and handed to the Android share sheet with
  `@capacitor/share`. Android's WebView supports neither Web Share nor `<a download>`, so without this, Save to phone,
  Share card (file, picture), Backup and the calendar file all fail silently. `src/lib/actions.ts`,
  `src/lib/backup.ts` and `CardShare.tsx` call these helpers instead of their own download code.

### 3. Google sign-in through the system browser
Google refuses sign-in inside an app's WebView, so in the app:
1. The Supabase client uses the PKCE flow.
2. `signInWithGoogle` asks Supabase for the Google URL without redirecting (`skipBrowserRedirect`) and opens it with
   `@capacitor/browser` (a Chrome Custom Tab).
3. Google returns to `in.cardpulse.app://auth/callback`. The manifest registers that scheme, so only this app answers.
4. `@capacitor/app` receives the link (`appUrlOpen`), the app exchanges the code for a session and closes the tab.

Supabase's Auth settings must list `in.cardpulse.app://auth/callback` as an allowed redirect (a dashboard step the user
does, listed below). The browser version keeps today's redirect flow.

### 4. The reading server accepts the app
Add `https://localhost` to `ALLOWED_ORIGINS` in `server/wrangler.toml` and redeploy the Worker. Trade-off: any page served
from localhost in a browser also passes the origin check. That check was never a security boundary (non-browser clients
can send any origin); the per-account and per-IP quotas are what protect the service, and they are unchanged.

### 5. Smaller app-only behaviour
- `src/main.tsx` skips service-worker registration when `isApp`.
- Android back button: the app already closes sheets, the camera and screens through browser history
  (`useBackClose`). Capacitor's default back handling goes back in the WebView's history and exits at the root; check it
  on the phone, and add an `@capacitor/app` `backButton` handler only if it misbehaves.
- Call, email and WhatsApp links: Capacitor hands `tel:`, `mailto:` and outside `https:` links to Android, so they open
  the dialer, the mail app and WhatsApp. Check on the phone.
- Voice dictation: the WebView has no speech recognition. The note mic already hides itself when the feature is
  missing. A native speech plugin is deferred.
- The install banner and "Install app" setting hide themselves in the app.

## Build and delivery
- **Tools to install on the Mac (one time, about 3 to 4 GB, 95 GB free today):** a Java 21 JDK (Homebrew
  `openjdk@21`) and the Android SDK: either Android Studio, or the command-line tools (Homebrew
  `android-commandlinetools`) plus `platform-tools` (adb), one Android platform and its build-tools through
  `sdkmanager`, with the licences accepted. `JAVA_HOME` and `ANDROID_HOME` are set in the shell profile. Nothing here
  goes into the repo.
- **Build:** `npm run build:android` builds the web app with the same `VITE_*` values as the Pages deploy plus
  `VITE_BASE=/` and `VITE_PUBLIC_URL`, runs `npx cap sync android`, then `./gradlew assembleDebug`. Output:
  `android/app/build/outputs/apk/debug/app-debug.apk`.
- **Install on the phone:** over USB with `adb install -r` after the user turns on Developer options and USB debugging
  and accepts the Mac's key on the phone; or, without USB, the APK is copied to the phone (AirDrop is not available on
  Android, so Google Drive, a cable file transfer or a messaging app) and opened there after allowing "install unknown
  apps".
- **Updates install over the last build** because the Mac keeps one debug key (`~/.android/debug.keystore`). The debug
  APK is for sideloading only, never for the store.
- Release signing (an upload key kept outside the repo, an `.aab` for Play) comes with the store step, not in this
  milestone. A GitHub Actions build can be added then for repeatable releases.

## Testing
- Unit tests for `platform.ts`: `publicBase` in both modes, and the share and save helpers choosing the right path
  (plugins stubbed). The existing 237 tests stay green, and the web version on GitHub Pages behaves exactly as today.
- A real-phone checklist for the first APK: install over "unknown apps"; scan a card with auto-detect; read works
  (server origin); gallery import; Save to phone; Share card as file and as picture; Backup and Restore; Google sign-in
  and back into the app; publish a card and open its link on another phone (must be the GitHub Pages address); QR scan;
  call, WhatsApp and email links; back button from the camera, a sheet, a contact and Home; offline open with airplane
  mode; light and dark theme.

## Steps the user does (outside the code)
1. Approve installing the Java and Android tools on the Mac (about 3 to 4 GB).
2. Supabase dashboard, Authentication, URL configuration: add `in.cardpulse.app://auth/callback` to the redirect URLs.
3. On the phone: turn on Developer options and USB debugging, and accept the Mac's key when the cable is connected (or
   allow "install unknown apps" if the APK is copied over instead).
4. Approve the Worker redeploy (it changes the production allow-list).

## Out of scope for this milestone
Play Store listing, release signing and the `.aab`; iPhone; writing straight into the phone's Contacts app (the vCard
share already offers Contacts); native speech; push notifications; store billing for scan packs.

## Open question
None blocking. Later: whether to add a direct Contacts plugin once real use shows the share-sheet route is too many taps.
