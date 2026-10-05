# Pricing: plans, packs and balances (Phase 4, part 1)

Date: 2026-10-05. Branch `pricing`. Status: awaiting the user's review.

## Goal

Every card read and every Pulse Brief is counted against what the account has: a monthly allowance from its plan, a
7-day Exhibition pass, or never-expiring packs. The app shows what is left, explains plainly when something runs out,
and never loses a card because of it. Payment itself is not in this part: plans and packs are granted by a script
until Google Play Billing is added (part 2).

## Decisions (from the user, 2026-10-05)

| Question | Answer |
|---|---|
| Payments in this build | None. Balances, limits, screens and a test grant script now; Play Billing next, once the app is in Play Console's internal testing track |
| Signed-out card reading | Not allowed. Reading needs Google sign-in. QR scanning, the digital card, contacts and export stay open to everyone |
| Pulse Brief on Free | 3 trial briefs per account, once |
| Exhibition pass | Cards only, no briefs |
| Card packs | 50, 100 and 200 |
| What uses one card | Each contact read. A Group photo with 6 cards uses 6, a front-and-back card uses 1, a card listing 3 people uses 3. Failed or empty reads use nothing |
| Enforcement | Check before the read, charge after it, with the user's own token. The Worker still holds no Supabase secret |

## Plans and prices

One file, `shared/plans.ts`, holds every price and allowance; the app's screens read it, and a test checks that the
SQL constants in migration 0005 match it.

| Item | Price | Gives |
|---|---|---|
| Free | ₹0 | 20 cards a month (calendar month, India time); 3 trial briefs once |
| Plus | ₹99 a month, ₹999 a year | 150 cards a month |
| Pro | ₹399 a month, ₹3,499 a year | 400 cards and 20 Pulse Briefs a month |
| Pack 50 / 100 / 200 | ₹59 / ₹99 / ₹179 | That many cards, never expire |
| Extra briefs | ₹149 | 10 briefs, never expire; on sale to Pro only |
| Exhibition pass | ₹499 | Up to 1,000 cards over 7 days from activation |

Prices are hypotheses to test with about ten users (ROADMAP section 5); changing one is an edit to `shared/plans.ts`
and nothing else in the app. The per-account daily brakes stay: 300 reads and 10 briefs a day.

**Order of use.** Cards: an active pass first (it expires soonest), then this month's allowance, then pack cards.
Briefs: this month's Pro allowance, then extra briefs, then trial briefs. A paid plan's month runs from its period start;
when the period ends without renewal the account is on Free again. Unused monthly allowance does not roll over; packs,
extra briefs and trial briefs never expire.

**Partial charges.** A read is allowed when at least 1 card is left. If it returns more contacts than are left, the
balance stops at 0 and the extra contacts are kept: the user never loses a read they have already seen.

## Server records (Supabase migration `0005_plans_balances.sql`)

- `plans`: one row per account: `tier` (`plus` or `pro`), `period_start`, `period_end`. No row means Free.
- `passes`: `starts_at`, `ends_at`, `allowance` (1,000). Several may exist; only an active one is used.
- `credits`: never-expiring balances per account: `pack_cards`, `extra_briefs`, `trial_briefs` (3 on first use).
- `usage`: one row per charge: `at`, `kind` (`card` or `brief`), `source` (`pass`, `month`, `pack`, `extra`, `trial`),
  `qty`, and the pass id where it applies. Monthly and pass use is summed from here.

Row-level security: an account may read its own rows and nothing else; no one may write them directly.

Functions (all `security definer`, called with the user's own token unless noted):

| Function | Does |
|---|---|
| `begin_read()` | Applies the 300-a-day brake (replaces `consume_scan` for signed-in reads) and says whether at least 1 card is left. Returns `allowed`, a `reason` (`daily_limit` or `no_cards`) and the balance |
| `charge_reads(n)` | After a successful read: uses `n` cards in the order above, never below 0. Returns the balance |
| `begin_brief()` | The 10-a-day brake (replaces `consume_brief`) and whether a brief is left. `reason` is `daily_limit`, `no_briefs` (has Pro, used them all) or `pro_only` (trial used up, not on Pro) |
| `charge_brief()` | Uses one brief in the order above. Returns the balance |
| `my_balance()` | The balance alone, for the app's screens |
| `grant_plan(user, tier, months)`, `grant_pack(user, kind, qty)`, `grant_pass(user)` | Service role only. Used by the test script now and by purchase verification in part 2 |

The balance, everywhere it is returned:
`{ tier, periodEnd, cards: { month: {used, allowance}, pass: {used, allowance, endsAt} | null, pack, left },
briefs: { month: {used, allowance}, extra, trial, left } }`.

Known gap, accepted: with 1 card left, several reads sent at the same moment all pass `begin_read`. The 30-per-10-
minutes burst limit bounds it. Closing it needs a server secret (reserve, then refund), which is not worth it yet.

## Worker (`server/worker.ts`)

- `/v1/extract` without a sign-in token: `401 sign_in`, "Sign in to read cards. You get 20 free each month."
- Signed in: `begin_read`, then Gemini, then `charge_reads(contacts.length)` when at least one contact came back.
  The answer carries `balance`.
- No cards left: `402 no_cards` with the balance. Daily brake: `429 daily_limit`, as today.
- `/v1/brief`: `begin_brief`; `402 no_briefs` or `402 pro_only` with the balance; `charge_brief` after a good brief.
- Supabase unreachable, slow (over 3 s) or 0005 not yet applied: the read or brief goes ahead uncharged and the Worker
  logs it, as the quota does today. Losing a card at a stall is worse than one free read.
- The own-key developer option (`useOwnKey`) is unchanged: it never touches our server.

## App

New: `src/lib/balance.ts` (fetches `my_balance`, keeps the last balance seen in memory and localStorage, updates it
from every read and brief answer, and turns it into display figures), `src/components/PlanPage.tsx` and its CSS. Every
screen goes through Impeccable (shape, build, finish review) inside the Trading Desk system in DESIGN.md.

- **Settings, Plan & cards** (a new row at the top of Settings): the current plan and when it renews or ends; what is
  left (cards this month, pass, pack cards, briefs); then the plans, the packs, extra briefs (Pro only) and the pass,
  each with its price and what it gives. "Buy" opens a sheet: "Payments open with the Play Store release." Signed out,
  the page shows the plans and a sign-in button.
- **Home**: a "cards left" figure in the ticker, opening Plan & cards. At 5 or fewer it reads "5 cards left" in the
  amber tone; never a pop-up.
- **Scan, signed out**: before the camera opens in a reading mode (Card, 2-sided, Group), a sheet: "Sign in to read
  cards. 20 free each month." QR mode opens as before.
- **Out of cards**: the photo is kept as a pending card with a new `waiting: 'cards'` reason, shown as "Waiting for
  cards" with a link to Plan & cards. It is not retried automatically; it is read once cards are added (the app
  retries `waiting: 'cards'` cards when a newer balance shows cards left). A sheet after the first such photo explains it once per session.
- **Signed out mid-queue**: a pending card answered `401 sign_in` gets `waiting: 'sign_in'` and is read after sign-in.
- **Pulse Brief**: under the button, "2 of 3 trial briefs left" or "14 briefs left this month". `pro_only`: a locked
  state, "Pulse Brief is part of Pro", with the Pro line and a link to Plan & cards. `no_briefs`: "No briefs left this
  month" with extra briefs and the renewal date. Saved briefs always open.
- Policy (ROADMAP section 2): no pop-ups to recipients, nothing pushy, export always free.

## Test grant script

`scripts/grant.mjs <email> plus|pro [months] | pack50|pack100|pack200 | briefs10 | pass`, run on this Mac with
`SUPABASE_SECRET_KEY` from the shell (as `verify-rls.mjs` does). It looks the account up by email and calls the grant
functions. It never ships in the app.

## Testing

- `npm run test:db` (real Postgres): order of use for cards and briefs, month rollover in India time, a paid period
  ending, a pass expiring mid-way, partial charges stopping at 0, trial briefs given once, daily brakes, and that one
  account cannot read or change another's balance or call the grant functions.
- Worker tests: 401 sign_in, 402 no_cards, pro_only and no_briefs, charging by contacts returned, nothing charged on a
  failed or empty read, uncharged fallback when Supabase is down.
- App unit tests for `balance.ts` (display figures, low-balance threshold, stale balance updates) and the new waiting
  reasons; a test that `shared/plans.ts` and migration 0005 agree.
- `scripts/verify-plans.mjs` against the live project once 0005 is applied.
- Real-phone check: sign-in gate, a Group photo using several cards, running out mid-event, granting a pack and the
  waiting cards being read, the brief trial running out.

## Not in this part

Google Play Billing and server-side purchase checks (part 2); Razorpay; App Store; the 3-phone limit on a pass;
team plans; GST invoices.
