# Pulse: launch checklist

The working list from here to the Play Store, agreed 2026-10-09. Tick items as they are done and refine as we go.
Cost is the key constraint: a solo developer, free tiers first, paid plans only when revenue covers them.
Prices, limits and sources checked on 2026-10-09 are under "Research notes" at the end. Re-check before relying on them.

## Open decisions

- [ ] **Backend:** all-Cloudflare (Worker + D1 + R2 + own sign-in) or Supabase free + R2. See "Backend choice" below.
- [ ] **Final Android app ID.** Today `in.cardpulse.app`; it can never change once published.
- [ ] **Payments:** RevenueCat (free under $2,500 monthly revenue, then 1%) or Play Billing built directly (free, about a week more).
- [ ] **Dev database:** local (Supabase CLI or `wrangler dev` with local D1) or a cloud project.

## A. Low-network fixes (first, on the current setup)

Seen in the field: reads and Pulse Briefs fail on weak signal, which never happened on a personal free Gemini key (no sign-in then).

- [ ] **A1. Token renewal never means "signed out".** If the hourly sign-in token cannot be renewed on a weak signal, use the last
      good one and renew in the background; a read answered `sign_in` while the app holds a session is retried, not parked as
      "Waiting for sign-in" (today it can stay parked until the app restarts).
- [ ] **A2. Time limit on getting the token** (it can hang today), falling back to the last good token.
- [ ] **A3. Pulse Brief retries** network failures twice with short waits (today: one attempt in an 8 to 20 s wait).
- [ ] **A4. No double charge on a lost answer.** Each read and brief carries a request id; the Worker keeps the answer briefly
      (KV) and a retry with the same id gets it again without a second charge.
- [ ] A5. Tests for each, the APK on the phone, and a check of the Worker logs for `sign_in` refusals from signed-in accounts.

## B. Code before the new accounts

- [ ] **B1. Reading test (read-lab),** like `scripts/brief-lab.mjs`: real card photos through Gemini 2.5 Flash-Lite and
      3.5 Flash-Lite, scored field by field (names, phones, Hindi and regional scripts). Same for Briefs on 2.5 Flash.
- [ ] B2. Switch models if accuracy holds: reading on `gemini-2.5-flash-lite` (about ₹0.025 a card, against ₹0.11 today),
      Briefs on `gemini-2.5-flash` (1,500 free searches a day). Add a fallback model on overload (same key).
- [ ] B3. Photos and brochures on Cloudflare R2 (10 GB free, no download fees) instead of Supabase storage (1 GB free).
- [ ] B4. Backend per the decision above: one clean starting migration (or the D1 schema), daily brakes merged into one
      table, dead functions dropped.
- [ ] B5. Remove unused code: own-Gemini-key mode (Settings, `listModels`, direct Gemini call), `promptAsk`, the `submit_lead`
      fallback, the signed-out per-IP path in the Worker, the stale `server/README.md`.
- [ ] B6. Dev, staging and production settings for the web build, the Worker (Wrangler environments) and the Android app
      (`.dev` and `.staging` app id suffixes, so all three install side by side).
- [ ] B7. Free safety nets: a nightly database backup (GitHub Actions, or D1 Time Travel) and, on Supabase free, a daily ping
      so a quiet week does not pause the project.

## C. Accounts (the user, with guidance)

- [ ] C1. GitHub: new account, one repo, environments development / staging / production, approval before production.
- [ ] C2. Cloudflare: one account (Workers, KV, R2, Pages, Access; D1 if chosen).
- [ ] C3. Supabase (if kept): staging and production projects in **Mumbai (ap-south-1)**.
- [ ] C4. Google Cloud: a project per environment, each with its own Gemini key (production on billing: the paid tier is
      what stops Google using the photos) and OAuth client.
- [ ] C5. Domain from the cheapest registrar (compare the 3-year total, not the first year), nameservers pointed to Cloudflare.

## D. App release

- [ ] D1. Final app id applied.
- [ ] D2. Native Google sign-in (Credential Manager).
- [ ] D3. Release signing key, Play App Signing, version numbers, release bundle (AAB).
- [ ] D4. Play Billing (RevenueCat or direct), with a webhook to the Worker that grants plans, passes and packs.

## E. Website (Cloudflare Pages, free)

- [ ] E1. Marketing landing page.
- [ ] E2. Privacy policy, terms, and the account-deletion page Play requires.
- [ ] E3. Public card and lead form on the domain; App Links so card links open in the app.
- [ ] E4. Minimal admin behind Cloudflare Access (free up to 50 users): look up a user, grant a plan or pass, usage and cost.

## F. Play Store

- [ ] F1. Internal test track.
- [ ] F2. Closed test with 15 to 20 testers (at least 12 opted in for 14 days in a row), feedback recorded.
- [ ] F3. Data safety form, store listing (`store/`), apply for production.

## G. After launch

- [ ] G1. Paid plans only when revenue covers them (Supabase Pro $25 a month, or Workers Paid $5 a month).
- [ ] G2. iPhone app (needs Sign in with Apple or an equal privacy option next to Google, per App Store guideline 4.8).

## Backend choice (to decide)

| | Supabase free + R2 | All-Cloudflare (D1 + R2 + own sign-in) |
|---|---|---|
| Cost now | ₹0 | ₹0 |
| Cost when outgrown | $25 a month (Pro) | $5 a month (Workers Paid) |
| Free backups | None (own nightly job) | Time Travel, any minute in 7 days |
| Pauses when idle | After 7 days | Never |
| Sign-in | Built in (Google, Apple) | Own: verify Google/Apple tokens in the Worker, own session token |
| Security rules | Row-level security, declarative, already tested | Checks in each Worker endpoint, tests to rewrite |
| Work | Little | About 2 to 3 weeks, cheapest now while no live data exists |
| Database | Postgres (industry standard, portable to any Postgres host) | SQLite (D1, generally available since 2024) |

## Research notes (checked 2026-10-09)

**Gemini, per 1M tokens (paid tier):** 3.5 Flash-Lite $0.30 in / $2.50 out (reading today); 3.1 Flash-Lite $0.25 / $1.50
(shuts down May 2027); **2.5 Flash-Lite $0.10 / $0.40** (not deprecated); 3.5 Flash $1.50 / $9.00 (Briefs today);
2.5 Flash $0.30 / $2.50. Search grounding: Gemini 3+ 5,000 free a month then $14 per 1,000; 2.5 models 1,500 free a day
then $35 per 1,000. A measured card (1,578 in, 344 out) costs about ₹0.11 on 3.5 Flash-Lite and ₹0.025 on 2.5 Flash-Lite
(₹84 to the dollar). Unlimited's fair use (about 6,000 cards a month) costs about ₹660 on today's model against about ₹679
kept after Play's fee: nearly a loss. Billing on gives Tier 1 limits; $100 spent gives Tier 2.

**Alternatives to Gemini:** no cheap image model on OpenAI's standard price list; Mistral OCR about $4 per 1,000 pages
(about ₹0.34 a card, text only); Qwen (Alibaba) cheap on third-party trackers, unverified, China-hosted. Decision: stay on
Gemini, with a second Gemini model as fallback.

**Supabase free:** 2 active projects, 500 MB database, 1 GB files, 5 GB egress, 50,000 monthly users, pauses after 1 week
idle, no backups. Pro from $25 a month (8 GB, 100 GB files, daily backups 7 days, no pausing). Mumbai (ap-south-1) is a
region. Measured from India 2026-10-09: answers through Cloudflare's Mumbai edge in 90 to 750 ms (slow ones are cold).

**Cloudflare free:** Workers 100,000 requests a day, 10 ms CPU each (paid $5 a month: 10M requests, 30M CPU ms); KV 100,000
reads and 1,000 writes a day, 1 GB; D1 5 GB per account, 500 MB per database, 5M rows read and 100,000 written a day,
50 queries per request (1,000 on paid), Time Travel 7 days (30 on paid), `batch()` runs as one transaction; D1 location
hints are regions only (`apac`), no India-specific one; R2 10 GB, 1M writes, 10M reads a month, no egress fees. Zero
Trust Access free up to 50 users (third-party sources).

**Payments and store:** Play takes 15% on subscriptions in India. RevenueCat free under $2,500 monthly tracked revenue,
then 1%. New personal Play accounts need a closed test with at least 12 testers opted in for 14 days in a row.

Sources: supabase.com/pricing, supabase.com/docs/guides/platform/regions, ai.google.dev/gemini-api/docs/pricing,
ai.google.dev/gemini-api/docs/deprecations, ai.google.dev/gemini-api/docs/rate-limits,
developers.cloudflare.com/workers/platform/pricing, developers.cloudflare.com/d1/platform/limits,
developers.cloudflare.com/d1/reference/time-travel, developers.cloudflare.com/d1/configuration/data-location,
developers.openai.com/api/docs/pricing, revenuecat.com/pricing, support.google.com/googleplay/android-developer/answer/112622,
support.google.com/googleplay/android-developer/answer/14151465.
