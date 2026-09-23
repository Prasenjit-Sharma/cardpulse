# CardPulse API

A small Cloudflare Worker that sits between the app and Gemini. The Gemini key lives here, never in the app.

- `POST /v1/extract` takes 1–2 card photos (`{ images: [{ mime, data }] }`, base64) and returns `{ contacts, languages, notes, model, tokensIn, tokensOut }`.
- The prompt and output schema are server-side, so the endpoint cannot be used as a general Gemini proxy.
- Only origins listed in `ALLOWED_ORIGINS` (see `wrangler.toml`) may call it. Limits: 2 photos, ~6 MB, 30 requests per 10 minutes (best effort, per Worker instance) per account when signed in, else per IP.
- Signed-in requests carry the user's Supabase token in the body (`auth`). The Worker asks Supabase's `consume_scan` with that token (a daily per-account count, migration 0002); over the limit is `429 daily_limit`. If Supabase is unreachable, rejects the token, or the function is missing, it falls back to the per-IP limit. `SUPABASE_URL` and `SUPABASE_PUBLISHABLE_KEY` in `wrangler.toml` are public values; the Worker holds no Supabase secret.
- Upstream errors are hidden from the client. Images are never logged or stored.

## Deploy (one time, about 5 minutes, free tier)

```bash
cd server
npx wrangler login                       # opens your browser
npx wrangler secret put GEMINI_API_KEY   # paste your key when asked
npx wrangler deploy                      # prints https://cardpulse-api.<you>.workers.dev
```

Then point the app at it and redeploy the site:

```bash
gh variable set API_URL --body https://cardpulse-api.<you>.workers.dev
gh workflow run "Deploy to GitHub Pages"
```

For local builds: `VITE_API_URL=https://cardpulse-api.<you>.workers.dev npm run build`.

## Develop

```bash
npm run server:test                                   # unit tests, no network
GEMINI_API_KEY=... npm run server:dev                 # local API on :8787 (allows localhost/LAN origins)
```

## Before real users

The burst limit is in memory and resets when the Worker restarts; the daily per-account count is durable. Before a public launch add Cloudflare Turnstile for signed-out use, a hard daily budget cap in the Google console, and a paid Gemini tier (the free tier may use submitted images to improve Google's products).
