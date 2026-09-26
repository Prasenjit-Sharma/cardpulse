---
name: CardPulse
description: Business-card scanner and digital card, laid out as a trading desk where contacts read like a watchlist
colors:
  primary: "#3B2FC9"
  primary-lite: "#A9A3FF"
  primary-fill-dark: "#CDCAFF"
  on-primary: "#FFFFFF"
  on-primary-dark: "#0B0E10"
  primary-deep: "#2A1F9E"
  primary-deep-dark: "#221A7E"
  band-ink: "#4A43A6"
  band-ink-dark: "#B7B2F5"
  card-graphite: "#2A2F36"
  board: "#FFFFFF"
  band: "#F4F4FA"
  tonal: "#EEEEF7"
  well: "#E2E2EF"
  desk: "#EAEAF3"
  edge: "#D7D7E6"
  field: "#F2F2F8"
  ink: "#15142A"
  ink-2: "#3D3C55"
  ink-3: "#62617A"
  rule: "rgba(20,23,28,.11)"
  rule-soft: "rgba(20,23,28,.08)"
  red: "#C62F22"
  red-wash: "rgba(198,47,34,.09)"
  amber: "#9A4A06"
  amber-wash: "rgba(180,83,9,.11)"
  green: "#13773F"
  green-wash: "rgba(19,119,63,.10)"
  lock: "#5DD6C8"
  camera-ground: "#0B0D10"
  board-dark: "#0F0F17"
  band-dark: "#161622"
  tonal-dark: "#1E1E2C"
  well-dark: "#282838"
  desk-dark: "#08080D"
  edge-dark: "#2D2D40"
  sleeve-dark: "#121519"
  ink-dark: "#EEEEF6"
  ink-2-dark: "rgba(238,238,246,.80)"
  ink-3-dark: "rgba(238,238,246,.62)"
  rule-dark: "rgba(237,239,242,.11)"
  rule-soft-dark: "rgba(237,239,242,.07)"
  red-dark: "#F2867C"
  amber-dark: "#E8A25C"
  green-dark: "#6FCF97"
typography:
  page:
    fontFamily: "Inter Variable, Inter, system-ui, -apple-system, Segoe UI, Roboto, sans-serif"
    fontSize: "22px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  wordmark:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "20px"
    fontWeight: 750
    lineHeight: 1
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 650
    lineHeight: 1.3
  row-name:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 600
    lineHeight: 1.3
    letterSpacing: "-0.005em"
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.45
    fontFeature: "'cv11', 'ss01'"
  caption:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  meta:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.05em"
  micro:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 600
    letterSpacing: "0.02em"
  figure-index:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
  figure-holding:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "24px"
    fontWeight: 700
    lineHeight: 1.2
    letterSpacing: "-0.02em"
    fontFeature: "'tnum'"
  figure-row:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 650
    fontFeature: "'tnum'"
  input:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 400
  card-face:
    fontFamily: "Archivo, system-ui, sans-serif"
    fontWeight: 600
rounded:
  tag: "4px"
  chip: "6px"
  key: "8px"
  panel: "10px"
  card: "12px"
  sheet: "14px"
  round: "999px"
spacing:
  baseline: "4px"
  gap: "8px"
  gutter: "16px"
  gutter-wide: "28px"
  band: "32px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.key}"
    height: "48px"
  button-primary-dark:
    backgroundColor: "{colors.primary-fill-dark}"
    textColor: "{colors.on-primary-dark}"
    rounded: "{rounded.key}"
    height: "48px"
  button-tonal:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    height: "44px"
    padding: "0 18px"
  icon-key:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    size: "40px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    typography: "{typography.input}"
    rounded: "{rounded.key}"
    height: "48px"
    padding: "0 14px"
  band-heading:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink-3}"
    typography: "{typography.meta}"
    height: "32px"
    padding: "0 16px"
  watch-row:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    typography: "{typography.row-name}"
    height: "60px"
    padding: "8px 16px"
  watch-row-selected:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board}"
  depth-drawer:
    backgroundColor: "{colors.band}"
    textColor: "{colors.primary}"
    rounded: "{rounded.key}"
    height: "52px"
  masthead:
    backgroundColor: "{colors.primary-deep}"
    textColor: "{colors.on-primary}"
    height: "56px"
    padding: "0 16px"
  index-tile:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    typography: "{typography.figure-index}"
    padding: "12px 16px 13px"
  watchlist-tab:
    textColor: "{colors.ink-3}"
    height: "44px"
    padding: "0 10px"
  watchlist-tab-active:
    textColor: "{colors.ink}"
  index-row:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    height: "56px"
    padding: "8px 16px"
  event-row:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    height: "64px"
    padding: "8px 8px 8px 16px"
  live-tag:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.tag}"
    padding: "1px 5px"
  phase-tag:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.tag}"
    padding: "1px 7px"
  trade-key:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.key}"
    height: "46px"
    padding: "0 12px"
  trade-key-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.key}"
    height: "46px"
  holding-cell:
    backgroundColor: "{colors.band}"
    textColor: "{colors.ink}"
    typography: "{typography.figure-holding}"
    padding: "10px 12px 12px"
  scan-key:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board}"
    rounded: "{rounded.key}"
    width: "48px"
    height: "32px"
  tab-bar:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink-3}"
    typography: "{typography.micro}"
    height: "60px"
  selection-bar:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board}"
    padding: "8px 12px 8px 16px"
  chip:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink-2}"
    rounded: "{rounded.chip}"
    height: "34px"
    padding: "0 12px"
  chip-on:
    backgroundColor: "{colors.ink}"
    textColor: "{colors.board}"
    rounded: "{rounded.chip}"
  mode-rail:
    backgroundColor: "rgba(20,22,26,.55)"
    textColor: "rgba(255,255,255,.78)"
    rounded: "{rounded.key}"
    height: "44px"
  mode-rail-on:
    backgroundColor: "#FFFFFF"
    textColor: "#111418"
    rounded: "{rounded.key}"
  sheet:
    backgroundColor: "{colors.board}"
    textColor: "{colors.ink}"
    rounded: "{rounded.sheet}"
    padding: "6px 8px 18px"
---

# Design System: CardPulse

## Overview

**Creative North Star: "The Trading Desk"**

CardPulse reads like the trading apps Indian professionals check every hour. Contacts are a watchlist: dense rows on a flat white ground, who on the left, one figure on the right in tabular numerals, the state of each person carried by that figure's colour and a word under it. Home opens under an indigo masthead carrying six standing figures in one aligned grid and the event that matters now, then underline watchlist tabs over the rows. The user's own card is treated as a holding, with its shares, QR showings, views and leads counted in one ruled band.

The brand is **Neel Indigo**, India's indigo ink (chosen 2026-09-26, replacing the user-selectable accent). It is the one colour of the app: Home opens under an indigo masthead, every band and neutral leans a few degrees toward it, and the band headings carry it at text weight.

The world is flat and measured. Nothing floats on the page: surfaces are marked by hairlines, sections are separated by full-bleed grey bands, and depth appears only for things that genuinely sit above the page (sheets, toasts, the digital card object). Density is the point; the one failure this world is built against is a sparse screen. Controls are squared keys at 8px, never pills, and colour carries meaning under a strict law rather than decoration.

It replaced the Covve/HiHello arrangement (grey ground, white rounded cards, 28px titles, pill buttons, a floating Scan pill over the list), and before that the rejected "Card Album" skeuomorphic world.

**Key Characteristics:**
- Flat white ground, hairline rules, full-bleed grey bands as section headings.
- Inter at a compact scale; every figure in tabular numerals.
- Squared 8px keys; round only for switches, dots and the camera's own controls.
- One brand colour, Neel Indigo: the Home masthead, indigo-leaning neutrals, indigo band headings.
- Palette law: indigo is tappable or live; red is due; green is done or up; amber is check this.
- One accent-filled action per screen; Scan is filled in ink, not accent.
- Rows act in place: a tapped watchlist row opens its depth drawer.

## Colors

A trading screen in one brand colour, Neel Indigo, with neutrals tinted toward it and three state colours that each mean one thing.

### Primary
- **Neel Indigo** (#3B2FC9, `--brand-base`): the brand, fixed in `src/styles.css`. It means *tappable or live*: links, the active tab, the watchlist underline, depth-drawer actions, the Live tag, the one filled action per screen, checked boxes and switches. 8.6:1 on white, and white text on it 8.6:1.
- **Neel Indigo, light twin** (#A9A3FF, `--brand-lite`): the brand in dark mode, carrying dark text (8.5:1 on the dark board).
- **Deep Indigo** (#2A1F9E, dark #221A7E, `--brand-deep`): the Home masthead, the one indigo surface. Text on it is white, labels white at 78%, and the state colours lift to on-brand twins (`--on-brand-red` #FFB8B0, `--on-brand-green` #9CF0C2, `--on-brand-amber` #FFD48E), all above 7:1.
- **Band ink** (#4A43A6, dark #B7B2F5): band headings, the brand at text weight (7.3:1 on a band).
- **Indigo wash** (`color-mix` 7–9% of the brand into the board): the Settings account block, a live event strip, tool wells.
- **Dark primary fill** (primary-fill-dark): in dark mode the one filled action is the light twin mixed 62% with white.
- **Card colours** (`src/lib/accents.ts`): the nine colours now belong only to the digital cards (card editor, drawn cards, public card page). The app chrome never reads them.

### Secondary
- **Due Red** (red / red-dark): due today or overdue. The Due index figure, "2d late" and "Today" row figures, the Due tab count, a late follow-up on the contact page.
- **Up Green** (green / green-dark): done or positive. "+3 today" under index tiles and event rows, Leads above zero in the holding, the toast's check.
- **Check Amber** (amber / amber-dark): check this. Setup and backup nudges as amber-washed bands, the To check figure when above zero (on-brand amber on the masthead), duplicate notes under a name, edited-field wash, the offline bar.

### Tertiary
- **Lock Teal** (lock): "card locked" in the camera outline and the photo-adjust edge. It must read over any photo whatever the accent, so it sits outside the accent system.

### Neutral
- **Board** (board / board-dark): the app's ground, flat white in light and an indigo near-black (#0F0F17) in dark. Rows sit directly on it. Every neutral below leans toward the brand hue (band #F4F4FA, tonal #EEEEF7, ink #15142A).
- **Band** (band / band-dark): grey bands. Section headings, the holding, an open watchlist row, the depth drawer.
- **Tonal** (tonal / tonal-dark): quiet fills. Tonal buttons, square keys, tag and count backgrounds.
- **Well** (well / well-dark): switch track and pressed states.
- **Desk** (desk / desk-dark): outside the app column on screens 900px and wider.
- **Edge** (edge / edge-dark): the 1px inset ring on chips, pickers and filter keys.
- **Field** (field): text fields and pickers standing in for fields.
- **Ink / Ink 2 / Ink 3**: primary text, secondary text, and muted text. Ink 3 is the lightest grey allowed for text (5.5:1 on white, 5.1:1 on a band).
- **Rule / Rule soft**: hairlines. Rule for structural edges (tab bar top, index strip bottom, tab underline track); rule-soft for row dividers and band edges.

### Named Rules
**The Palette Law.** The accent means tappable or live. Red means due or overdue. Green means done or up. Amber means check this. A colour that means something is never used for decoration. The build also uses red for destructive actions inside sheets and confirm dialogs and for error lines; red is never used on a list for anything but due.

**The Named-State Rule.** A state never rests on colour alone: every figure carries a word ("Follow-up", "late", "today", the phase New / Contacted / Follow-up), and the Live tag is a word.

**The One Accent Object Rule.** Each screen has at most one accent-filled action: Share card on My Card, Call (or Email) on the contact's trade bar, the empty-state action. Everything else is tonal, ink or a link.

## Typography

**UI Font:** Inter Variable (with Inter, system-ui, -apple-system, Segoe UI, Roboto), stylistic sets `cv11` and `ss01`.
**Card Font:** Archivo, loaded only for the digital cards drawn on canvas; never used for interface text.

**Character:** One compact grotesque doing everything, the way a market screen does: tight page titles, semibold row names, and figures that line up in columns.

### Hierarchy
- **Figure, index** (700, 28px, 1.2, -0.02em, tabular): the three index tiles on Home.
- **Figure, holding** (700, 24px, 1.2, tabular): the My Card holding band.
- **Page** (700, 22px, 1.15, -0.022em): screen titles and the contact's name in its quote header. The Home wordmark is 20px at 750.
- **Title** (650, 16px): sheet titles, section titles, the bar title, event figures.
- **Row name** (600, 15px, -0.005em): a person's name on a watchlist row, clipped to one line.
- **Body** (400, 14px, 1.45): the base; index-row and event names at 650; the right-edge figure at 650, tabular.
- **Caption** (13px): second lines (company and title), muted text, hints.
- **Meta** (600, 12px, +0.05em, uppercase in bands): band headings; 12px sentence case for index tile labels and small facts.
- **Micro** (600, 11px): masthead and account labels (uppercase, +0.03em), holding labels (uppercase, +0.03em), the word under a figure, tab-bar labels, tab counts.
- **Input** (16px): every text field, so iPhone Safari never zooms on focus.

### Named Rules
**The Tabular Rule.** Every number that can change (counts, dates, days, percentages, phone numbers) is set in tabular numerals (`font-variant-numeric: tabular-nums`, the `.num` class) so columns hold still.

**The Compact Scale Rule.** Text sizes come from 12 / 13 / 14 / 16 / 22 (`--t-xs` to `--t-xl`). The only other sizes are the figure register (24, 28), the 15px row name, the 11px micro label and the 16px input size.

**The Sentence Case Rule.** Buttons, tabs, chips and sheet items are sentence case. Uppercase appears only in band headings, masthead, account and holding labels, and event names (shown in capitals like an exhibition badge, stored as typed).

## Layout

A single phone column, 560px at most, centred, with 16px side gutters (28px on screens 900px and wider, where the column widens to 880px on the desk colour). Lists, bands, the masthead, the event strip, the holding and banners run full-bleed to the column edges by cancelling the gutter; row content keeps the 16px inset and row dividers start 16px in.

Spacing sits on a 4px baseline with 8px as the working gap. Row heights are fixed steps: 56px index rows, 60px watchlist rows, 64px event rows, 32px band headings, 40px masthead mini cells, 44px watchlist tabs, 60px tab bar, 46px trade keys. Touch targets are 44px or more; small keys extend their hit area with a 4px invisible ring.

Home, top to bottom: the indigo masthead (a 56px wordmark row, then the six figures in one three-column grid), the event strip, amber nudge bands if any, the watchlist tabs, up to a fixed number of rows. The event is on the first screen, never below the watchlist. A short watchlist never leaves the desk half empty: the next phase carries on under its own band ("Then: Upcoming").

Fixed chrome stacks from the bottom: the tab bar, then the selection bar docked directly above it while selecting; on the contact page the trade bar replaces the tab bar's position at the foot of the screen.

## Elevation & Depth

Flat. The page carries no shadows; a surface that needs an edge gets a 1px hairline (`--seat` is `0 0 0 1px var(--rule)`), and sections are separated by grey bands with rule-soft edges, not by lifted cards. Depth is reserved for things that genuinely sit above the page.

### Shadow Vocabulary
- **Hairline seat** (`box-shadow: 0 0 0 1px var(--rule)`): panels, tables, thumbnails, the card photo.
- **Float** (`box-shadow: 0 2px 6px rgba(16,24,40,.08), 0 14px 34px rgba(16,24,40,.14)`; dark `0 2px 8px rgba(0,0,0,.5), 0 16px 38px rgba(0,0,0,.45)`): toasts.
- **Sheet** (`box-shadow: 0 -10px 40px rgba(8,10,14,.18)`): bottom sheets, over a `rgba(8,10,14,.42)` scrim.
- **Card object** (`box-shadow: 0 0 0 1px var(--rule), 0 10px 28px rgba(16,24,40,.12)`): the digital card on My Card and the public card page, the one physical object in the app.

### Named Rules
**The Hairline Rule.** If it is on the page, it is marked by a hairline or a band, never a drop shadow. Only sheets, toasts and the digital card float.

**The Band Rule.** A section heading over a list is a full-bleed grey band (32px, band fill, rule-soft top and bottom, 12px uppercase meta in ink-3), with its one link right-aligned in the accent.

## Shapes

Squared and quiet. Keys, buttons, fields, tabs and the depth drawer's actions are 8px; chips, pickers and filter keys 6px; inline tags (phase, Live, tab counts, scan thumbnails) 4px; panels and toasts 10px; the digital card 12px; sheet tops 14px. Round is reserved for switches (48 by 28 track, round knob), dots (carousel dots, radio dots, accent swatches), avatars in the QR result, and the camera's own controls. Rows and bands have no corners at all; they run edge to edge.

### Named Rules
**The No-Pill Rule.** Nothing on the page is a pill. `--r-pill` is 8px by definition; a control that looks like a capsule is wrong.

## Components

### Buttons and keys
- **Primary:** the accent fill (dark: the lifted light twin), 48px, 650 weight, full width or paired with a square key. At most one per screen. Disabled turns tonal grey with ink-3 text.
- **Tonal:** tonal fill, ink text, 44px, 8px. The default button.
- **Icon key:** 40px square, 8px, tonal; ghost in headers. A header key that is on inverts to ink.
- **Link:** accent text, 600, no fill.
- **Press:** a 0.98 scale on buttons; rows, tabs and bands darken to band or tonal instead of scaling.

### Watchlist row and depth drawer (signature)
A 60px row: a 52 by 30 card thumbnail (4px, hairline), the name at 15px 600 with a star mark when starred, the company and title at 13px ink-3, an amber duplicate note when there is one. At the right edge, the figure: 14px 650 tabular on top, an 11px word under it. The figure's tone follows the law (`src/lib/watch.ts`): "3d late" and "Today" in red, "in 4d" in ink, otherwise the scan date with the contact's phase. Tapping the row opens its depth drawer in place: the row turns band grey and a band strip of equal-width 52px actions (Call, WhatsApp, Email, Star, Open) reveals over 180ms; unavailable actions dim to 45%. While selecting, a tap selects instead and the row inverts to ink with board-coloured type.

### Home masthead (signature)
The one indigo surface, full-bleed from the top of the screen (under the status bar): the wordmark with the light-toned logo, Search and Settings keys in white, and behind them the brand's pulse line in white at 10%. As Home opens, a brighter beat runs along the line once (1.4s; hidden with reduced motion). Under a white hairline, today's figures sit in **one grid of three columns**, so the two rows always align: Due, This week, Contacts (12px label, 28px 700 figure, 12px line), then Starred, Companies, To check as 40px cells (11px uppercase label left, 14px figure right). Due turns on-brand red when anyone is due, "+N today" on-brand green, To check on-brand amber.

### Page top and figure grid
Every screen other than Home opens on the **page top**: the indigo wash (7% brand into the board, `--wash`), full-bleed and running up under the status bar, closed by an indigo hairline. It holds the title row (back key, title, actions) and, on screens that count something, a **figure grid**: equal columns ruled apart by indigo hairlines, each an 11px uppercase ink-3 label over a 20px 700 tabular figure with an optional 11px word under it. The columns always align. Used on Contacts (title and event tabs), Events (Events, Live now, Cards filed), My Card (the card and Shared, QR shown, Views, Leads), Insights, Accuracy (Read right, Untouched, Opened), Companies, Scan review (Found, Companies, Saving), the contact page (name, phase and card photo) and the card editor, whose pinned preview continues the wash. **The four tab-bar screens share the deep form** (`.page-top.deep`, Deep Indigo with white type, white tab underline and on-brand state colours): Home's masthead, Contacts, Events and My Card, so moving between tabs never loses the brand. Detail screens reached from them (Insights, Accuracy, Companies, the contact page, Scan review, the card editor) keep the light wash, which marks them as a step in. The light wash alone read as white on a phone (checked 2026-09-26), so it never carries a tab screen. Below the page top, content is flat: band headings over hairline rows, and actions as tool keys (indigo wells over names, equal columns). No white rounded boxes remain; the old stat boxes and boxed company list are retired.

### Event strip
Straight under the masthead, so the event is on the first screen: only events live today (two at most), each a 56px row on an indigo wash with the Live tag, the name, when it runs, its card count with "+N today", and an "All N" link to Events on the first. With nothing live, Home shows no event at all; upcoming and past events live on the Events tab. It replaces the Events section that used to sit under the watchlist.

### Watchlist tabs
Underline tabs over a rule: 14px 600, ink-3 at rest, ink when chosen with a 2px accent underline inset 10px each side. Counts sit in 4px tonal tags; the Due count is red on a red wash. Used for Home's watchlists and the Contacts event tabs.

### Index rows and event rows
Index rows (56px) are a name at 14px 650 over a 12px fact line, with a right-edge figure; used for Home events, My Card's recent sharing and the At a stall row. Event rows (64px) carry the event name in capitals with a Live tag (10px, 700, uppercase, accent fill, 4px) on the live event, a facts line (people, companies, starred, reading), the card count as a 16px figure with "since" and the start date under it, then a quiet tonal scan key and a ghost options key.

### Contact quote header and trade bar
The contact opens on a quote: name at 22px, title and company, then one status line of the phase tag, the follow-up figure (red when late) and the event, with the card photo (104px, 6px, hairline) beside it. Details are a flat full-bleed ruled table with 40px square accent-wash action keys. Tags, Notes and Follow-up are 40px tonal action keys; the open one is filled in ink. The trade bar is fixed at the foot above a rule: Call (or Email) as the one accent key, WhatsApp tonal, then square Save to phone and Share keys, 46px each.

### My Card holding
The digital card sits on the white page (12px, card-object shadow). Under it, a full-bleed band of four ruled cells: Shared, QR shown, Views, Leads, each an 11px uppercase label over a 24px 700 tabular figure; Leads turns green above zero, and a dash stands in when signed out. Then Share card as the one accent action beside a 48px square QR key, an At a stall index row, and Recent sharing as index rows from the on-device share log (`src/lib/sharelog.ts`).

### Tab bar and Scan key
Fixed, board fill, a rule along its top, 60px. Five slots: Home, Contacts, Scan, Events, My Card; icon over an 11px 600 label in ink-3. The active tab is accent-coloured with a 2px accent rule along the bar's top edge. Scan sits in the centre as the bar's one filled key, a 48 by 32 ink block (8px) with the board-coloured camera, so each screen keeps its own single accent action.

### Selection bar
While selecting contacts, a flat ink bar (no radius) docks directly above the tab bar: the count in 13px 600, an All link, a Move to picker and Save and Delete keys as translucent board tints. No red on it; Delete asks in a dialog.

### Chips, pickers and fields
Chips are 34px, 6px, a board fill with an edge ring, ink-2 text; chosen chips fill with ink. Pickers are the app's own (`Picker`), never native `<select>`; dates open the app's own calendar (`DateChip`). Fields are 48px, field fill, 8px, 16px text; focus turns the field board-white with an accent border and a 3px accent-wash halo.

### Edit forms (card editor, contact edit)
Editing never wraps fields in panels. A form is a flat label | value table on rule-soft hairlines, the same shape as the
read views it edits (a contact's details, My Card's rows): a 92px label column in 12px 600 uppercase ink-3, values as
flat 44px inputs with no fill. Focus gives the value the field fill and a 2px accent underline. A field corrected after a
misread shows an amber wash (it counts against accuracy). Multi-value fields (phones, emails, social) stack their inputs
with a small x to remove and an accent "+ Add" link. Groups sit under band headings.

**The card editor.** The card being made stays pinned at the top, seated on a band (card at min(82%, 380px), 58% on
short screens), while its fields scroll under it. Bands: Who, How to reach you, Photo or logo, Design. The photo row is a
48px thumbnail well, a two-line status ("On the card" / "None yet", with a hint) and one tonal Add or Change key, with a
Remove link when a picture is set. Design choices are rows in the same table: Template and Font as 36px, 6px squared keys
(the chosen one fills with ink); Colour as 28px squares with 7px corners, the chosen one ringed board then ink, its name
underneath. Every choice group is a radiogroup with `aria-checked`. Delete card is a quiet full-width red row at the end
(trash icon, "Delete card", a one-line consequence), never a large red button; it confirms in a dialog. Save is the
screen's one accent action, in the header.

### Settings
A hub, not one long list (after Covve's split, in this world's flat idiom). A back key and a 22px title, then the account block on an indigo wash between indigo hairlines: a 64px row with a 40px indigo initial avatar, the name and the sync status (or "Sign in with Google"), opening Account; under it three ruled cells of what this phone holds: Contacts, Accuracy (indigo, opens the report) and Sync. Then a **Tools** band over four equal keys ruled apart, each a 44px indigo-wash well over its 13px name: Export (a sheet: Spreadsheet CSV, Phone contacts vCard, Backup file, with a note on how an export differs from sync), Restore, Accuracy, Insights. Never a sideways scroll. Then a **More** band over rows opening sub-pages: Preferences (Saving contacts, Display, This phone with Keep card photos, Install and Delete all data), Account and sync, and Help & support (Send feedback, Privacy policy, Diagnostics). Each sub-page has its own back key and the Android back button closes it.

Rows are flat: 52px, a 20px ink-2 icon, a 14px 500 label with an optional 12px ink-3 hint, and on the right a 13px 600 ink-2 value plus a chevron when the row opens something. Row hairlines are inset to start under the text (50px). A switch row is tappable across its whole width. Group footers are 12px ink-3 under a hairline. Destructive rows (Delete all data, Delete cloud data, Delete account) are red text with a red icon, the dialog-level exception to the Palette Law, and always confirm. The version and logo close the hub on a hairline.

**The Flat Form Rule.** Editing and settings screens use the same flat, hairline, full-bleed rows as the reading screens.
If a form or a settings group is sitting in a rounded, bordered box, it has slipped back into the replaced world.

### Sheets, dialogs and toasts
Sheets rise from the bottom (280ms), board fill, 14px top corners, a 36 by 5 grey handle, a 16px 650 title, 50px rows with a leading ink-2 icon; destructive rows are red, a checked row is accent. Confirm and prompt are sheets too (`Dialog`), Cancel beside the action; a destructive confirm is solid red. Toasts are ink with board text, 10px, above the tab bar, with a green check.

### Stall mode
The QR and nothing else: a fixed full-screen white page in both themes (`#FFFFFF`, ink `#111418`), the QR at min(80vw, 62dvh), the name at 26px 700, company and an uppercase event tag, a 48px close key. In short landscape it lays out as a row.

### Camera and mode rail
The camera keeps its own dark world over the live picture (`#0B0D10`) with glassy controls (`rgba(20,22,26,.55)` with a 10px backdrop blur). Its top edge holds three round keys only: Close left, Auto detect and Flash right, with the status line centred below. A detected card is outlined in white, turning lock teal when locked. The mode rail sits just above the shutter within thumb reach: Card, 2-sided, Group, QR in one squared glass rail; only the chosen mode is named, filled white with ink text, the rest are icons. The 72px white shutter's ring shows the mode: whole for Card, halves for 2-sided (the first fills once the front is taken), quarters for Group, and a hollow ring that breathes on QR (off under reduced motion). A six-slot tray counts captured cards for a group.

## Do's and Don'ts

### Do:
- **Do** put a person's state in one right-edge figure with a word under it, tabular, coloured by the Palette Law.
- **Do** separate sections with full-bleed grey bands (32px) and rows with rule-soft hairlines inset 16px.
- **Do** keep one accent-filled action per screen; Scan stays ink.
- **Do** invert a selected row, chip or day to ink with board-coloured type.
- **Do** use the app's own Picker, DateChip, Check, Dialog and SettingRow instead of browser controls.
- **Do** keep text on 12 / 13 / 14 / 16 / 22, figures on 24 / 28, inputs at 16px.
- **Do** honour reduced motion: the drawer reveal, row rise and scan breathing collapse to nothing.

### Don't:
- **Don't** use pills, rounded white cards on a grey ground, or 28px page titles: the replaced Covve/HiHello arrangement.
- **Don't** float a Scan button over a list; Scan lives in the tab bar.
- **Don't** put drop shadows on page surfaces; only sheets, toasts and the digital card float.
- **Don't** use red on a list for anything but due or overdue, or amber and green as decoration.
- **Don't** introduce a second accent; the user's chosen accent is the only brand colour.
- **Don't** bring back skeuomorphic or novelty detail (spines, punched holes, album stamps).
