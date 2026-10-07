# Google Play Listing Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Everything Google Play needs: the listing text, 8 framed screenshots captured from the real app, the feature graphic and a Data safety draft, all in `store/`, checked by tests.

**Architecture:** `store/listing.json` holds the text. Playwright drives the app on the Vite dev server: `store/capture/seed.ts` loads made-up data through the app's own storage functions, `store/capture/review.html` mounts the one screen the real flow can't reach (the multi-person review), and `scripts/store-capture.mjs` saves raw phone captures. `store/slides/*.html` compose each store image around those captures. `scripts/store-render.mjs` renders them through the same server and writes RGB PNGs with the PNG writer the icon script already has, moved into a shared module.

**Tech Stack:** Node 26 test runner, Vite dev server (HTTPS via basic-ssl, so Playwright ignores certificate errors), Playwright + Chromium as dev dependencies, `@resvg/resvg-js` (already a dev dependency), the app's bundled Inter and Caveat.

**Spec:** `docs/superpowers/specs/2026-10-08-store-listings-design.md`

## Global Constraints

- Google Play only (no Apple fields), English (India).
- Play title `Pulse - Business Card Reader` (≤30). Short description `Scan business & visiting cards to contacts. Many cards in one photo. Expo-ready.` (≤80). Full description ≤4,000.
- No "best", "#1", emoji or ALL-CAPS words in the title. No ratings, installs, awards or customers claimed anywhere.
- Slides at 1080×1920 and the feature graphic at 1024×500, both PNG with no alpha (colour type 2).
- Sample people, companies and events are made up. Nothing from the user's data.
- Slide order and headlines (the hand-written words in Caveat are marked with asterisks):
  1. Scan *business cards* in seconds
  2. *Exhibition* mode for every expo
  3. Many cards, *one photo*
  4. Your *digital card*, one scan away
  5. Every detail, *read right*
  6. Never go into a call *cold*
  7. Call or WhatsApp in *one tap*
  8. *And so much more*
- Backgrounds alternate between indigo `#3B2FC9`, soft lilac `#EEEDFB` and deep indigo `#221A7E`, never white.
- Playwright and Chromium run only on this Mac, from the scripts. The user has authorised taking these screenshots.

## Review Focus

- A claim on a slide or in the description that the app can't back up. Check each line against PRODUCT.md and the code.
- A capture that shows the tour, a tip, the sign-in prompt or an empty state instead of the intended screen. The seed marks the tour and tips seen; the capture script waits for each target's text.
- A slide whose headline can't be read at thumbnail size (160 px wide). `store-render` also writes a contact sheet at thumbnail size for a visual check.
- A PNG with an alpha channel, or at the wrong size. Play rejects or crops it. Tested.
- Sample data leaking into the user's real install. Everything runs in Playwright's own throwaway browser profile, never in the app.

---

### Task 1: The listing text (`store/listing.json`)

**Files:**
- Create: `store/listing.json`, `test/store.test.mjs`
- Modify: `package.json` (add the test to the `test` script)

- [ ] **Step 1: Write the failing test**

```js
// Run: node --test test/store.test.mjs
// The Google Play listing: within Play's limits, no banned title words, the search phrases present, no claims we cannot back.
import test from 'node:test'
import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'

const L = JSON.parse(readFileSync('store/listing.json', 'utf8')).play
const count = (text, phrase) => text.toLowerCase().split(phrase.toLowerCase()).length - 1

test('every field fits Play', () => {
  assert.equal(L.title, 'Pulse - Business Card Reader')
  assert.ok(L.title.length <= 30)
  assert.equal(L.shortDescription, 'Scan business & visiting cards to contacts. Many cards in one photo. Expo-ready.')
  assert.ok(L.shortDescription.length <= 80)
  assert.ok(L.fullDescription.length <= 4000 && L.fullDescription.length >= 1800, String(L.fullDescription.length))
})
test('the title keeps to Play policy', () => {
  assert.ok(!/best|#1|free|top|new/i.test(L.title))
  assert.ok(!/\p{Extended_Pictographic}/u.test(L.title + L.shortDescription))
  assert.ok(!/\b[A-Z]{4,}\b/.test(L.title))
})
test('the description carries the search phrases, naturally', () => {
  for (const p of ['business card', 'visiting card', 'card reader', 'card scanner', 'exhibition', 'expo']) assert.ok(count(L.fullDescription, p) >= 2, p)
  assert.ok(/exhibition mode/i.test(L.fullDescription))
  assert.ok(/digital (business )?card/i.test(L.fullDescription))
})
test('no claims we cannot back', () => {
  const all = Object.values(L).join(' ')
  assert.ok(!/\b(best|#1|number one|million|award|rated|trusted by|\d[\d,]*\+? (users|downloads|installs))\b/i.test(all))
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/store.test.mjs`
Expected: FAIL with ENOENT for `store/listing.json`.

- [ ] **Step 3: Write `store/listing.json`**

```json
{
  "play": {
    "language": "en-IN",
    "title": "Pulse - Business Card Reader",
    "shortDescription": "Scan business & visiting cards to contacts. Many cards in one photo. Expo-ready.",
    "fullDescription": "Pulse is a business card reader and visiting card scanner built for India's expos, trade fairs and meetings. Point your camera at a card and it becomes a contact you can call, WhatsApp or save to your phone, in seconds, with nothing to type.\n\nEXHIBITION MODE FOR EVERY EXPO\nCreate an event and every card you scan is filed under it. See how many cards you collected today, spot duplicates, and export each event to Excel (CSV) or vCard when the show ends. In exhibition mode your stall gets a QR code too: visitors scan it and leave their details straight in your app.\n\nMANY CARDS, ONE PHOTO\nLay a stack of business cards flat and take one picture. The card scanner finds every card and reads everyone on them. A card that lists partners or directors becomes one contact per person, and the front and back of a card are read together.\n\nYOUR DIGITAL BUSINESS CARD\nMake your own digital card in a minute. Share it on WhatsApp as a picture or a contact file, or let people scan its QR code.\n\nEVERY DETAIL, READ RIGHT\nPulse is a card reader made for Indian visiting cards: +91 mobile numbers, STD codes for landlines, GSTIN, and cards in Hindi, Gujarati, Tamil and other regional scripts. Anything that needs a second look is flagged, so you can correct it in a tap.\n\nNEVER GO INTO A CALL COLD\nPulse Brief reads up on the person and their company, and gives you conversation starters before you call or WhatsApp.\n\nFOLLOW UP IN ONE TAP\nCall or WhatsApp straight from the contact. Add notes by voice, set follow-up dates, star the people who matter, and save contacts as \"Name (Company)\" so the company shows when they call you.\n\nYOUR CONTACTS STAY YOURS\nContacts live on your phone. Export them any time to Excel (CSV) or vCard, at no cost. Sync across your phones only if you turn it on. No ads and no tracking.\n\nPLANS\nReading cards needs a Google sign-in. Every account gets 20 cards a month free. Paid plans, card packs and an Exhibition pass are there for busy weeks and big shows."
  }
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `node --test test/store.test.mjs`
Expected: PASS, 4 tests. If the phrase count fails for a phrase, rewrite a sentence to use it naturally. Never append a keyword list.

- [ ] **Step 5: Add the test to `npm test` and commit**

Insert ` test/store.test.mjs` after `test/splash.test.mjs` in the `test` script only.

```bash
git add store/listing.json test/store.test.mjs package.json
git commit -m "Play listing text: title, short and full description for business card reader, visiting card and card scanner searches, exhibition mode named; checked against Play's limits and policy"
```

---

### Task 2: The Data safety draft (`store/data-safety.md`)

**Files:**
- Create: `store/data-safety.md`
- Modify: `test/store.test.mjs`

- [ ] **Step 1: Add the failing test**

Append to `test/store.test.mjs`:

```js
test('the Data safety draft exists, is marked a draft, and covers what Play asks', () => {
  assert.ok(existsSync('store/data-safety.md'))
  const d = readFileSync('store/data-safety.md', 'utf8')
  assert.match(d, /draft/i)
  for (const h of ['Data collected', 'Data shared', 'Security practices', 'Deletion']) assert.ok(d.includes(h), h)
  for (const k of ['Name', 'Email address', 'Photos', 'Contacts', 'App interactions']) assert.ok(d.includes(k), k)
  assert.match(d, /privacy\.html/)
})
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `node --test test/store.test.mjs`
Expected: FAIL on `existsSync('store/data-safety.md')`.

- [ ] **Step 3: Write the draft**

`store/data-safety.md`: a heading "Google Play Data safety: answers (draft, check before submitting)", a line saying the answers come from `public/privacy.html` as of 6 October 2026, then these sections, each answer citing the privacy-policy line it rests on:

- **Data collected**, as a table of data type, collected?, shared?, optional?, purpose, and source line:
  - **Name** and **Email address:** yes, from Google sign-in. Not shared. Required to read cards. Purpose: account management.
  - **Photos:** yes, card photos sent for reading and not stored by us. Processed by Google Gemini as a service provider, which Play does not count as sharing. Purpose: app functionality.
  - **Contacts:** only with sync on, a published card, or leads collected at a stall. Optional. Purpose: app functionality.
  - **App interactions:** yes, counts of cards read and briefs used, for the plan balance. Purpose: app functionality and account management.
  - **Audio:** no. Dictation uses the phone's speech recogniser, and Pulse records nothing.
  - **Device identifiers, location, financial info, web history:** no.
- **Data shared:** none in Play's sense. Card photos and Brief fields go to Google Gemini as a processor acting for Pulse, so it's declared as processing, not sharing.
- **Security practices:** data encrypted in transit (HTTPS) yes. Users can request deletion yes: in the app via Settings → Account → Delete cloud data / Delete account, plus the GitHub issues route the policy names.
- **Deletion:** on the phone (Delete all data, uninstall), on the server (Delete cloud data), and the account (Delete account), each quoted from the policy.
- **Other answers:** no ads, no analytics SDKs, not directed at children, and the privacy policy URL is `https://prasenjit-sharma.github.io/cardpulse/privacy.html` (check that the live URL matches before submitting).

- [ ] **Step 4: Run it to make sure it passes**

Run: `node --test test/store.test.mjs`
Expected: PASS, 5 tests.

- [ ] **Step 5: Commit**

```bash
git add store/data-safety.md test/store.test.mjs
git commit -m "Play Data safety answers, drafted from the privacy policy line by line; marked to check before submitting"
```

---

### Task 3: Capture the real screens

**Files:**
- Create: `store/capture/seed.ts`, `store/capture/review.html`, `store/capture/review.tsx`, `scripts/store-capture.mjs`
- Output: `store/screens/raw/{home,events,contact,brief,mycard,share,review}.png`
- Modify: `package.json` (`playwright` dev dependency, `store:capture` script), `.gitignore` (nothing: the raw captures are committed so slides can be re-rendered without capturing again)

- [ ] **Step 1: Install Playwright and its Chromium**

Run: `npm install --save-dev playwright && npx playwright install chromium`
Expected: Chromium downloads into Playwright's cache. Check with `node -e "require('playwright')"`.

- [ ] **Step 2: The seed, run inside the page**

`store/capture/seed.ts` exports `seed(): Promise<void>`. It imports `putCardRaw` from `/src/lib/db.ts`, `saveEventsRaw` from `/src/lib/events.ts` and `putMyCardRaw`, `emptyCard` from `/src/lib/mycards.ts`, and writes:

- **An event:** "India Plast 2026", live today (`start`/`end` = today ± 1 day, yyyy-mm-dd).
- **About 14 cards** across today and the last week, most filed under that event, made up and Indian. Each card is `status: 'done'`, `reviewed: true` and `opened: true`, with `extracted` = `corrected`.
  - The people include Rajesh Shah (ABC Polymers Pvt. Ltd., Surat, GSTIN 24AABCA1234F1Z5, phones `+91 98240 22893` and `0261 245 6789`), Anita Kapoor, Vikram Rao, Meera Iyer and Arjun Malhotra.
  - Two cards share a person, so the duplicate flag shows.
  - Rajesh Shah gets a `followUp` of today and `priority: true`.
  - Rajesh Shah gets a `brief`: `{ person, company, starters: ['Ask how the new Surat plant is coming along', 'Their exports to Kenya doubled this year'], links: [], sources: [{ title: 'abcpolymers.in', url: 'https://abcpolymers.in' }], suggestions: '', at: Date.now(), model: 'sample' }`. Check `BriefSource`'s shape in `shared/brief-core.ts`.
- **A My Card:** "Aarav Mehta, Founder, Mehta Exports", with phone, email and website, from `emptyCard()`.
- **Storage flags:** `cardpulse.tour` = `'1'` and `cardpulse.tips` = every tip id, so neither the tour nor a tip covers a capture.

- [ ] **Step 3: The review screen page**

`store/capture/review.html` loads `/src/styles.css` (through `review.tsx`'s imports) and mounts `ScanResult` with one sample `CardRecord` that has 4 people in `extracted`/`corrected` (`reviewed: false`), the event list and no-op callbacks. Copy `main.tsx`'s font and style imports so it looks identical to the app.

- [ ] **Step 4: The capture script**

`scripts/store-capture.mjs`:
- starts `vite --port 5199 --strictPort` as a child process and waits for "ready";
- launches Chromium with `ignoreHTTPSErrors: true`, a 412×915 viewport, `deviceScaleFactor: 3`, `colorScheme: 'light'`, and a fresh context (a throwaway profile);
- runs `await import('/store/capture/seed.ts').then((m) => m.seed())` in the page, then reloads.

Then it captures each screen, each time waiting for a known piece of text first and allowing 800 ms for animations to settle:

| File | How to reach it | Wait for |
|---|---|---|
| `home.png` | Home | "Due" |
| `events.png` | The Events tab | "India Plast 2026" |
| `contact.png` | Search or tap Rajesh Shah's row | "GSTIN" or "24AABCA1234F1Z5" |
| `brief.png` | On the contact, tap Brief | "Ask how the new Surat plant" |
| `mycard.png` | The My Card tab | "Aarav Mehta" |
| `share.png` | Tap "Share card" | the QR or share sheet |
| `review.png` | `/store/capture/review.html` | the first person's name |

Finally it closes the browser and stops Vite. Add `"store:capture": "node scripts/store-capture.mjs"` to `package.json`.

- [ ] **Step 5: Run it and look at every capture**

Run: `npm run store:capture`
Expected: 7 PNGs at 1236×2745. Open each one with the Read tool. Check that it's the intended screen, has no tour, tip, sign-in sheet or empty state, has no real personal data, and reads well. Fix the seed or the waits and re-run until all 7 are right. Ledger any change of screen.

- [ ] **Step 6: Commit**

```bash
git add store/capture scripts/store-capture.mjs store/screens/raw package.json package-lock.json
git commit -m "Store screenshots captured from the real app: Playwright drives the dev server with made-up sample people, an expo, a brief and a digital card loaded through the app's own storage; the multi-person review is mounted on its own page"
```

---

### Task 4: Compose the slides and the feature graphic

**Files:**
- Create: `scripts/png.mjs` (`rgbPng` moved out of `scripts/make-icons.mjs`, which imports it), `store/slides/slide.css`, `store/slides/01-scan.html` … `08-more.html`, `store/slides/feature-graphic.html`, `scripts/store-render.mjs`
- Output: `store/play/phone/01-scan.png` … `08-more.png`, `store/play/feature-graphic.png`, `store/play/contact-sheet.png`
- Modify: `test/store.test.mjs`, `package.json` (`store:render` script)

- [ ] **Step 1: The failing image tests**

Append to `test/store.test.mjs`:

```js
const head = (f) => { const b = readFileSync(f); return { w: b.readUInt32BE(16), h: b.readUInt32BE(20), type: b[25] } }
const SLIDES = ['01-scan', '02-exhibition', '03-one-photo', '04-digital-card', '05-read-right', '06-brief', '07-one-tap', '08-more']
test('eight Play screenshots at 1080x1920, no alpha', () => {
  for (const s of SLIDES) assert.deepEqual(head(`store/play/phone/${s}.png`), { w: 1080, h: 1920, type: 2 }, s)
})
test('the feature graphic at 1024x500, no alpha', () => {
  assert.deepEqual(head('store/play/feature-graphic.png'), { w: 1024, h: 500, type: 2 })
})
```

Run: `node --test test/store.test.mjs`. Expected: FAIL with ENOENT.

- [ ] **Step 2: The shared PNG writer**

Move `crc32`, `chunk` and `rgbPng(path, svg)` from `scripts/make-icons.mjs` into `scripts/png.mjs`. Add `rgbFromPng(pngBuffer)`, which wraps the PNG in an SVG `<image href="data:image/png;base64,…">` at its own size, renders it with resvg, and returns RGB PNG bytes. Make `make-icons.mjs` import from it. Then run `npm run icons && node --test test/icons.test.mjs`, expecting no change and a PASS. Keep the icon outputs byte-identical where possible, and if not, check `git diff --stat` shows only PNGs.

- [ ] **Step 3: The slide template**

`store/slides/slide.css`:
- Sets a 1080×1920 body and the grounds `.indigo` (`#3B2FC9` to `#2A1F9E`), `.lilac` (`#EEEDFB`) and `.deep` (`#221A7E` to `#15104F`).
- The headline: Inter 800 at 96px, -0.035em, 1.02 line height, top 150px, sides 90px, white on indigo and ink on lilac. Its hand-written word `.hand` is Caveat 700 at 1.3em, coloured `#A9A3FF` on indigo and deep, `#3B2FC9` on lilac.
- A sub-line in Inter 400 at 40px, at 75% opacity.
- `.phone`: rounded 64px, a 14px bezel `#15142A` with a soft shadow `0 60px 120px -40px rgba(10,6,60,.6)`, the capture inside it, positioned per slide.
- `.chip`: white, 28px radius, Inter 600 at 34px, the soft shadow.
- `.scribble`: an SVG stroke in 4px light indigo.

Fonts load from `/node_modules/@fontsource-variable/inter/wght.css` and `/node_modules/@fontsource/caveat/latin-700.css` through the Vite server. Each `0N-*.html` has the spec's ground, headline, visual and one accent, referencing `/store/screens/raw/*.png`:
- Slide 1 has no phone: the 3D card stack from `welcome.css`'s `.wl-deck`/`.wl-bc` rules, scaled up 3.2× and copied into `slide.css`, with chips "+91 98240 22893" and "GSTIN read".
- Slide 3 tilts its phone 6° with a perspective.
- Slide 4 has two phones (`mycard.png` and `share.png`).
- Slide 8 is a feature wall of eight lines in Inter 700 at 64px, each led by a teal dot.

`feature-graphic.html` (1024×500) has the indigo wave band, the mark (copied from `brandMark` geometry as inline SVG), "Pulse" in Inter 800 at 120px, "Business Card Reader" at 44px, the tagline with "pulse" hand-written, and the card stack on the right. Text stays inside the middle 70%.

- [ ] **Step 4: The render script**

`scripts/store-render.mjs` starts Vite as `store-capture.mjs` does, sets each slide's viewport to its size at `deviceScaleFactor: 1`, waits for `document.fonts.ready` plus 300 ms, screenshots with `animations: 'disabled'`, converts to RGB with `rgbFromPng`, and writes to `store/play/`. It then writes `store/play/contact-sheet.png`: all 8 slides at 160 px wide in one row, for the thumbnail test. Add `"store:render": "node scripts/store-render.mjs"`.

- [ ] **Step 5: Render, look, fix once**

Run: `npm run store:render && node --test test/store.test.mjs`
Expected: PASS, 7 tests. Then open `store/play/contact-sheet.png` and each slide with the Read tool, and apply the spec's rules: a readable headline at thumbnail size, one accent, a designed ground, and nothing clipped or overlapping. Fix everything in one batch, render once more, and stop.

- [ ] **Step 6: Commit**

```bash
git add scripts/png.mjs scripts/make-icons.mjs scripts/store-render.mjs store/slides store/play test/store.test.mjs package.json
git commit -m "Eight Play screenshots and the feature graphic: real captures framed on indigo and lilac, headlines with one hand-written word, one accent each, a feature wall to close; RGB PNGs at Play's sizes"
```

---

### Task 5: Docs and handoff

**Files:**
- Create: `store/README.md`
- Modify: `ROADMAP.md`, `README.md`

- [ ] **Step 1: `store/README.md`**

It covers:
- What each file is.
- Which Play Console field each goes into: the title, short and full description from `listing.json`; the phone screenshots from `play/phone/` in order; the feature graphic; the app icon from `store/play-icon-512.png`; Data safety from `data-safety.md`.
- How to regenerate: `npm run store:capture` then `npm run store:render`.
- That the Apple listing is deliberately not done yet.

- [ ] **Step 2: ROADMAP and README**

In ROADMAP's rebrand section, change item 3 to: `Google Play listing (text, 8 screenshots, feature graphic, Data safety draft): built, in store/. The website and the App Store listing come later.` In README's commands, add `npm run store:capture` and `npm run store:render`.

- [ ] **Step 3: Full verification and commit**

Run: `npm test && npm run build`
Expected: all pass and the build succeeds.

```bash
git add store/README.md ROADMAP.md README.md
git commit -m "Docs: store/ explained field by field for Play Console; the listing in the roadmap"
```
