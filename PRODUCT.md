# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

Ships today as an installable web app (React + Vite PWA, GitHub Pages). Confirmed destination: Android
and iPhone apps in both stores, planned via a native wrapper around this same codebase. Per Impeccable's
rule a wrapper does not make the design language native, so the design must feel at home on both phones
without imitating either OS exactly.

## Stack

Existing codebase: React 19 + TypeScript + Vite, no UI framework, hand-written CSS with design tokens.
Card reading runs through a Cloudflare Worker (`server/`) that holds the Gemini key. Storage is on-device
(IndexedDB + localStorage). Node's built-in test runner covers the pure logic (66 tests).

## Users

Primary: an individual business person in India who collects printed business cards in meetings and at
trade shows, then wants to call or WhatsApp those people. Confirmed by the user as "both, solo first":
build for the individual, with exhibition capture as the feature that wins them over.

Secondary: sales staff working an exhibition stall, capturing hundreds of cards across two or three days
and exporting the leads afterwards.

## Product Purpose

Turn printed business cards into usable contacts in seconds, without typing. Success is a card scanned,
read correctly, and the person reachable (call, WhatsApp, email, saved to the phone) with no correction
needed.

## Positioning

Mechanisms a neighbouring scanner (Covve, CamCard, HiHello) does not combine:

- **Several people from one card or one photo.** Cards listing partners, directors or branch heads become
  one contact each; a table of cards laid out flat becomes many contacts from a single photo and a single
  AI call.
- **Exhibition mode.** Cards are filed under an event as they are captured, with per-event totals,
  duplicate flagging and per-event export.
- **India-first reading.** +91 formatting for bare mobile numbers, STD codes for landlines, GSTIN capture,
  and transliteration of Hindi and other regional scripts.
- **Cost.** One AI call per photo (measured ≈ ₹0.16 per photo on Gemini Flash-Lite) rather than per card,
  which is the basis for undercutting incumbent subscription pricing.
- **Caller ID naming.** Contacts can be saved as "Name (Company)" so the company shows on the phone's
  incoming-call screen, which no dialer does from the company field.

## Operating Context

- **Exhibition hall:** noisy, crowded, poor Wi-Fi, one hand holding a phone, the other holding cards. Speed
  and one-handed reach matter more than richness.
- **Meeting or office:** a card handed over at the end of a conversation; scanned immediately or later from
  a pile.
- **Backgrounds are hostile:** carpet, patterned tablecloths, wood, glossy card stock, uneven light. Card
  detection has already failed in the field on carpet and on a pale card, and was fixed.
- **After the event:** contacts exported as CSV or vCard, or saved into the phone's own Contacts.

## Capabilities and Constraints

Shipped: live camera with automatic card detection (four-corner detection, perspective flattening, hold-to-
capture), single / front+back / many-cards modes, gallery import with auto-crop, multi-person review step,
contacts with search, filters, tags, priority, notes (typed or dictated) and follow-up dates, events,
duplicate detection, vCard and CSV export, caller-ID naming formats, an accuracy lab that scores extraction
against user corrections, light and dark themes, offline app shell, Android back-button handling.

Constraints:

- **On-device storage only.** No accounts, no sync. Clearing site data loses everything; export is the only
  backup. Accounts and sync are an accepted future step (Supabase was chosen in principle, not built).
- **Gemini key lives on the server**, never in the app. Per-IP rate limit is best-effort and in memory.
- **Free Gemini tier** may use submitted images to improve Google's products; a paid tier is required before
  real customers.
- **No payments, no team features, no CRM integrations** yet.
- **Undecided:** pricing, whether the wrapper is Capacitor or a React Native rewrite, Indian DPDP compliance
  work for storing other people's contact data in the cloud.

## Brand Commitments

Name: **CardPulse** (kept by default, but the user has confirmed nothing is fixed — name, logo, colours and
structure are all open to replacement). Existing logo is a business card carrying a pulse line; existing
accent is violet. Both are evidence, not commitments.

## Evidence on Hand

- Real scans and screenshots from the user's own Android phone, including failure cases (card as a thin
  strip, invisible shutter, carpet detection failure, share doing nothing).
- Measured numbers from live runs: ≈ 2.7 s per read, 1,578 input + 344 output tokens on one real card,
  ≈ $0.0013 per photo.
- Competitor screenshots supplied by the user: Covve (list, contact, share sheet, save chooser, camera) and
  HiHello (scan page, camera with auto-detect, review step, contact profile).
- No customers, no testimonials, no pricing, no usage data. Nothing may be fabricated in these areas.

## Product Principles

1. **The scan is the product.** Everything else is filing. Fewest possible taps from opening the app to a
   reachable contact.
2. **Never lose a card.** A failed read, a bad photo or a missed person must always be recoverable, never
   silently dropped.
3. **Show what was read, and let it be corrected.** Extraction is probabilistic; corrections are first-class
   and feed the accuracy lab.
4. **Works in a bad hall.** Poor light, cluttered backgrounds, weak network, one hand, gloves-off haste.
5. **The contact belongs to the user.** On-device by default, exportable at any time, never held hostage.

## Accessibility & Inclusion

Touch targets at least 48px, visible focus rings, reduced-motion support, and light and dark themes are
already in place and must survive any redesign. Text in the app is English; card content may be in Hindi or
other Indian scripts and is transliterated on extraction.
