# CardPulse: consolidated plan

Last revised 2026-09-21. Supersedes the earlier five-phase plan and the separate review notes.
`PRODUCT.md` records what is already shipped and today's constraints; this file records what comes next and why.

## 1. Who and what

An Indian professional or exhibitor turns printed cards into reachable contacts without typing, and shares their own
digital card just as easily. Events and exhibitions are the wedge; the business is small prepaid packs that undercut
subscription apps (Covve about $120/year, HiHello Premium about $10/month, CamCard's capped free tier).

Working rules for every phase:

- **Design:** every UI change goes through Impeccable (shape, build, finish review) and stays inside the Card Album
  system and the Graphite + Teal palette. Nothing ships without the user checking it on real phones.
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

- **Offline capture queue:** photos are saved and read when signal returns; the queue survives an app kill; a clear
  "waiting for network" state. Today the app has no offline handling.
- **Backup and restore:** one-tap export and import of all contacts and card photos, plus a reminder to back up. Covve
  users report failed backups and vanished cards, and our data is on-device only, so this is the biggest exposure.
- Manual re-crop of a saved card photo.
- Error states: rate limit, slow network, retry, partial batch failures.
- In-app feedback with an attached diagnostic log.
- Accessibility pass (screen reader, focus order, reduced motion, sunlight contrast) and low-end Android performance.

### Phase 2: Digital cards (about 3 to 4 weeks)

The HiHello-style card, aimed at events and exhibitors. It starts with its own brainstorm and written spec because it
is a new subsystem.

- 2a, no server needed: card editor (name, title, company, photo or logo, phones, email, links, address, socials), a few
  clean templates free, a QR that carries the contact (works offline), share as image, vCard or link.
- 2b, needs a small backend: hosted card page and short link; visitors can save the contact and leave their own details,
  which arrive as a scanned-style contact.
- Exhibition stall card: one QR for the stall; every visitor who scans it lands in the event's contact list.
- Basic view counts free (HiHello locks analytics behind a paywall).
- Section 2 policies apply: no pop-ups to recipients, deletable cards, full vCard fields.

### Phase 3: Accounts, sync and compliance (about 2 to 3 weeks)

- Supabase login; contacts and card photos in the cloud; multi-device sync.
- Per-user quotas replace the in-memory per-IP limit.
- Paid Gemini tier (the free tier may use submitted images to improve Google's products).
- DPDP: consent, retention, deletion on request, updated privacy page. Blocks launch; needs legal review.
- Prerequisite for hosted digital cards at scale and for packs tied to an account.

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

1. **Wrapper:** Capacitor first (recommended, see chat notes) or React Native.
2. **Sequencing:** the order above puts the work-in-the-hall phase and digital cards before accounts and payments. Swap
   Phases 2 and 3 if you want paying users sooner.

## 6. Parked (small, do when convenient)

- Contacts scanned before "extras" shipped have no dealer or factory notes; with "Re-read" removed, decide whether a
  one-time bulk refresh is worth building.
- Decide whether Insights keeps a second entry point under Settings now that Home links to it.
