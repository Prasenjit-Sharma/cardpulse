# Digital card (Phase 2a): design

Date: 2026-09-21. Status: approved (open questions answered 2026-09-21). Scope: the part of the digital card that needs no server. Hosted links, view
counts and leads captured through a QR are Phase 2b and are out of scope here.

## 1. Goal

A user makes their own business card in about a minute, shows it as a QR at an event or meeting, and shares it as a contact
file or an image. It works offline, needs no account, is free, and never shows the recipient a pop-up. Exhibition use comes
first: a one-tap full-screen QR for a stall.

Success: from a fresh install, someone can create a card, put its QR on screen, and have a second phone's camera offer to save the
contact, with no network.

Non-goals: hosted card links, analytics, lead capture, NFC writing, wallet passes, several languages per card, animated
templates, importing a card from a scanned photo.

## 2. Decisions already made

- My Card is a fifth tab: Home, Contacts, My Card, Events, Settings.
- Up to five cards per user (for example Work, Personal, Stall).
- Five templates: Ledger (default), Header, Split, Noir, Bold. Tint is held back.
- Eight accents, the same list as the app's own (`src/lib/accents.ts`). A new card starts on the app's current accent, Graphite by default.
- Everything is free. Design, colour and font choices are never locked.
- Every template keeps the QR on a white plate, dark modules, with a clear margin, whatever the accent.

## 3. What the user sees

**My Card tab.** A swipeable carousel of cards drawn at real business-card proportions (3.5 by 2 in), a dot row, and two
buttons beneath: Edit and Share. An "Add a card" tile after the last card (until five). An empty state invites the first card.

**Editor.** Live preview on top, then: card name (a label only the user sees), name, title, company, up to three phones, up
to three emails, website, address, social links, photo or logo. Then Design: template, accent, font. Delete card at the bottom,
with confirmation. New cards start blank; there is no own-details entry in Settings.

**Share sheet.** Four actions: Show QR (full screen), Send contact file (.vcf) via the share sheet, Send as image (PNG), Copy
as text. A link option appears in 2b.

**Stall mode.** From Share or a long press on the card. Full-screen white plate, QR at about 80% of the screen width, the
person's name and company beneath, "Scan to save my contact" above. The screen is kept awake (Screen Wake Lock, released on
leave) and the QR needs no other UI. Back button and a visible close control leave it.

## 4. Data model

```
MyCard {
  id: string; createdAt: number; updatedAt: number
  label: string            // "Work"
  name, title, company: string
  phones: string[]; emails: string[]      // max 3 each
  website, address: string; social: string[]
  photo?: Blob             // resized to 512 px long side, JPEG
  template: 'ledger' | 'header' | 'split' | 'noir' | 'bold'
  accent: string           // an id from ACCENTS
  font: 'archivo' | 'inter'
}
```

Stored in IndexedDB. Important: `idb-keyval`'s `createStore` cannot add an object store to a database that already exists,
and the contacts database is already in use, so cards live in a new database (`cardpulse-mycards`). Included in backup and
restore: cards as JSON, photos as files, merged by id like contacts.

## 5. Rendering

One function, `drawCard(ctx, card, width)`, draws any template on a 2D canvas. It is the only renderer: the on-screen preview, the
PNG export and the stall header all call it, so they cannot drift apart. It uses the app's bundled fonts (awaiting
`document.fonts.load` before drawing) and the shared text-fitting helper so long names shrink to fit instead of overflowing.
Layout is expressed in units of card width, as the preview page did, so it scales to any size. Drawn at device pixel ratio for
the screen, and 2000 px wide for export.

Known risk: canvas font-width control (used for Bold's condensed capitals) is not consistent across browsers. Bold falls back to
the heavy weight of Archivo at normal width if condensing is unavailable. To be checked on a real iPhone.

## 6. QR content

The QR encodes a vCard 3.0: name, organisation, title, up to two phones, up to two emails, website, address, and social links.
No photo (too large). To stay fast to scan, the text is built to a budget (target under 600 bytes). If it is over, optional
parts are dropped in a fixed order (social links, address, extra emails and phones) and the editor says which were left out.
The QR is generated on the phone by a small library (`qrcode-generator`, MIT, about 20 KB); this is the one new dependency.
Error-correction level M, quiet zone of four modules.

## 7. Files (new unless marked)

- `src/lib/mycards.ts`: model, defaults, validation, storage, backup entries.
- `src/lib/cardvcf.ts`: vCard text with the byte budget and drop order; pure and tested.
- `src/lib/drawcard.ts` and `src/lib/templates/*`: renderer and the five template layouts.
- `src/components/MyCards.tsx`, `CardEditor.tsx`, `CardShare.tsx`, `StallMode.tsx`.
- Changed: `App.tsx` (tab, routes), `backup.ts` (cards in the zip), `Icon.tsx` (tab icon).

## 8. Error and edge cases

- No photo: templates fall back to a monogram (initials), as the preview page showed.
- A very long name, company or address: text-fit shrinks, then truncates with an ellipsis; nothing overlaps the QR.
- No phone and no email: the QR still carries the name and company, and the editor warns that nobody can reach the person.
- Wake Lock unsupported: stall mode works, and the screen may dim; a one-line hint says to raise the timeout.
- Share files unsupported: falls back to a download, as backup already does.
- Deleting the last card is allowed; the empty state returns.

## 9. Accessibility

Every control is a labelled button of at least 48 px. The card canvas has an accessible description composed from the fields. The
QR has an alternative text reading "Contact card QR for {name}". Reduced motion is respected in the carousel. Colour is never
the only way to tell templates or accents apart (each is named).

## 10. Testing

Unit tests: vCard escaping, the byte budget and drop order, field limits, storage round trip, backup round trip including
photos, text-fit helper. A render smoke test for each template checks that nothing draws outside the card or over the QR plate
(via bounding boxes returned by the layout code). The look is checked by the user on real Android and iPhone handsets; the
visual work goes through Impeccable (shape, build, finish review).

## 11. Build order

1. Data model, storage, backup. 2. vCard builder and QR. 3. Renderer and the five templates. 4. Editor. 5. Share sheet and stall
mode. 6. Tab, empty states, polish and finish review.

## 12. Resolved questions

- No own-details entry in Settings: a new card starts blank.
- Two fonts ship, Archivo and Inter (the bundled ones); canvas font handling is uneven, so no third.
