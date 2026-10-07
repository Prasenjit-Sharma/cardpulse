# Store listing (Google Play)

Everything Play Console asks for, ready to paste or upload. English (India). The Apple App Store listing is not here
yet. It's written when the iPhone app is built.

## Where each file goes in Play Console

| Play Console field | File |
|---|---|
| Main store listing → App name | `listing.json` → `play.title` (`Pulse - Business Card Reader`) |
| Main store listing → Short description | `listing.json` → `play.shortDescription` |
| Main store listing → Full description | `listing.json` → `play.fullDescription` (paste as is; the line breaks are kept) |
| Graphics → App icon (512 × 512) | `play-icon-512.png` |
| Graphics → Feature graphic (1024 × 500) | `play/feature-graphic.png` |
| Graphics → Phone screenshots (upload in this order) | `play/phone/01-scan.png` … `08-more.png` |
| App content → Data safety | `data-safety.md`, a draft: check it against the app and `public/privacy.html` before submitting |
| App content → Privacy policy | https://prasenjit-sharma.github.io/cardpulse/privacy.html |

Category: **Business**. Tags to pick in the console: business card scanner, contact management, productivity.

## Regenerating

- `npm run store:capture` opens the app in a throwaway headless Chromium at phone size, loads the made-up sample data in
  `capture/seed.ts`, and saves the raw screens to `screens/raw/`. Run it after a UI change.
- `npm run store:render` composes `slides/*.html` around those captures and writes `play/`. It also writes
  `play/contact-sheet.png`, every slide at 160 px wide, for the thumbnail test (can you read each headline?).
- `npm run icons` remakes the app icons, including `play-icon-512.png`.
- `npm test` checks the text against Play's limits and policy, and that every image has the right size and no alpha.

All people, companies, numbers and events in the screenshots are made up.
