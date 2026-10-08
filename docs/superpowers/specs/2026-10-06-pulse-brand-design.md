# Pulse: the rename and the new mark (rebrand, part 1 of 4)

Date: 2026-10-06. Branch `pulse-brand` (cut from `pricing`). Status: awaiting the user's review.

## Goal

The app becomes **Pulse**. The store listing is titled **Pulse - Business Card Reader**, and everywhere else
(the logo, inside the app, marketing) it is just "Pulse", with the tagline **The pulse of your network**. A new
mark replaces the card-and-beat icon on every surface: Android launcher, splash, PWA, favicon and store icons.

This is part 1 of 4. The parts that follow, each with its own spec: 2, a first-run welcome and in-context tips;
3, SEO and the store listings (business card reader, card scanner, card reader, expo, exhibition); 4, native
payments (Play Billing, then Apple IAP; Razorpay later).

## Decisions (from the user, 2026-10-06)

| Question | Answer |
|---|---|
| Order of the four parts | Rename + logo, then onboarding, then SEO/store, then native payments |
| Logo direction | D1: scan-frame corners around a teal beat whose peaks are three white people-dots (D's frame with C's dots) |
| Android app ID | Keep `in.cardpulse.app`. Users never see it, and the Supabase sign-in redirect is unchanged |
| Name under the icon | "Pulse" |
| Store title | "Pulse - Business Card Reader" (set in the consoles in part 3; `index.html`'s title uses it now) |

## The mark

A 32-unit grid. The master is `src/assets/brand/pulse-mark.svg`, and every other file is rendered from it.

- **Tile:** rounded square, rx 7.5, gradient #5A4FE0 → #3B2FC9 from top-left to bottom-right.
- **Scan frame:** four white corner brackets, stroke 2, round caps:
  `M6.5 11.5v-3a2 2 0 0 1 2-2h3 M20.5 6.5h3a2 2 0 0 1 2 2v3 M25.5 20.5v3a2 2 0 0 1-2 2h-3 M11.5 25.5h-3a2 2 0 0 1-2-2v-3`
- **Beat:** teal #5DD6C8 (the camera's existing "lock" colour), stroke 1.8, round caps and joins:
  `M9 16.5h3l1.9-4.6 3 8.8 2-5.2 1.3 1h3.8`
- **People:** three white dots, r 1.85, at (13.9, 11.9), (16.9, 20.7) and (18.9, 15.5).

Variants, all from the same geometry:

| Variant | Use | Difference |
|---|---|---|
| `pulse-mark.svg` | PWA, favicon, apple-touch, in-app `Logo` | As above |
| `pulse-mark-square.svg` | Play 512 and App Store 1024 icons | No corner radius; the stores round it themselves |
| `pulse-foreground.svg` | Android adaptive foreground | No tile, transparent; artwork scaled into the central 66 of 108 dp so circle and squircle masks never clip it |
| `pulse-monochrome.svg` | Android 13+ themed icon | Frame, beat and dots in one colour, no tile |
| Adaptive background | Android | Flat #3B2FC9, via `@color/ic_launcher_background` |
| Splash | Android splash drawables, portrait and landscape | Mark centred on the app's light ground (#F4F4FA) and dark ground (#0F0F17) |

**Wordmark:** "Pulse" in Inter at weight 750 with −0.03em tracking, with the tagline in Inter 500 in `ink-3` below
it or beside it. `src/components/Logo.tsx` draws the new mark inline (driven by tokens, so the `light` tone on the
indigo Home masthead keeps working: a translucent white tile, with the beat and dots in their usual colours).

## The asset pipeline

`scripts/make-icons.mjs` is rewritten: it reads the SVG masters, renders each target size with `@resvg/resvg-js`
(a new dev dependency that only runs on the Mac, never in the app bundle) and writes:

- `public/`: `favicon.png` (64), `apple-touch-icon.png` (180), `pwa-192x192.png`, `pwa-512x512.png`,
  `pwa-maskable-512x512.png` (the mark inside the 80% maskable safe zone on the indigo ground)
- `android/app/src/main/res/mipmap-{m,h,xh,xxh,xxxh}dpi/`: `ic_launcher.png`, `ic_launcher_round.png`,
  `ic_launcher_foreground.png` at 48/72/96/144/192 (legacy) and 108/162/216/324/432 (foreground)
- `android/app/src/main/res/mipmap-anydpi-v26/ic_launcher*.xml`: these gain `<monochrome>` pointing at a
  `ic_launcher_monochrome` drawable
- `android/app/src/main/res/drawable*/splash.png` at each density and orientation it already has
- `store/`: `play-icon-512.png` and `appstore-icon-1024.png` (new folder, not shipped in the app)

`npm run icons` runs it. The script and its output are committed; the build does not depend on the script.

## The rename

**Changed to "Pulse"** (everything a user can read):

- `capacitor.config.ts` `appName`; Android `res/values/strings.xml` `app_name` and `title_activity_main`
- `index.html`: `<title>Pulse - Business Card Reader</title>`, the meta description, `apple-mobile-web-app-title`
  "Pulse", the `<noscript>` text
- `vite.config.ts` PWA manifest: `name` "Pulse - Business Card Reader", `short_name` "Pulse",
  `theme_color` #3B2FC9
- Every user-facing "CardPulse" in `src/` (labels, toasts, share text, PublicCard footer, Settings, the
  dictation panel's "beat" copy), `public/privacy.html`, and the Worker's user-visible strings, if there are any
- Export file names: `pulse-contacts-<stamp>.csv/.vcf`, and the backup zip `pulse-backup-<date>.zip`
- `PRODUCT.md`, `DESIGN.md` (name, description, the mark), `README.md`, `ROADMAP.md` (a line noting the rename)

**Kept as is** (invisible to users, and changing them would cost data or break links):

- App ID `in.cardpulse.app`, the custom URL scheme, the Android namespace
- Every `cardpulse.*` localStorage key and the IndexedDB name (renaming them would wipe saved settings, the
  sync outbox and contacts)
- `cardpulse-backup.json` inside the backup zip, so old backups still import and new backups import into older
  installs
- The Worker name `cardpulse-api`, the Supabase project, table names, the GitHub Pages path

## Error handling and compatibility

- Restoring a backup: it reads the inner `cardpulse-backup.json` as it does today, so the outer zip's name
  doesn't matter. Nothing changes in `backup.ts` except `backupFileName`.
- Existing installs keep all their data, because no storage key changes. The launcher icon and name update when
  the APK is reinstalled.

## Testing

- **New unit test** (`test/brand.test.mjs`): scans `src/**/*.{ts,tsx}`, `index.html`, `vite.config.ts`,
  `capacitor.config.ts`, `public/privacy.html` and `android/.../strings.xml` for "CardPulse" in user-visible
  text, allowing only the known internal identifiers (`cardpulse.` keys, `cardpulse-backup.json`,
  `in.cardpulse.app`, `cardpulse-api`).
- **New unit test:** `backupFileName()` returns `pulse-backup-YYYY-MM-DD.zip`, and a zip containing
  `cardpulse-backup.json` still restores.
- The existing suite passes; `npm run build` passes.
- **Visual check of the icons:** the script also writes `store/preview.png`, a contact sheet of the mark at 24/48/96,
  in circle, squircle and rounded-square masks, themed (monochrome) and on both splash grounds, for review before
  the APK is built.
- **On the phone** (the user checks, as the user prefers; I do not launch a browser or emulator): install the
  debug APK, then check the icon on the home screen and in the app drawer, the name "Pulse" under it, the themed
  icon with Material You on, the splash screen in light and dark, the Home masthead logo, and an export and a
  backup file name.

## Out of scope (later parts)

Store listing text, keywords, screenshots and the feature graphic (part 3); the website's landing page and SEO
(part 3); the welcome flow and tips (part 2); any iOS project files (no `ios/` folder yet; the App Store icon
is produced now so it is ready).
