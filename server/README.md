# Pulse API

A small Cloudflare Worker that sits between the app and Gemini. The Gemini key lives here, never in the app.

- `POST /v1/extract` takes 1–2 photos of one card, or up to 6 cards in one photo set (`{ images: [{ mime, data }], layout, auth, rid }`, base64) and returns `{ contacts, languages, notes, model, tokensIn, tokensOut, balance }`.
- `POST /v1/brief` makes a Pulse Brief for one contact (`{ contact, auth, rid, fresh }`); company research is shared between briefs through the `BRIEF_CACHE` KV namespace (never anything about a person).
- The prompts and output schemas are server-side, so the endpoints cannot be used as a general Gemini proxy.
- Only origins listed in `ALLOWED_ORIGINS` (see `wrangler.toml`) may call it.
- Reading needs a signed-in account: the user's Supabase token travels in the body (`auth`), and the Worker holds no Supabase secret. Limits: a daily brake per account (300 reads, 10 briefs; Unlimited 200 reads, in the database) and a burst brake of 30 per 10 minutes per account (in memory, per Worker instance; per IP only while Supabase is unreachable and reads go uncharged).
- Models: `GEMINI_MODEL` reads cards; when it answers 429, 500, 503 or 504, `GEMINI_FALLBACK_MODEL` is tried once. `BRIEF_MODEL` makes briefs. No `temperature` is sent (Google's upcoming models refuse it).
- Upstream errors are hidden from the client. Images are never logged or stored.

## Environments and deploying

Three Workers on the Pulse Cloudflare account (`wrangler.toml`), each with its own address, Brief cache, Supabase project
and Gemini key; the app builds and websites match them:

| Environment | API | Website | Database | App |
|---|---|---|---|---|
| dev | api-dev.pulsecardscanner.com | dev.pulsecardscanner.com | pulse-test | `npm run android:dev` (Pulse Dev) |
| staging | api-staging.pulsecardscanner.com | staging.pulsecardscanner.com | pulse-test | `npm run android:staging` |
| prod | api.pulsecardscanner.com | pulsecardscanner.com (with the website) | pulse-prod | `npm run android:prod` |

Every Cloudflare command goes through the project token in the Mac Keychain (`cardpulse-cloudflare-token`), for that
command only: the Mac is never logged in to the Pulse account.

```bash
npm run cf -- deploy --env dev          # or staging, prod; always name the environment
npm run cf:secrets                      # Gemini keys from the Keychain into each Worker (cardpulse-gemini-test / -prod)
npm run cf:site -- dev                  # build and publish the dev (or staging) website (site.wrangler.toml)
npm run cf -- tail --env prod           # live logs; watch for "GEMINI CREDIT DEPLETED" (top up in AI Studio → Billing)
```

The first development Worker (`cardpulse-api`, old account) still serves the legacy app until checklist C6:
`npx wrangler deploy -c wrangler.legacy.toml` with the Mac's own login, and `npm run android:legacy` for its app.

## Develop

```bash
npm run server:test                                   # unit tests, no network
GEMINI_API_KEY=... npm run server:dev                 # local API on :8787 (allows localhost/LAN origins)
```

## Plans and balances

Before each read the Worker calls `begin_read` (migration 0005) with the user's own token, and after a good read it
charges one card per contact returned; Pulse Brief uses `begin_brief` and charges after. Charges go through migration
0010's `charge_reads_once` / `charge_brief_once` with the app's request id (`rid`), so a read or brief whose answer was
lost on a weak signal and retried is charged once (the plain `charge_reads` / `charge_brief` if 0010 is missing). Every
answer carries the account's `balance`. If Supabase is slow or down the read goes ahead uncharged (the log says so).
Prices and allowances live in `shared/plans.ts`; migration 0011 holds Unlimited's 3,000 a month.

Until Google Play Billing is added, plans and packs are given with a script run on this Mac:

```
npm run grant -- you@example.com pro 1     # or plus, pack50, pack100, pack200, briefs10, pass; asks for the secret key
npm run verify:plans                       # checks 0005 on the live project; asks for the secret key
```

## Before real users

The burst brake is in memory and resets when the Worker restarts; the daily per-account count is durable. Before a public
launch: a hard daily budget cap in the Google console, and the paid Gemini tier only (the free tier may use submitted
images to improve Google's products). The launch steps are in `docs/LAUNCH-CHECKLIST.md`.
