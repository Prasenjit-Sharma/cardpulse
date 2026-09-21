# Roadmap

<!-- Reference plan, agreed 2026-09-20. Not a commitment to dates — update as phases complete
     or priorities change. See PRODUCT.md for what's already shipped and current constraints. -->

## Phase 1 — Harden what exists (~1 week)

- Test the camera, Auto Detect, share and vCard save on real Android and iPhone handsets
  side by side. iOS Safari has not been tested at all yet.
- Backup and restore: a one-tap export/import of all contacts and card photos. Cheapest
  safety net while storage is on-device only (clearing site data loses everything).
- Error and offline states: rate-limit errors, a slow network, a failed read that can be
  retried, a queue that survives an app kill.
- Accessibility pass: screen readers, focus order, reduced motion, palette in bright light.

## Phase 2 — Real users and cloud (~2–3 weeks)

- Accounts and sync via Supabase (chosen in principle, not built): login, contacts and card
  photos in the cloud, multi-device.
- Server-side limits: move the per-IP, in-memory rate limit to per-user quotas.
- Paid Gemini tier — required before real customers, since the free tier may use submitted
  images to improve Google's products.
- Privacy and DPDP: consent and retention policy for storing other people's contact data,
  deletion on request, updated privacy page. Blocks launch; needs legal review.

## Phase 3 — Monetization (~1–2 weeks)

- Pricing: measured cost is ≈ ₹0.16/photo; supports a free tier of ~20–30 cards/month plus a
  paid plan. Confirm numbers with real users first.
- Payments: Razorpay for India, plus store billing once in the app stores.
- Usage meter in Settings.

## Phase 4 — Store apps (~2–3 weeks)

- Capacitor wrapper around the current codebase (faster route; verify share sheet, contacts
  save and camera one by one).
- Alternative: React Native rewrite — only if Capacitor's camera or performance disappoints.
- Store listings: icons, screenshots, privacy labels, Play/App Store review.

## Phase 5 — Features that win users

- Exhibition team mode: shared events, per-person lead ownership.
- CRM/export integrations: Google Contacts, Zoho, HubSpot, Excel templates.
- Follow-up reminders as push notifications; WhatsApp message template.
- Batching for large events — revisit only if rate limits actually hurt (see PRODUCT.md
  positioning note: one Gemini call per photo today, batching left off by choice).
- Caller-ID label overlay on Android.
- Dialer — needs native code, so belongs after the wrapper (Phase 4).
- On-demand contact/company enrichment ("find more about this person") — GSTIN lookup for
  legal company details, plus a Gemini call with Google Search grounding for a company
  summary. User-initiated per contact, not run automatically on every scan, and every
  enriched field shown with a source link pending user confirmation. See privacy note above.

## Open decisions

1. Pricing model: subscription, pay-per-card, or free with a cap?
2. Wrapper vs rewrite: Capacitor first, or React Native?
3. Sequencing: real users first (Phase 2) or store-ready first (Phase 4)? Current lean:
   2 → 3 → 4, with Phase 5 driven by what early users ask for.
