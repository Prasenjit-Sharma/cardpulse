# Pulse: launch checklist

The working list from here to the Play Store, agreed 2026-10-09. Tick items as they are done and refine as we go.
Cost is the key constraint: a solo developer, free tiers first, paid plans only when revenue covers them.
Prices, limits and sources checked on 2026-10-09 are under "Research notes" at the end. Re-check before relying on them.

## Open decisions

- [x] **Backend: Supabase free + Cloudflare R2** (decided 2026-10-10). Supabase keeps sign-in, row-level security and its
      dashboard; photos and brochures move to R2; a daily ping keeps the project awake and a nightly job backs it up; Pro
      ($25 a month) only when revenue covers it. All-Cloudflare was weighed and set aside: about the same speed for users,
      cheaper at scale, but sign-in and every access check would be ours to build and secure. See "Backend choice" below.
- [x] **Final Android app ID: `in.pulsecardscanner.app`** (decided 2026-10-10; `.dev` and `.staging` suffixes for the
      other builds). Applied in B6, together with the sign-in return link (`in.pulsecardscanner.app://auth/callback` in the
      manifest and `src/lib/platform.ts`) and Supabase's allowed redirect URLs, so sign-in breaks only once.
- [x] **Payments: RevenueCat** (decided 2026-10-10) over Google Play Billing (Apple in-app purchase later). Free under
      $2,500 monthly tracked revenue, then 1%. It checks purchases, handles renewals, failed UPI AutoPay mandates, grace
      periods, refunds and upgrades, and calls a Worker webhook that runs the existing grant functions. Customers pay with
      whatever Play offers (UPI and UPI AutoPay, cards, net banking). Razorpay inside the app was ruled out on 2026-10-05:
      Play requires its own billing for digital goods, and India's alternative billing still costs 11%. Later idea: sell
      on the website through Razorpay (for example passes bought by a company for its stall staff); the app may honour
      those purchases but must not point users to them.
- [x] **Dev database: two free cloud projects** (decided 2026-10-10): `pulse-test`, shared by the dev and staging builds, and
      `pulse-prod` for the store app only (closed-test testers use production builds, so their accounts carry over). Local
      Supabase on the Mac was set aside: the phone could reach it only on home Wi-Fi, so no field or weak-signal testing.
      Database changes keep being tested with `npm run test:db` (PGlite, no Docker).

- [x] **Unlimited's fair use: 200 a day and 3,000 a month** (decided 2026-10-10). Reading costs about ₹0.114 a card (B1), so
      the old 200 a day (about 6,000 a month, ₹684) lost money against ₹679 kept from ₹799. Now a heavy user costs about ₹342.
      Competitors for comparison: CamCard Premium reportedly caps AI scans at 200 a month; Covve about ₹960 and Blinq about
      ₹700 to 960 a month for "unlimited"; HiHello 20 a month below its team plan. Built: `shared/plans.ts`, migration
      `0011_unlimited_fair_use.sql` (run 2026-10-10), Home and Plan & cards show "Unlimited" until 300 are left, then the count in
      amber; past 3,000, pack cards, then photos wait for the month ("This month's fair use is used").

## A. Low-network fixes (first, on the current setup)

Seen in the field: reads and Pulse Briefs fail on weak signal, which never happened on a personal free Gemini key (no sign-in then).

- [x] **A1. Token renewal never means "signed out".** If the hourly sign-in token cannot be renewed on a weak signal, use the last
      good one and renew in the background; a read answered `sign_in` while the app holds a session is retried, not parked as
      "Waiting for sign-in" (today it can stay parked until the app restarts).
- [x] **A2. Time limit on getting the token** (it can hang today), falling back to the last good token.
- [x] **A3. Pulse Brief retries** network failures twice with short waits (today: one attempt in an 8 to 20 s wait).
- [x] **A4. No double charge on a lost answer.** Each read and brief carries a request id; the Worker keeps the answer briefly
      (built as migration 0010: the database charges an id once; a read's id comes from its card ids, a brief's is new per tap).
- [ ] A5. Tests written, migration 0010 run and the Worker deployed (2026-10-10). Still to do: try the APK on a
      weak signal, and check the Worker logs for `sign_in` refusals from signed-in accounts.

## B. Code before the new accounts

- [x] **B1. Reading test** (built and run 2026-10-10 on 11 synced cards, 7 opened): `npm run read:fetch` pulls synced cards
      and their corrections into the git-ignored `.lab/`; `npm run read:lab [-- --models … --media medium]` compares models
      with the app's prompt and the Accuracy page's scorer. Results:
      - **2.5 Flash-Lite and 2.5 Flash are closed to new users** ("no longer available to new users"): not an option.
      - 3.5 Flash-Lite (today): 83.5 to 91.4% across three identical runs, about 7 s, ₹0.114 a card.
      - 3.1 Flash-Lite: 79.3%, ₹0.082, shuts down May 2027. Gemma 4 26B (free tier only, so Google may use the photos):
        76%, 14 s; Gemma 4 31B broke the JSON format on 9 of 11. None beat today's model.
      - Medium photo detail on 3.5 Flash-Lite: ₹0.095 a card (17% less), 83.5 to 88.0%; inside the run-to-run noise.
      - Pulse Brief: 3.8 Flash (Google's suggested successor) is cheaper but ran no web search on 4 of 4 contacts (briefs
        from memory, shown as unchecked); 3.5 Flash searched where it mattered. Keep 3.5 Flash.
      - Card photos weakest on regional scripts (68% for every model) and on addresses.
- [ ] **B2. Decision:** stay on 3.5 Flash-Lite for reading and 3.5 Flash for Briefs. Re-test medium photo detail once 50+
      opened cards are synced (11 cards cannot show a difference under about 8 points). Re-check the Unlimited plan's
      fair use (done: 3,000 a month). Fallback model built 2026-10-10: on 429, 500, 503 or 504 the Worker
      tries `GEMINI_FALLBACK_MODEL` (3.1 Flash-Lite, in `wrangler.toml`) once within the phone's wait; replace it before it
      shuts down on 7 May 2027.
- [x] B2a. Google's notice (2026-10-10): `temperature`, `top_p` and `top_k` will be refused by upcoming models, and
      `thinking_budget` must become `thinking_level`. Done: `temperature` removed from card reading
      (`shared/extract-core.ts`), Pulse Brief (`shared/brief-core.ts`) and the brief lab; `thinking_budget` was never used
      (Briefs already set `thinkingLevel`). Reading test after the change: 82.4% and 89.0% (opened cards 86.0%, 89.8%),
      inside the earlier range. The Worker needs a deploy to send the new requests.
- [x] B2c. Google retired `gemini-3.5-flash` (2026-10-10) and now serves 3.6 Flash for it. Pulse Brief switched to
      `gemini-3.6-flash` by name. Brief lab with the Worker's nudge (`--nudge`), two runs: searched 3 of 4 contacts both
      times, as 3.5 did; about ₹0.16 to 0.18 a brief before search fees, half of 3.5's ₹0.32, until its price doubles on
      1 January 2027. Nudged briefs take 7 to 12 s instead of 4 to 5. "Minimal" thinking still works on 3.6.
- [ ] B2b. Later: Google now calls `generateContent` "legacy" (still fully supported) and recommends the Interactions API.
      Move the Worker's two calls when convenient, before a model we need drops `generateContent`.
- [ ] B3. Photos and brochures on Cloudflare R2 (10 GB free, no download fees) instead of Supabase storage (1 GB free).
- [x] B4. `supabase/baseline.sql` (2026-10-10): the whole database for a new project in one run, migrations 0001 to 0011
      folded together. Changes: one `daily_brakes` table replaces `scan_usage` and `brief_usage` (10 tables); not carried
      over: `consume_scan`, `consume_brief`, `submit_lead`. `npm run test:db` builds the database both ways and compares
      every table, column, function body, policy, grant, trigger, index, constraint and bucket (scripts/check-baseline.mjs),
      then checks the baseline's behaviour. From now on a change is a new numbered migration AND folded into the baseline.
- [ ] B4a. Hardening (after launch is fine): give each table explicit grants in `baseline.sql` (only what the app and the
      security-invoker functions need, e.g. read-only `usage`, `credits`, `daily_brakes`), test them in check-baseline, then
      switch off "Automatically expose new tables" in both projects. The projects were created with it on (2026-10-10)
      because the baseline relies on Supabase's default grants, with row-level security on every table; "Enable
      automatic RLS" was switched on as a safety net for tables added later.
- [x] B5. Unused code removed (2026-10-10): the own-Gemini-key mode (Settings' Developer section, `listModels`, the direct
      Gemini call, the key and model settings, Home's "Add your Gemini key" row; old saved settings are cleaned on load),
      the `submit_lead` fallback in the app, and the stale `server/README.md` and README text. Kept on purpose: `promptAsk`
      (the app's own prompt dialog, part of the design system) and the Worker's per-IP brake (it still guards uncharged
      reads while Supabase is unreachable).
- [ ] B6. Dev, staging and production settings for the web build, the Worker (Wrangler environments) and the Android app
      (`.dev` and `.staging` app id suffixes, so all three install side by side).
- [ ] B7. Free safety nets: a nightly database backup (GitHub Actions) and a daily ping so a quiet week does not pause the
      Supabase project.

## C. Accounts (the user, with guidance)

- [ ] **C0. Emails** (decided 2026-10-10, revised the same day). Two Gmails, each kept to Pulse:
      - **Production Gmail `byangomaaa@gmail.com`**: Google Play Console and GitHub (account `byangomaaa`: this project's
        code and deploy secrets). Set for this project only (`git config --local`); other projects on the Mac keep theirs.
      - **Service Gmail `pulsecardscanner@gmail.com`** (exclusively for Pulse's services): Cloudflare, Supabase, Google
        Cloud (Gemini keys, sign-in clients, the billing service account) and RevenueCat.
      One account per service: never a second Supabase or Cloudflare account to stack free plans (most terms treat it as
      abuse, and a suspension could take the production database with it). Deploys reach Cloudflare and Supabase through
      access tokens stored in GitHub, so the account split does not matter technically. Two-step verification on both
      Gmails, each the other's recovery email; the service Gmail added as admin in Play Console (Users and permissions)
      and the production Gmail given Owner on the Google Cloud projects. Never sign up with a domain address (a lapsed
      domain would lock you out); `support@` and `privacy@` on the domain forward to the service Gmail through
      Cloudflare Email Routing (free, receive only), with Brevo's free plan only when sending from `support@` is needed.
- [ ] C1. **Final repo on `byangomaaa`, with a clean start** (revised 2026-10-10). Development continues in the old repo
      (`origin`, Prasenjit-Sharma/cardpulse) until B6 is done and dev-only material is out. Then the final repo gets the
      cleaned source as ONE first commit, under byangomaaa's GitHub no-reply email: none of the 244 development commits (all
      authored with a personal email), no `.impeccable/`, no `docs/superpowers/`, no old project addresses. The first
      attempt (`byangomaaa/pulse`, pushed with full history by mistake) was deleted on 2026-10-10. This Mac's push access to
      byangomaaa is scoped to `https://byangomaaa@github.com` and never touches the other projects. Then: new account, one repo, environments development / staging / production, approval before production.
- [ ] C2. (account created 2026-10-10) Cloudflare: one account (Workers, KV, R2, Pages, Access).
- [x] C3. (2026-10-10, Mumbai; `baseline.sql` run in both and checked from outside: tables, functions, grants, buckets)
      `pulse-test` = `efhhwamvfgcjgbpwfnuy`, `pulse-prod` = `suhlynnoeatjnrokaaox`. Supabase: `pulse-test` and `pulse-prod` projects in **Mumbai (ap-south-1)**; run `supabase/baseline.sql` once in
      each (not the numbered migrations).
- [ ] C4. Google Cloud: a project per environment, each with its own Gemini key (production on billing: the paid tier is
      what stops Google using the photos) and OAuth client.
- [ ] **C5. Domain. When: before B6** (soon after Google sign-in is set up), because B6 writes the domain into every
      environment: the address in card QR codes and links (`VITE_PUBLIC_URL`), the Worker's allowed origins, the privacy
      policy and account-deletion links in the Play listing and on Google's sign-in screen, and the App Links file that
      opens card links in the app. Buying it later means changing all of those, and card links already shared would break.
      Which (decided 2026-10-10): `pulsecardscanner.com` on Cloudflare Registrar, in the pulsecardscanner account. `.com`
      because the address is printed in card QR codes that live for years and people type `.com` by default; the extension
      has no effect on ranking or speed, and `.in` would tie the site to India in Google. Cloudflare because it sells at
      cost (about $10.46 a year, so about $31 over 3 years, against GoDaddy's Re 1 then Rs 1599 a year plus GST), DNS is
      already there (no nameserver change), and WHOIS privacy and DNSSEC are free. Prepay 3 to 5 years and keep auto-renew
      on: a lapsed domain breaks every shared card. It is billed in USD, so the card needs international payments on.
      Optional: `pulsecardscanner.app` (about $14.20 a year after the first) only as a redirect to `.com`, to stop squatting.
      Then on Cloudflare: Email Routing for `support@` and `privacy@` to the service Gmail. No GitHub Pages: the site is
      Cloudflare Pages, built from the private repo.
- [ ] **C6. Retire the development accounts** once the app runs on the new ones: the first Supabase project
      (`xqwslvteyhfmnxcnlpsg`, real test cards and leads in it: delete the project, not just pause it), the first Cloudflare
      Worker `cardpulse-api` and its KV namespace, and the Gemini keys used so far (revoke them in Google AI Studio). Update
      the Mac Keychain items the lab scripts use (`cardpulse-supabase-secret`, `cardpulse-gemini-brief`) to the new keys,
      and the project id in `scripts/grant.mjs`, `read-fetch.mjs` and `verify-*.mjs`.

## D. App release

- [ ] D1. Final app id `in.pulsecardscanner.app` checked in the release build (Java package, namespace, return link).
- [ ] D2. Native Google sign-in (Credential Manager).
- [ ] D3. Release signing key, Play App Signing, version numbers, release bundle (AAB).
- [ ] D4. RevenueCat over Play Billing: products from `shared/plans.ts` in Play Console, the RevenueCat Capacitor plugin,
      and a webhook to the Worker that grants plans, passes and packs (needs a Supabase server key for the Worker).

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

- [ ] G1. Paid plans only when revenue covers them (Supabase Pro $25 a month; Workers Paid $5 a month if traffic needs it).
- [ ] G2. iPhone app (needs Sign in with Apple or an equal privacy option next to Google, per App Store guideline 4.8).

## Backend choice (decided 2026-10-10: Supabase free + R2)

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

**Gemini (update 2026-10-10: 2.5 Flash-Lite and 2.5 Flash refuse new users, so the 2.5 prices below are not reachable):**
**per 1M tokens (paid tier):** 3.5 Flash-Lite $0.30 in / $2.50 out (reading today); 3.1 Flash-Lite $0.25 / $1.50
(shuts down May 2027); **2.5 Flash-Lite $0.10 / $0.40** (not deprecated); 3.5 Flash $1.50 / $9.00 (Briefs today);
2.5 Flash $0.30 / $2.50. Search grounding: Gemini 3+ 5,000 free a month then $14 per 1,000; 2.5 models 1,500 free a day
then $35 per 1,000. A measured card (1,578 in, 344 out) costs about ₹0.13 on 3.5 Flash-Lite and ₹0.03 on 2.5 Flash-Lite
(₹96 to the dollar, as the lab scripts use). Unlimited's fair use (about 6,000 cards a month) costs about ₹770 on today's
model against about ₹679 kept after Play's fee: a loss; about ₹170 on 2.5 Flash-Lite. Billing on gives Tier 1 limits; $100 spent gives Tier 2.

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
