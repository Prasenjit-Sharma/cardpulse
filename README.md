# CardPulse

Business-card scanner PWA — multi-contact cards, India-ready, built for exhibitions. Cards are read by Gemini (vision + structured JSON output); everything else runs on-device.

## Features

- **Scan modes:** one card, front + back, or many cards in one photo (one photo = one Gemini call).
- **Exhibition mode:** create an event, scan stacks of cards into it, export per event (CSV / vCard).
- **Contacts:** search, sort, filter, group chips, multi-select (move / save / delete), duplicate detection.
- **Contact screen:** card image carousel, call / WhatsApp / email / map / web, notes with voice dictation, follow-up date, save to phone, share.
- **Accuracy lab:** correct any field, mark a card reviewed, and get per-field accuracy, multi-contact detection rate, latency and token stats.
- **Photo retention:** keep full photos, thumbnails only, or nothing.

## Run

```bash
npm install
npm run dev        # https dev server (self-signed cert) so the in-app camera works on a phone over LAN
npm run build      # production PWA in dist/
```

Deploying under a sub-path (e.g. GitHub Pages project site): `VITE_BASE=/cardpulse/ npm run build`.

## Setup

Open **Settings**, paste a free Gemini API key from https://aistudio.google.com/apikey, tap **Save & connect**, pick a model.

## Notes

- The API key and all cards live in the browser (localStorage / IndexedDB). The only network call is to Google's Gemini API. Do not ship this to end users as-is: the key must move behind a server first.
- On the free tier Google may use submitted images to improve its products — test with sample cards.
