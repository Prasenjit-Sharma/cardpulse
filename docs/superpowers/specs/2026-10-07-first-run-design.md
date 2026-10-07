# First run: splash, welcome tour and tips (rebrand, part 2 of 4)

Date: 2026-10-07. Branch `pulse-brand`. Status: awaiting the user's review.

## Goal

The first time someone opens Pulse (a new install, or an existing user on the update), they see the Pulse splash,
then a four-screen welcome tour that ends on **Scan your first card**. After that, each of four features shows a
one-time tip the first time the person reaches it. Success: a new user scans a card within their first two minutes,
without being lost or nagged.

## Decisions (from the user, 2026-10-06 / 07)

| Question | Answer |
|---|---|
| Shape of the first run | A short tour, then try it. Sign-in is asked only when they tap Scan (the existing sign-in prompt) |
| Tips | All four: scan modes, Exhibition, contact actions + Pulse Brief, My Card / Collect leads |
| Existing users | See the tour once too; it doubles as the rebrand announcement ("CardPulse is now Pulse") |
| Visual style | A: an indigo illustration area on top, the words on the app's white page below, dots, Next button |
| Splash not visible (reported on the phone, 2026-10-07) | Fixed here, see below |

## The splash fix

**Cause:** on Android 12+, the system splash (the `windowSplashScreenBackground` ground plus the launcher icon) stays
only until the activity draws its first frame. Capacitor's `BridgeActivity` swaps to `AppTheme.NoActionBar` straight
away in `onCreate`, and nothing calls `installSplashScreen` or holds the splash, so it flashes for a frame or not at
all. The `splash.png` drawables only show on Android 11 and older. Android never shows a splash on a warm start (the
app still in memory). That is expected behaviour.

**Fix:** add `@capacitor/splash-screen` (Capacitor 8 line). It installs the Android 12+ splash and holds it until the
web app says it is ready.
- `capacitor.config.ts` `plugins.SplashScreen`: `launchAutoHide: false`, `launchShowDuration: 4000` (above 0: at 0 the plugin skips the launch splash), `showSpinner: false`,
  `backgroundColor: '#F4F4FA'` (it reads `@color/splash_ground` on Android 12+ anyway).
- `Native` (platform.ts) gains `hideSplash?(): Promise<void>`, wired in `src/lib/native.ts` to `SplashScreen.hide({ fadeOutDuration: 200 })`.
- `App` calls `getNative()?.hideSplash?.()` once, after its first render (Home or the tour has painted).
- **Safety:** `main.tsx` also hides it after 4 s whatever happens, and `ErrorBoundary` hides it when it renders, so a
  crash at start-up never leaves the app stuck behind the splash.

## The tour

A full-screen layer (`role="dialog"`, `aria-modal`, labelled) above everything, shown before Home is usable.

**Layout (style A):** the top 52% is indigo (gradient #5A4FE0 → #3B2FC9, following the accent via `--brand-base` like
the masthead) carrying the illustration. Below it, on the page ground, the title (page type, 23px/750), the text (body,
`ink-3`), position dots (the current one widened, in the brand colour), and a full-width primary button. **Skip** sits
top right on the indigo, in white, on every screen but the last. Safe areas are respected (status bar and gesture bar).

**Screens:**

| # | Illustration (inline SVG/CSS) | Title | Text |
|---|---|---|---|
| 1 | The Pulse mark, large; its beat draws in | New install: **Meet Pulse**. Existing user: **CardPulse is now Pulse** | Business cards become contacts you can call or WhatsApp, in seconds. The pulse of your network. |
| 2 | Four cards laid flat, the teal scan frame closing on them, a "4 people" tag | **Several cards, one photo** | Lay a stack of cards flat and take one picture. Everyone on them becomes a contact. |
| 3 | An event strip ("Live" tag, an event name, a count ticking up) | **Built for expos and exhibitions** | Create an event and every card you scan is filed under it. Duplicates are flagged, and you export each event when it ends. |
| 4 | A contact row with Call, WhatsApp and Brief keys | **Follow up while it's warm** | Call, WhatsApp or save to your phone in one tap. Pulse Brief researches the person before you call. |

**Moving through it:** swipe left or right (a horizontal pointer drag over 48px, or a fling), or tap **Next**. The dots
are not buttons, only a position readout (`aria-hidden`; the screen announces "2 of 4"). Android Back goes to the previous screen, and on screen 1 it
skips the tour (`useBackClose`). Each new screen moves keyboard and screen-reader focus to its title.

**The last screen:**
- New install: the primary button is **Scan your first card**. It closes the tour and runs the normal `scan()`, which
  shows the sign-in prompt to someone signed out. Beneath it, a text button: **Look around first**, which just closes the tour.
- Existing user (has any card or any event): the primary button is **Let's go**, and it closes the tour onto Home.

**Motion:** each illustration animates once when its screen arrives (at most 900 ms, transform and opacity only).
Screens slide 240 ms with the app's standard easing. With `prefers-reduced-motion`, nothing animates and screens swap
in place.

**Replay:** Settings, Help group: **Take the tour again** (icon `spark`). It shows the tour with new-install wording,
but its last button is **Done** rather than Scan.

## The tips

One component, `Tip`: a small bubble (surface `board`, 1px `edge`, the app's sheet shadow, 14px text, max 280px wide)
with an arrow towards its target. It holds one sentence and a **Got it** link button. It positions itself against
a target element's rectangle (above or below, whichever has room), stays inside the screen's side gutters, and
repositions on resize. It is announced politely (`role="status"`), and it never blocks the target: tapping the target
works and also dismisses the tip.

| Id | Where and when | Target | Text |
|---|---|---|---|
| `scan-modes` | The camera opens (photo mode) | The mode rail | Card, 2-sided, or Group: lay many cards flat for one photo. |
| `events` | The Events tab opens | The New event button | Create an event, and every card you scan is filed under it, ready to export. |
| `contact` | A contact page opens | The action row (Call, WhatsApp …) | Call, WhatsApp or save to your phone in one tap. Brief researches them before you call. |
| `mycard` | The My Card tab opens | The add-card button, or the first card | Make your digital card. At your stall, visitors scan its QR to leave their details. |

**Rules:**
- At most one tip on screen. None while the tour, a sheet, a dialog or a full-screen layer (stall, pack, plans) is open.
  The camera is the exception: it is itself the layer the `scan-modes` tip belongs to.
- A tip is marked seen when **Got it** is tapped, when its target is used, or when the screen it belongs to closes
  while it was showing. Each tip shows once.
- A tip whose feature was already used is never shown. Existing users who already have an event skip `events`, those
  with a scanned contact opened before skip `contact` (counted as having any card), and those with a My Card skip `mycard`.
  `scan-modes` is skipped once any card was ever scanned from a photo.

## Redesign (from the user, 2026-10-07, after mockups)

This section supersedes the tour's layout and screens and the tips' look above. The behaviour rules (once only,
seeding, blocked storage, Back, replay, one tip at a time, under sheets) are unchanged.

**Voice:** "We are building relationships." The key words of each title are hand-written in **Caveat** (bundled
with `@fontsource/caveat`, weight 700, never loaded from the network) in indigo (`--brand`; light indigo #A9A3FF on
dark grounds). Everything else stays in Inter.

**The tour, five screens.** Each screen has an indigo band across the top with a curved wave edge and soft violet and
teal glows, and a 3D scene drawn in code (CSS perspective, layered surfaces with soft offset shadows). Below it, the
title is centred in Inter 800 with its key words in Caveat, then the text, then dash dots. At the foot: **Skip** on the left
and a solid ink **Next** with an arrow on the right. From screen 2 on, a back chevron sits top left. The last screen
replaces the foot with one full-width indigo button and, for a new install, "Look around first".

| # | Scene | Title (hand-written words in *italics*) | Text |
|---|---|---|---|
| 1 | The Pulse mark as a glossy 3D tile | Meet *Pulse* (everyone, changed 2026-10-07 at the user's request) | Business cards become contacts you can call or WhatsApp, in seconds. The pulse of your network. |
| 2 | A 3D stack of cards in the teal scan frame, with contact chips lifting off it | Several cards, *one photo* | Lay a stack of cards flat and take one picture. Everyone on them becomes a contact. |
| 3 | A tilted live event board (LIVE, the event name, the count, +N today, duplicates, Export CSV) with cards flying in | Built for *expos* and exhibitions | Create an event and every card you scan is filed under it. Duplicates are flagged, and you export each event when it ends. |
| 4 | A tilted digital card with its QR, and a "left her details at your stall" chip | Your card, *one scan away* | Make your digital card and share it on WhatsApp. At your stall, visitors scan its QR to leave their details. |
| 5 | A Pulse Brief card with two conversation starters, in front of the contact with Call and WhatsApp | Never go into a call *cold* | Pulse Brief reads up on the person and their company, and gives you conversation starters before you call or WhatsApp. |

People and events in the scenes are made up (Rajesh Shah, Anita Kapoor, Neha Gupta, Aarav Mehta, India Plast 2026);
nothing in them comes from the user's data.

**Replay:** "Take the tour again" also brings every tip back (`resetTips`), so the tips can be seen again on an install that has already used each feature.

**Tips, Swiggy-style coach marks.** The screen dims (ink at 82%), except for a rounded cut-out around the target. The
cut-out is made with `clip-path` and its even-odd rule, so the target stays bright and tappable through it. A curly
hand-drawn arrow in light indigo runs from the message to the target. The message is centred: the opener "psst, quick
tip" in Caveat, one bold line in light indigo (Inter 700, 21px), one supporting line in white at 74%, and a
rounded indigo **Got it**. A ✕ sits top right. Tapping the dim, the ✕ or Got it closes the tip, and tapping the target
closes it and still does what the target does. The message goes above the target when the target is in the lower half of
the screen, otherwise below. The layout is placed again on resize and scroll.

| Id | Bold line | Supporting line |
|---|---|---|
| `scan-modes` | Card, 2-sided or Group | Lay many cards flat and take one photo. |
| `events` | Create an event first | Every card you scan is filed under it, ready to export. |
| `contact` | Call or WhatsApp anyone in one tap | Pulse Brief researches them before you call. |
| `mycard` | Make your digital card | At your stall, visitors scan its QR to leave their details. |

## State and code

**`src/lib/onboarding.ts`** (pure, no React, tested). It reads and writes through an injected storage
(`Pick<Storage, 'getItem' | 'setItem'>`), and every access is wrapped so a blocked storage behaves as "seen" (no tour
loop on a phone that cannot save).

```ts
export const TOUR_KEY = 'cardpulse.tour'          // '1' once finished or skipped
export const TIPS_KEY = 'cardpulse.tips'          // JSON array of seen tip ids
export type TipId = 'scan-modes' | 'events' | 'contact' | 'mycard'
export type TourVariant = 'new' | 'existing' | 'replay'
export function tourVariant(s, has: { cards: number; events: number }): TourVariant | null   // null = do not show
export function markTourSeen(s): void
export function tipDue(s, id: TipId, has: { cards: number; events: number; myCards: number; photoCards: number }): boolean
export function markTipSeen(s, id: TipId): void
export const TOUR: { title: (v: TourVariant) => string; text: string; art: 'mark' | 'cards' | 'event' | 'follow' }[]
```

**`src/components/Welcome.tsx` + `welcome.css`**: the tour. Props: `variant`, `onDone(action: 'scan' | 'close')`.
**`src/components/Tip.tsx` + rules in `welcome.css`**: the bubble. Props: `target: () => HTMLElement | null`, `text`, `onDismiss`.
**`App.tsx`**: works out `tourVariant` once the cards and events have loaded (not before, so an existing user is
never shown "Meet Pulse"), renders `Welcome`, and decides which tip may show for the current screen. The camera,
Exhibition, ContactDetail and MyCards each get a `tip` prop (or a ref for the target), so the components stay unaware of storage.
**`SettingsPage.tsx`**: the **Take the tour again** row.

**Also:** `PRODUCT.md` "Brand Commitments" is updated for Pulse and the D1 mark (deferred from part 1).

## Error handling

- Storage blocked or throwing: the tour and tips behave as already seen. It never loops.
- The splash plugin missing (a browser, or tests): `hideSplash` is optional and absent, so nothing happens.
- A tip target not in the DOM (for example a hidden button): the tip does not show and is not marked seen.
- The data not yet loaded: no tour decision until both `cards` and `events` have loaded once.

## Testing

**Unit (`test/onboarding.test.mjs`), with a fake storage:**
- A fresh install with no cards and no events gives `'new'`. With cards or events it gives `'existing'`. After
  `markTourSeen` it gives `null`.
- Storage that throws on read gives `null`, and throwing on write doesn't throw.
- `tipDue` is true once and false after `markTipSeen`. It is false for `events` when an event exists, for `mycard` when
  a My Card exists, for `scan-modes` when photo cards exist, and for `contact` when any card exists before the update
  (the stored tip list is seeded on first decision, see below).
- `TOUR` has 4 screens, the variant-dependent first title, and the agreed copy.

**Seeding:** the first time `tourVariant` runs on an existing install, it also records as seen every tip whose feature
the person has used. Otherwise the `contact` tip would show to someone with 500 contacts.

**Brand test:** extended to scan `shared/`, the Android manifest and Java sources (deferred minor from part 1).

**Phone (the user checks; I run no browser or emulator):**
1. Swipe Pulse away from Recents, then open it: the splash (mark on light, or dark in dark mode) holds, then fades into the tour.
2. The tour on an update over the current install: screen 1 says "CardPulse is now Pulse", and the last button is "Let's go".
3. Clear the app's storage (Settings → Apps → Pulse → Storage → Clear), then open it: "Meet Pulse". Swipe, Next, Back and
   Skip all work. "Scan your first card" brings up sign-in.
4. Each tip shows once: in the camera, on Events, on a contact, on My Card.
5. Settings → Take the tour again works.

## Out of scope

The store listing, screenshots and the website (part 3). Payments (part 4). Translations of the tour. Analytics on
tour completion (no analytics exist in the app).
