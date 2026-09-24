---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css","src/components"]
---

Scope: the whole CardPulse app shell and its screens (home, contacts, contact, my card and share/stall, events, settings, camera, sheets, public card page). Visitor mode: Operate.

Audience: an Indian business person or exhibitor collecting printed cards, one-handed, in meetings and halls. Task: card in hand to reachable contact, and sharing their own card, in the fewest taps. Constraints: on-device by default, 44px+ targets, light and dark, reduced motion, user-chosen accent (src/lib/accents.ts), no behaviour regressions. User answers (2026-09-24): restructure allowed, committed in revertable parts on branch redesign-2026 (baseline tag pre-redesign); signature lives on Home and My Card & sharing; the one failure is "too sparse".

## Direction contract

THESIS: Contacts as a watchlist. CardPulse reads like the trading apps Indian professionals check hourly (Kite, Groww): dense rows, figures right-aligned in tabular numerals, status at the right edge, a ticker of today's numbers. It refuses the Covve/HiHello arrangement it replaces: grey ground, white rounded cards, big 28px titles, pill buttons, a floating Scan pill over the list.

OWN-WORLD: White ground, flat, no card shadows; hairline dividers; grey bands separate sections. Inter at a compact scale (12/13/14/16/22), tabular figures everywhere. 8px-radius buttons, 6px chips, underline tabs, no pills. Palette law: the accent (Ledger Blue by default, user-selectable) means tappable or live; red means due or overdue and nothing else; green means done or positive; amber means check this. Selection inverts a row to ink with white type.

STORY: The user opens the app and sees at once who is due today and how the day's scanning is going, calls from the list without opening anyone, and treats their own card like a holding with its views and leads.

FIRST VIEWPORT: Home: a 44px header (wordmark left, search and settings right); an index strip of three tiles (Due today, This week, Contacts) with big tabular figures; underline watchlist tabs (Due, Upcoming, Recent, Starred) over 56px rows, each with name, company, and the days figure right-aligned in its law colour; events as index rows with card counts. The Scan tab sits filled in the centre of the tab bar.

FORM: Trading Desk, IMPECCABLE'S PICK in seed 41a39674 (my rank 1 of 7), chosen by the user over the rolled Proof Sheet. Raises kept from the declined challengers: palette law (Arcade), one accent object per screen (Cape), selection inverts (Game Boy), named phases never colour alone (Cyclorama), one measured grid on a 4px baseline (Oscilloscope). Signature interaction: tapping a watchlist row opens its depth drawer in place (Call, WhatsApp, Email, Open), the way a trading row opens Buy/Sell; motion is a 180ms height reveal, off under reduced motion. Code-led; no comp.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: whether contact list rows keep the card-photo thumbnail (kept small for recognition in this build).
