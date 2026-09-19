---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css","src/components"]
---

Scope: the whole CardPulse app shell and its five screens (scan sheet, contacts, contact, events, settings) plus the camera. Visitor mode: Operate.

Audience: an Indian business person collecting printed cards in meetings and at trade fairs, one-handed, in bad hall light. Task: card in hand to reachable contact, fewest taps. Proof: the card photo itself. Constraints: on-device storage, 48px targets, light and dark, reduced motion, 66 passing tests, no behaviour regressions.

## Direction contract

THESIS: CardPulse is the punched sleeve album the cards already live in, made searchable. It refuses the category arrangement it ships today — white rounded cards floating on grey with an avatar circle and a violet pill — because that arrangement has no opinion about what a business card is. Here the card photo is not a thumbnail decorating a row; it is the object, seated in a sleeve, and the interface is the board it is bound into.

OWN-WORLD: Warm board stock (#E9E6DE light, #1A1B18 dark) as ground, ink #1B1E24, bottle green #1F6F4A as the working colour, red #C8102E reserved for the flag and nothing else. Materials: a punched binding edge down the left with real holes, sleeve rows with a lip and a single sheen line, tab dividers with vertical labels for events and sections, photo corners, and a rubber band for the unfiled stack. One family, Archivo, two weights, tabular figures for phone numbers. Elevation is declared once, by the sleeve lip, never a border under a shadow. Recognisable with every word removed: the punched edge, the tabs, the seated cards.

STORY: The visitor understands within one screen that this app keeps the actual cards, not a typed copy of them. They believe nothing is lost, because failed and skipped cards stay visible under the band. They pull a proof, check the people found, and file them behind a tab.

FIRST VIEWPORT: The scan sheet. Board ground with the punched edge at the left margin. No hero and no dashed-ring illustration. Top: CARDPULSE set in condensed caps on the board, with today's count in tabular figures beside it. Below: the band — a physical rubber band across the sheet holding the cards scanned today, each one seated in a sleeve at true 3.5:2 proportions with its name on the register line beside it. Under it, the filed pulls. The primary action is the full-width press bar sitting directly above the tab rail at the bottom of the thumb zone, reading SCAN A CARD. Event tabs stand on the right edge of the contacts sheet, not this one.

FORM: The Card Album, candidate 1 of my ordered grounded list, chosen by the user over the roll's assignment (The Specimen Sheet, candidate 5). Seed key 45456897, kind pick. Named risk carried into the build: skeuomorphic sleeves fight density, so the sleeve is a lip and a seat rather than a glossy pocket, rows stay at 72px, and nothing anywhere flips like a page.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance.

Unresolved: whether events deserve their own tab colours chosen by the user; whether the band should persist across days or clear at midnight.
