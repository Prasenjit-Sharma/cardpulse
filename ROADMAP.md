# CardPulse: consolidated plan

Last revised 2026-09-23. Supersedes the earlier five-phase plan and the separate review notes.
`PRODUCT.md` records what is already shipped and today's constraints; this file records what comes next and why.

## 1. Who and what

An Indian professional or exhibitor turns printed cards into reachable contacts without typing, and shares their own
digital card just as easily. Events and exhibitions are the wedge; the business is small prepaid packs that undercut
subscription apps (Covve about $120/year, HiHello Premium about $10/month, CamCard's capped free tier).

Working rules for every phase:

- **Design:** every UI change goes through Impeccable (shape, build, finish review) and stays inside the Card Album
  system. The app's accent is user-selectable (Settings > Appearance), Graphite by default, from one list in `src/lib/accents.ts`. Nothing ships without the user checking it on real phones.
- **Decide by data:** measured figures only (about ₹0.16 per photo on Gemini Flash-Lite; about 1,600 input tokens per
  image, fixed regardless of photo size). No invented prices, users or accuracy claims.
- **Small phases, each shippable.** Each phase ends with tests green, a deploy, and a real-phone check.

## 2. Policies (from reading competitor reviews)

1. Export (CSV, vCard) is always free.
2. No ads, no selling data, one-tap delete-everything.
3. Scan packs never expire; existing users never get new caps.
4. Nothing pushy is shown to people who receive a digital card.
5. Every enriched or AI-added fact carries a source and needs the user's confirmation.

## 3. Product decisions already made (2026-09-21)

| Decision | Detail |
|---|---|
| **Needs attention, not "review everything"** | A card is flagged only when there is something to check: possible duplicate, a model warning, a failed read, or a fishy field (no name, no phone or email, malformed email, invalid phone, invalid GSTIN). Everything else is treated as accurate. Editing a basic field clears the flag; notes, tags, follow-up and priority never count. The manual "Mark card as reviewed" button goes away. |
| **Accuracy counting** | A card the user never changed counts as accurate; a corrected field counts as a miss. Caveat: this over-reports if cards are never opened, so count only cards that were opened, shared, saved or exported. |
| **Tags are not on Home** | Home is search, a short summary and recent scans. Tags stay searchable everywhere and filterable in Contacts. |
| **Accuracy page is user-simple** | One headline percentage and, in plain words, which fields get corrected most. Tables, token counts, latency, model names and cost move to the admin console (Phase 5). |
| **Priority is a star button** | A visible star on the contact page and its list row, one tap, never behind a menu. |
| **Remove "Re-read card" and "Add back side"** | Front+back is chosen at capture. A failed read is retried from its row. The menu keeps only share, save, move and delete. |
| **Admin console is separate** | A later, separate tool for operators: user management, usage, tokens, latency, cost, model settings, accuracy tables, error logs, packs. |

## 4. Phases

### Phase 0: Refinements from real use (about 1 week)

Built 2026-09-21, awaiting the real-phone check. Everything here was small and already decided.

- Needs-attention logic and its wiring on Home and Contacts (the Home row opens Contacts filtered to it); retire
  "Mark as reviewed".
- Simplify the Accuracy page; remove tag chips from Home.
- Star button for priority; trim the contact menu.
- vCard address split into street, city, state, pincode and country. Today the whole address lands in the street field,
  the same fault Covve is criticised for.
- Keep `npm test` green (90 tests). The scratch browser suite was not refreshed; it lives outside the repo.
- Gemini timeout and one retry (latency was 10 to 50 s per read on 2026-09-21).
- Gate: user checks on several real Android and iPhone handsets.
- Deviation: bulk export from the Accuracy page does not yet count a card as "exported" for accuracy; only opening does.

### Phase 1: Works in the hall (about 2 weeks)

The app keeps working, and never loses a card, in exhibition-hall conditions: no signal, a full day of scanning, a phone
that restarts, a slow read. Nothing is dropped and every failure can be recovered.

Built 2026-09-21, awaiting the real-phone check. Notes: feedback goes through the share sheet or clipboard until a support
address is set in `src/lib/feedback.ts` (`SUPPORT_EMAIL`); the camera detector now paces itself on slow phones; contrast fixes
(amber and green on the darker backgrounds) and input labels came out of the accessibility pass. Not done: a screen-reader
walk-through on a real device, and measuring detector speed on a genuinely low-end handset.

- **Offline capture queue:** photos are saved and read when signal returns; the queue survives an app kill; a clear
  "waiting for network" state. Today the app has no offline handling.
- **Backup and restore:** one-tap export and import of all contacts and card photos, plus a reminder to back up. Covve
  users report failed backups and vanished cards, and our data is on-device only, so this is the biggest exposure.
- Adjust photo: drag four corners and rotate left or right, with undo to the original.
- Error states: rate limit, slow network, retry, partial batch failures.
- In-app feedback with an attached diagnostic log.
- Accessibility pass (screen reader, focus order, reduced motion, sunlight contrast) and low-end Android performance.

### Phase 2: Digital cards (about 3 to 4 weeks)

**2a built 2026-09-21, awaiting the real-phone check** (spec and plan in `docs/superpowers/`). Test on real handsets: a second phone
scanning the QR (Android and iPhone cameras should offer Add contact), a long Hindi name, the Bold template's condensed capitals on
iPhone, sharing the picture through WhatsApp, stall mode keeping the screen awake, a HEIC or corrupt photo, backup then restore.

Decided 2026-09-21: My Card is a fifth tab (Home, Contacts, My Card, Events, Settings); the default accent is Graphite. Design
options were reviewed on a preview page. Templates to ship (confirmed): Ledger (default), Header, Split, Noir, Bold; Tint held back.

The HiHello-style card, aimed at events and exhibitors. It starts with its own brainstorm and written spec because it
is a new subsystem.

- 2a, no server needed: card editor (name, title, company, photo or logo, phones, email, links, address, socials), a few
  clean templates free, a QR that carries the contact (works offline), share as image, vCard or link.
- **2b built 2026-09-22, awaiting the real-phone check** (spec and plan in `docs/superpowers/`): Google sign-in; a card
  published to a short public link (`?card=<slug>`, no path routing, works on GitHub Pages); a standalone public page a
  visitor lands on with no account, showing the card, a save-contact button and a name/phone/email/company form; those
  submissions pulled into ordinary local contacts when the owner is next online, tagged with the event when it still
  exists locally. Secured by Postgres RLS plus two narrow `security definer` RPC functions (`get_public_card`,
  `submit_lead`) rather than any public table SELECT — no public listing of anyone's cards or leads. Live-verified
  against the real Supabase project by `scripts/verify-rls.mjs` (12/12, including cross-user isolation and that an
  authenticated-but-unrelated caller still works correctly). A fresh code review and an Impeccable design review both
  ran against the finished branch; their findings were fixed in the same pass (see the plan's ledger for the full list),
  including a real lead-loss ordering bug, a photo fetch that could strand a visitor on a slow connection, and the
  public page having no CardPulse branding or its card's own accent colour.
- Exhibition stall card: **built** — Stall mode has a "Just share" (offline vCard QR, unchanged) / "Collect leads"
  (publishes and encodes the link instead) toggle; leads land in the event's contact list automatically.
- Basic view counts free (HiHello locks analytics behind a paywall) — **built 2026-09-23** with Phase 3: My Card shows
  "Link opened N times · M leads" for a published card (one view per visitor session).
- Section 2 policies apply: no pop-ups to recipients, deletable cards, full vCard fields.
- Test on real handsets (2a and 2b together): a second phone scanning the QR (Android and iPhone cameras should offer
  Add contact), a long Hindi name, the Bold template's condensed capitals on iPhone, sharing the picture through
  WhatsApp, stall mode keeping the screen awake, a HEIC or corrupt photo, backup then restore, Google sign-in, publishing
  a card and scanning its "Collect leads" QR from a second phone with no account, submitting the lead form, and seeing
  it arrive as a contact back on the first phone.

### Phase 3: Accounts, sync and compliance (about 2 to 3 weeks)

Auth foundation (Google sign-in via Supabase) was built ahead of schedule as part of Phase 2b, since 2b needed it.

**Built 2026-09-23, awaiting the migration and the real-phone check** (spec in `docs/superpowers/specs/2026-09-23-sync-quotas-privacy-design.md`).
Every decision in it was made without a conversation, at the user's request, and is listed there to review.

- **Sync across devices, opt-in** (Settings → Account): contacts with their card photos, events and the user's own
  cards; last writer wins per record; deletions travel; unfinished reads stay on the phone that took them. Consent is
  recorded server-side. Checked by a two-phone simulation against the real engine (`npm run test:sync`, 9 scenarios).
- **Per-account scan quota:** signed-in reads are counted per account per day (300, an abuse brake, not a price) and
  the 30-per-10-minutes burst follows the account; signed-out use keeps the per-IP limit; any quota failure falls back
  to per-IP. The Worker holds no Supabase secret (it uses the caller's own token).
- **DPDP groundwork:** leads are deleted from the server once they reach the phone; deleting a digital card takes its
  link down; "Delete cloud data" and "Delete account" in Settings; the privacy page rewritten (it still claimed there
  were no servers or accounts). Still needs legal review before launch.
- Migration `supabase/migrations/0002_sync_quota_privacy.sql`: checked against a real Postgres with Supabase stand-ins
  (`npm run test:db`); `scripts/verify-sync.mjs` checks it on the live project once applied.
- Test on real handsets: turn sync on with two phones on one account, edit and delete on each, a photo on a slow
  connection, sync off/on, Delete cloud data, Delete account; deleting a published card and opening its old link; the
  view/lead counts on My Card; a visitor's lead arriving and leaving the server.

Still open here:

- Phone-number sign-in, once an SMS provider account exists (India needs a DLT-registered sender; Google-only for now).
- Paid Gemini tier (the free tier may use submitted images to improve Google's products). A billing step in Google's console.
- DPDP legal review of the consent text, the privacy page and retention. Blocks launch.
- Asking again for consent when the policy version changes (the version is recorded, nothing reads it yet).

### QR exchange (built 2026-09-24, awaiting the real-phone check)

- Scan > QR reads a card's QR code live or from a photo: vCard (printed cards and every CardPulse "Just share" QR),
  MeCard, tel: and mailto: become a contact in one tap, with no reading cost and never counted towards accuracy.
- Another CardPulse user's "Collect leads" QR opens their hosted card; saving it can send your own card back to them
  as a lead in the same tap (a two-way exchange). After any save, "Let them scan my card" opens your QR.
- Uses the phone's built-in QR detector where there is one (Android Chrome) and a small decoder (jsQR) elsewhere.
- Event names are shown in capitals everywhere in the app (display only; stored as typed).
- Test on real handsets: a printed card with a vCard QR, an iPhone and an Android scanning each other's My Card QR in
  both "Just share" and "Collect leads" modes, and a QR photo from the gallery.

### Trading Desk redesign (built and deployed 2026-09-24)

A new visual world replaced the Covve/HiHello look after a concept round (the user chose "Trading Desk" over the rolled
"Proof Sheet"): contacts as a watchlist with right-aligned figures, a ticker and index figures on Home, a depth drawer on
each row (Call, WhatsApp, Email, Star, Open), Scan as a fixed centre key on the tab bar, a trade bar on the contact page,
My Card as a holding with on-device share figures, Events as index rows, and the card editor and Settings on flat
hairline forms. Scan modes moved to a thumb rail (Card, 2-sided, Group, QR). DESIGN.md records the system. Each part is
its own commit on `main`; tag `pre-redesign` marks the app before it. Awaiting the real-phone check.

### Phase 4: Packs and payments (about 2 weeks)

- Define the packs (see section 5), price them from measured cost, and test them with a few real users first.
- Razorpay for India; usage meter in Settings; store billing once the app is in the stores.

### Phase 5: Admin console (about 2 to 3 weeks)

A separate app for operators, not users.

- User management: accounts, plans, pack balances, suspend and delete.
- Usage and cost: photos per user, tokens in and out, latency, cost per user, rate-limit hits.
- Model settings and feature flags; error and failed-read log.
- Detailed accuracy tables by field, language and card type (the material removed from the user-facing page).
- Pack and pricing management.

### Phase 6: Store apps (about 2 to 3 weeks)

**Decided 2026-09-24 (user):** Capacitor with the web files **bundled inside the app**, not a shell around the live site.
Design in `docs/superpowers/specs/2026-09-24-android-app-design.md`, awaiting the user's review; no code yet. First
milestone: a debug APK built on GitHub Actions and installed from a GitHub Release on the user's Android phone. Needs from
the user: the Supabase redirect URL for the app, and approval to redeploy the Worker with the app's origin.

- Capacitor wrapper around the current codebase; check share sheet, contacts save and camera one by one.
- A React Native rewrite only if Capacitor's camera or performance disappoints.
- Store listings, privacy labels, review.
- Native-only features follow here: caller-ID label overlay, dialer.

### Phase 7: Growth features (driven by early users)

- Team and exhibition mode: shared events, lead ownership, duplicate detection across reps.
- CRM and spreadsheet handoff: Zoho, HubSpot, Google Sheets, Excel templates (users report data never reaches their CRM).
- On-demand enrichment: GSTIN lookup for legal name and address, plus a grounded company summary; user-initiated, sourced,
  confirmed before saving.
- Follow-up reminders as push notifications; WhatsApp message templates.
- Batching of several photos per Gemini call, only if rate limits hurt.

## 5. Decisions

Settled 2026-09-21:

- **Packs:** scan packs of 100 and 500 cards (never expire) and an exhibition pass valid for 7 days.
- **Accuracy counting:** only cards that were opened, shared, saved or exported.

Proposed, to validate with about ten real users before launch (all prices are hypotheses, not data). Cost basis is
about ₹0.16 per photo, so 500 reads cost about ₹80 in Gemini fees, before payment fees and GST:

| Plan | Proposal | Why |
|---|---|---|
| Free | 20 reads a month; digital card, export and search always free | Beats HiHello's 5 a month and CamCard's lifetime 100 cap |
| Pack 100 | about ₹99, never expires | The one-off user who scans a stack once |
| Pack 500 | about ₹349, never expires | Regular but irregular use |
| Exhibition pass | about ₹199 for 7 days, fair-use 1,000 reads, shareable across up to 3 phones of one stall | The stall team and the one-time visitor; nobody else sells this |
| Pro monthly | about ₹99 a month: 300 reads, cloud sync, CRM export, enrichment | Regular users |
| Pro yearly | about ₹799 a year | Against Covve at about ₹10,000 a year |

Also to decide: store billing takes a cut of in-app sales (commonly 15 to 30 percent), which changes these margins; and GST
on digital services applies. Check both before fixing prices.

Still open:

1. **Wrapper:** decided 2026-09-24: Capacitor, bundled (see Phase 6).
2. **Sequencing:** the order above puts the work-in-the-hall phase and digital cards before accounts and payments. Swap
   Phases 2 and 3 if you want paying users sooner.

### Follow-up log (a light CRM) — built 2026-09-21, awaiting the real-phone check

Each contact gets a timeline of interactions (a call, a meeting, a message): what was said, and the next follow-up date. It is
separate from the single note that is exported to the phone. Keep it small: no pipelines, no deals. See the design discussion
of 2026-09-21. Built: log a call, meeting or message with an outcome, a note (dictation works) and a next date; timeline on the
contact page; "Add to calendar" for the follow-up; search finds logged notes; due dates now use the phone's own day. Not built:
push reminders, CSV columns for the log, bulk follow-up messages.

### Idea for the end of the plan: language reach

Decided 2026-09-21 to revisit once the main phases are done. Notes from the discussion: card reading already works across major
scripts through Gemini, but the reader currently outputs English, the interface is English only, and names, addresses and phones
assume an Indian, First-Last convention. Steps when the time comes: Indian regional languages first (interface and a
"keep original script" option); a test set of real cards per language and published accuracy; family-name-first handling; a
bilingual My Card. Wording until tested: "reads business cards in many languages", never "any language". Covve and CamCard already
claim broad language support, so this is table stakes; the bilingual card is the differentiator.

## 6. Parked (small, do when convenient)

- Contacts scanned before "extras" shipped have no dealer or factory notes; with "Re-read" removed, decide whether a
  one-time bulk refresh is worth building.
- Decide whether Insights keeps a second entry point under Settings now that Home links to it.
- Card photo in the vCard (`PHOTO;ENCODING=b`): undecided. The phone crops it to a small circle, so a landscape card is
  unreadable there; a share-sheet attachment of the card image next to the .vcf may serve better.
- Home tiles: Contacts, Companies, Starred (built 2026-09-21). Companies screen and company filter in Contacts built with them.
