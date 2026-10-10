# Pulse

Pulse (store title "Pulse - Business Card Reader"; tagline "The pulse of your network"; formerly CardPulse): a business-card scanner app — multi-contact cards, India-ready, built for exhibitions. Cards are read by Gemini (vision + structured JSON output); everything else runs on-device.

## Features

- **Scan modes:** one card, front + back, or many cards in one photo (one photo = one Gemini call).
- **Exhibition mode:** create an event, scan stacks of cards into it, export per event (CSV / vCard).
- **Contacts:** search, sort, filter, group chips, multi-select (move / save / delete), duplicate detection.
- **Contact screen:** card image carousel, call / WhatsApp / email / map / web, notes with voice dictation, follow-up date, save to phone, share.
- **Accuracy lab:** correct any field, mark a card reviewed, and get per-field accuracy, multi-contact detection rate, latency and token stats.
- **Photo retention:** keep full photos, thumbnails only, or nothing.
- **Account (optional, Google sign-in):** a shareable card link, stall lead capture, and opt-in sync across phones.

## Run

```bash
npm install
npm run dev        # https dev server (self-signed cert) so the in-app camera works on a phone over LAN
npm run build      # production PWA in dist/
npm test           # unit tests
npm run test:sync  # two phones syncing through a stand-in server, using the real sync engine
npm run test:db    # the Supabase migrations against a real Postgres (PGlite)
npm run icons      # re-render every icon and splash from the mark in src/lib/brandMark.ts
npm run store:capture  # capture the app's screens for the Play listing (headless Chromium, made-up data)
npm run store:render   # compose the Play screenshots and feature graphic from those captures (store/README.md)
```

Deploying under a sub-path (e.g. GitHub Pages project site): `VITE_BASE=/cardpulse/ npm run build`.

## Card reading

The app reads cards only through the Pulse API in `server/` (users need nothing; the Gemini key lives there). Every build
sets `VITE_API_URL` to its own Worker; see `server/README.md` to deploy one. For local work, run the Worker with
`npm run server:dev` and point `VITE_API_URL` at it. (The old "own key" mode, a Gemini key typed into Settings, was
removed on 2026-10-10.)

## Notes

- Contacts and photos live in the browser (IndexedDB). They go to the cloud only if the user signs in and turns on sync. Database changes are in `supabase/migrations/`, run by hand in the Supabase SQL editor.
- On the free Gemini tier Google may use submitted images to improve its products. Use sample cards, or a paid tier for real users.
