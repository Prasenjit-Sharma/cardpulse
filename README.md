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

## Card reading

Two modes:

- **Server (production):** the app calls the CardPulse API in `server/` and users need nothing. See `server/README.md` to deploy it, then set `VITE_API_URL`.
- **Own key (development):** with no `VITE_API_URL`, open **Settings**, paste a free Gemini key from https://aistudio.google.com/apikey, and tap **Save and connect**.

## Notes

- Contacts and photos live only in the browser (IndexedDB). In server mode the only network call is to the CardPulse API; in own-key mode it is to Google.
- On the free Gemini tier Google may use submitted images to improve its products. Use sample cards, or a paid tier for real users.
