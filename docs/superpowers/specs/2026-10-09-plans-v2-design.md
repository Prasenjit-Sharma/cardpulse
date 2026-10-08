# Plans v2: five plans, Unlimited, and lead capture as a paid feature

Date: 2026-10-09. Branch `pulse-brand`. Status: awaiting the user's review. Must be settled before Play Billing
(rebrand part 4), because the Play products are created from this list.

## Why

- The user wants a cheaper entry plan with a taste of Pulse Brief, a middle step, and an unlimited plan.
- Lead capture with brochure sharing at a stall is Pulse's most sellable feature, and it's free today.
- Competitor research (2026-10-08):
  - **CamCard** sells unlimited scanning for $9.99 a month (~₹830) or $49.99 a year.
  - **Blinq** charges $9.99 per lead captured at events.
  - **Colleqt**, from the show organiser RX, gives visitors exhibitor information in exchange for their details, but
    only at that organiser's shows.
  - No card scanner offers self-serve lead capture with brochures at any expo.
- Measured costs (2026-10-08): about ₹0.09 per card read, ₹0.05 per card when 4 share a photo, and ₹0.32 per Brief
  plus ₹2.7–4 of Google searches once the free 5,000 a month are used.

## Decisions (from the user, 2026-10-08 / 09)

| Question | Answer |
|---|---|
| Exhibition pass | As today: ₹499, up to 1,000 cards over 7 days from activation. It gains lead capture |
| Unlimited | A separate top plan; Pro stays as it is |
| Free accounts and lead capture | Locked, with a preview of how it works |
| Card packs | As today |
| Opening slide | Lead capture + brochures opens both the Play screenshots and the welcome tour's exhibition screen |

## The price list (`shared/plans.ts`, the single source)

| Plan | Id | Price | Cards | Pulse Brief | Lead capture + brochures |
|---|---|---|---|---|---|
| Free | `free` | ₹0 | 20 a month | 3 to try, once | Locked |
| Starter | `starter` | ₹99 a month / ₹999 a year | 100 a month | 3 a month | Yes |
| Plus | `plus` | ₹199 a month / ₹1,999 a year | 250 a month | 5 a month | Yes |
| Pro | `pro` | ₹399 a month / ₹3,499 a year | 400 a month | 20 a month | Yes |
| Unlimited | `unlimited` | ₹799 a month / ₹6,999 a year | Unlimited, fair use 200 a day | 30 a month | Yes |
| Exhibition pass | pass | ₹499 once | Up to 1,000 over 7 days | none | Yes |
| Card packs | pack50/100/200 | ₹59 / ₹99 / ₹179 | 50 / 100 / 200, never expire | none | No |
| Extra Briefs | briefs10 | ₹149 | — | 10, never expire, any paid plan | — |

Further rules:
- **Daily brakes:** 300 reads and 10 Briefs a day per account for every plan, except Unlimited, whose fair use is
  200 reads a day.
- **Unlimited's allowance** is a monthly figure of 1,000,000 cards. The 200-a-day brake is the real limit, and the app
  shows "Unlimited" instead of a number.
- **What uses a card, the order cards are taken in** (plan, then pass, then packs) **and the charge-after-read rule**
  are all unchanged.

## Lead capture as an entitlement

Lead capture covers publishing a card in **Collect leads** mode, receiving visitors' details, and the event's
**What visitors get** (brochure files and a link). It's allowed while the account has an **active paid plan (any of
the four) or an active Exhibition pass**. The database enforces it; the app's lock is only a convenience.

- **The migration (`0007_plans_v2.sql`)** widens `plans.tier` to `('starter','plus','pro','unlimited')`, puts the new
  numbers into `_allow`, and adds the Unlimited daily brake to `begin_read`.
- It adds `public._can_collect(v_uid uuid) returns boolean`: a paid plan in its period, or an active pass.
- **Publishing in Collect-leads mode:** the RPC or the row policy that stores a card's collect-leads publication
  refuses `not_entitled` when `_can_collect` is false.
- **A visitor submitting details** (`submit_lead_pack`, and `submit_lead` where 0004 isn't run): if the card's owner
  can't collect, nothing is stored. The visitor sees "This stall isn't collecting details right now."
- **Brochure uploads:** the storage policy for visitor-pack files requires `_can_collect(auth.uid())`.
- **When a plan or pass lapses**, leads already received stay with the owner, new submissions are refused, and the
  pack files stay until the event or the cloud data is deleted, as now.
- **Grant scripts and test grants:** `grant_plan` accepts the new tier ids, and `scripts/grant.mjs` and
  `verify-plans.mjs` follow. Nothing has been sold yet, so test grants to `plus` simply carry the new Plus numbers.

## In the app

- **Plan & cards** (`PlanPage.tsx`) shows the five plans, with monthly and yearly, the pass and the packs, all from
  `plans.ts`. Unlimited shows "Unlimited cards · fair use 200 a day".
- **Collect leads** (`StallMode.tsx`) and **What visitors get** (`PackPage.tsx`, the event menu): for an account that
  can't collect, the option shows a lock and opens a short preview sheet.
  - The sheet has a three-step illustration: a visitor scans → leaves their details → gets your brochure.
  - Its line reads "Collect leads and hand out brochures at any expo. With any plan or the Exhibition pass."
  - Its button goes to Plan & cards.
- **The balance** (`src/lib/balance.ts`) gains `canCollect`, worked out on the server by `my_balance()`.
- **The welcome tour's screen 3** becomes "*Leads* walk in. *Brochures* walk out." Text: "At your stall, visitors scan
  your QR, leave their details and get your brochure. Every card you scan is filed under the expo." The scene shows a
  visitor's phone receiving a brochure and the stall phone showing "1 new lead".
- **Copy that names Pro alone** for Brief ("Pulse Brief is part of Pro") changes to "Pulse Brief comes with every plan."
  The Worker's `pro_only` code becomes `plan_needed` for free accounts whose 3 trial Briefs are used up.

## Store listing and slides (prepared now, published with Play Billing)

- **Slide 1:** "*Leads* walk in. *Brochures* walk out." It shows two phones: a visitor's phone showing the stall's
  "What visitors get" page with a brochure, and the stall phone with the real "1 new lead from your stall"
  notification. Both are captured from the app with sample data.
- **The rest shift down one,** so scanning becomes slide 2. The exhibition slide merges into slide 1, keeping 8 in all.
- **The full description** opens its exhibition section with lead capture and brochures. It adds "Lead capture and
  brochure sharing need a paid plan or the Exhibition pass" and "Unlimited is subject to fair use of 200 cards a day."
  It names the plans only once Billing is live. The test that forbids advertising purchases stays until then.

## Testing

- `test/plans.test.mjs`: the SQL constants in 0007 match `plans.ts` for every tier, Unlimited's brake and the pass,
  and each yearly price is under 12 monthly payments.
- `scripts/check-migrations.mjs` (PGlite) runs 0007 and checks:
  - `_can_collect` is true for each paid tier in its period and during a pass, and false for free and after expiry;
  - a lead submitted to a non-entitled owner's card stores nothing;
  - Unlimited is refused at 201 reads a day.
- `test/balance.test.mjs`: `canCollect` is read from the balance.
- The app's lock and preview are checked by eye on the phone.

## Out of scope

Play Billing itself (part 4). Team plans. Changing what one card costs. The website.
