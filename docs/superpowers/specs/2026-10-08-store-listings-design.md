# Google Play listing: text, screenshots, feature graphic, Data safety (rebrand, part 3 of 4)

Date: 2026-10-08. Branch `pulse-brand`. Status: awaiting the user's review.

## Goal

Everything Google Play needs to publish Pulse, written to rank for **business card
reader, card scanner, card reader, visiting card, expo, exhibition, digital business card** and to convert people who
see the listing. All of it lives in `store/`, and is generated or checked by scripts and tests, so a later change is
one edit.

## Decisions (from the user, 2026-10-07 / 08)

| Question | Answer |
|---|---|
| Website / landing page | Not now. Store listings only |
| Markets | India, English (en-IN) |
| Screenshots | Claude captures the real app (headless Chrome, sample data) and frames them; the user does no phone work |
| Slide order | 1 Scan · 2 Exhibition mode · 3 Many cards · 4 Digital card · 5 Read right · 6 Pulse Brief · 7 One tap · 8 Feature wall |
| Data safety | Draft the Play Console answers from the privacy policy |
| Apple App Store | Not in this part (user, 2026-10-08). Written when the iPhone app is built, using Play's real search and install data |
| Skills used | `aso` (limits, what Play indexes), `app-store-screenshots` (deck design rules), `webapp-testing` (capture) |

## Positioning (from research, 2026-10-07)

CamCard (100M+ users) already advertises AI "conversation starters" and company profiles, so Pulse Brief alone does not
differentiate. The listing leads with what no competitor combines: **several cards in one photo**, **exhibition mode**
(events, stall QR lead capture, per-event export), and **India-first reading** (+91, STD codes, GSTIN, Hindi and regional
scripts). Pulse Brief comes after those. There are no ratings, installs, awards or customers yet, so no slide or line claims any.

## The listing text: `store/listing.json`

One file holds every field, so both the tests and the Play Console copy-paste read the same source.

**Google Play (en-IN)**

| Field | Limit | Text |
|---|---|---|
| Title | 30 | `Pulse - Business Card Reader` (28) |
| Short description | 80 | `Scan business & visiting cards to contacts. Many cards in one photo. Expo-ready.` (80) |
| Full description | 4,000 | ~2,500 characters, structured below |

Full description structure: an opening line naming Pulse a business card reader and visiting card scanner built for
India's expos and trade fairs; then short headed sections in the slide order (scan; exhibition mode; many cards in one
photo; digital business card; India-first reading; Pulse Brief and conversation starters; call, WhatsApp, save to phone,
export to Excel); then "Your contacts stay yours" (on-device by default, export any time); then the plan line (20 cards
a month free; paid plans and packs). Each of "business card scanner/reader", "visiting card", "card reader",
"exhibition" and "expo" appears naturally, about 2–3% density in total; no keyword lists, no "best" or "#1".

## Screenshots: `store/screens/`

**Capture** (`scripts/store-capture.mjs`, Playwright, Chromium, dev-only): starts the Vite dev server, opens the app at
412×915 CSS px (a common Android size) at device scale 3, seeds made-up data through the app's own modules
(`src/lib/db.ts`, `events.ts`, `mycards.ts`) by dynamic import in the page, marks the tour and tips seen, then visits
each screen and saves a PNG to `store/screens/raw/`. Sample people, companies and events are made up (Rajesh Shah, ABC
Polymers, Anita Kapoor, Neha Gupta, India Plast 2026 …); nothing comes from the user's data. The live camera cannot be
captured, so slide 1 uses a drawn scene.

**Compose** (`store/slides/*.html` + `scripts/store-render.mjs`): each slide is an HTML page at 1080×1920 rendered by
the same Playwright. Fonts are the app's own bundled Inter and Caveat. Rules from `app-store-screenshots`:

- The background is designed, never white: Pulse indigo, deep indigo, or soft lilac (#EEEDFB), alternating.
- The headline fills the top 30–40%, in Inter 800, with one key word hand-written in Caveat.
- One accent per slide: a floating chip with real-looking content, or a hand-drawn arrow.
- Framing varies: tilted phone, bezelless phone, two phones, no phone (slide 1, slide 8).
- Slide 8 is a feature wall.
- It passes the thumbnail test: the headline is readable at 160px wide.

| # | Ground | Headline | Visual |
|---|---|---|---|
| 1 | Indigo | Scan *business cards* in seconds | 3D card stack locking into the teal frame; chips "+91 98240 22893", "GSTIN read" |
| 2 | Soft lilac | *Exhibition* mode for every expo | Events screen; chips "LIVE · 128 · +24 today", "2 duplicates flagged", "Export to Excel", "Neha Gupta left her details at your stall" |
| 3 | Deep indigo | Many cards, *one photo* | Tilted phone: the review screen with 4 people from one photo |
| 4 | Soft lilac | Your *digital card*, one scan away | Two phones: My Card, and its QR; chip "Shared on WhatsApp" |
| 5 | Indigo | Every detail, *read right* | A contact with +91 numbers and GSTIN; chip "हिंदी cards too" |
| 6 | Soft lilac | Never go into a call *cold* | Pulse Brief with conversation starters; a starter chip floating off it |
| 7 | Deep indigo | Call or WhatsApp in *one tap* | Home watchlist; a hand-drawn arrow to Call |
| 8 | Indigo | *And so much more* | Feature wall: Export to Excel · Save to phone · Caller ID with company · Hindi & regional scripts · Duplicate check · Follow-up reminders · Works offline · Voice notes |

Every claim on a slide is something the app does today.

**Feature graphic:** `store/feature-graphic.png`, 1024×500: the indigo wave band, the mark, "Pulse", "Business Card
Reader", the tagline, and the 3D card stack. No text in the outer 15% (Play crops it on some surfaces).

Output: `store/play/phone/01-scan.png` … `08-more.png` (1080×1920, RGB, no alpha), `store/play/feature-graphic.png`.

## Data safety draft: `store/data-safety.md`

Answers to Play Console's Data safety form, taken from `public/privacy.html`. The answers draw on:

- data collected: name and email (account); photos (card images sent for reading, not stored); contacts (only with sync on, or published cards and leads); app activity (usage counts for the plan); audio (none recorded)
- what is shared with third parties: card photos and Brief fields processed by Google Gemini
- encryption in transit
- deletion (in-app account and cloud deletion)
- no ads, analytics or tracking

Each answer cites the privacy-policy line it comes from. It is marked "draft, to check before submitting".

## Testing (`test/store.test.mjs`)

- Every text field is within its Play limit.
- The Play title has no emoji, no ALL CAPS, and no "best", "#1" or "free".
- The full description contains each target phrase at least twice and names "exhibition mode".
- Images: 8 Play screenshots at 1080×1920 with no alpha channel, and the feature graphic at 1024×500 with no alpha channel.
- `data-safety.md` exists and says "draft".

## Out of scope

The website and landing page; the Apple App Store listing and iPhone screenshots; Hindi and other locales; a store preview video; submitting to
Play Console. The user does the submission, and that comes with part 4, payments.
