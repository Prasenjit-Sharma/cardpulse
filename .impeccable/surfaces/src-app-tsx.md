---
version: 1
slug: "src-app-tsx"
primary_target: "src/App.tsx"
related_targets: ["src/styles.css","src/components"]
---

Scope: the whole CardPulse app shell and its screens (home, contacts, contact, my card and share/stall, events, settings, camera, sheets, public card page). Visitor mode: Operate.

Audience: an Indian business person or exhibitor collecting printed cards, one-handed, in meetings and halls. Task: card in hand to reachable contact, and sharing their own card, in the fewest taps. Constraints: on-device by default, 48px targets, light and dark, reduced motion, user-chosen accent (src/lib/accents.ts), no behaviour regressions.

## Direction contract

THESIS: CardPulse should sit beside Covve and HiHello on a phone and look like it belongs in that class: calm, competitor-grade business software. It refuses the Card Album world it replaced (punched spine, condensed uppercase stamps, square controls, underlined grey fields, hard-shadow buttons), which read as home-made next to them.

OWN-WORLD: Soft grey ground (#F4F5F7 light, #0E1013 dark), white cards at 16px radius with a faint two-layer shadow, pill buttons (filled accent, tonal grey, outline, text), filled rounded fields (12px) with a 3px accent focus ring, pill chips and segmented controls, circular tonal icon buttons, 24px-radius bottom sheets, a translucent tab bar whose active tab carries a soft pill behind its icon. Inter throughout, sentence case, small grey uppercase only for section headings. One accent, chosen by the user, Graphite by default.

STORY: The visitor sees their contacts and their own card presented like a polished product, trusts it with real work, and never meets a control that looks like the browser's.

FIRST VIEWPORT: Home: "CardPulse" at 28px bold top left; three white count tiles (Contacts, Companies, Starred); one white grouped list (Needs attention, Follow-ups, Accuracy); follow-up rows as white cards with the card photo thumbnail; the pill Scan button bottom right above the tab bar.

FORM: Standing exit (the category standard, played straight), chosen by the user in words: "a blend" of Covve's structure and lists with HiHello's stronger card presentation on My Card and the stall screen. No concept roll; user-pinned direction.

FINISH: unreviewed and undocumented is unfinished; this build ends with the finish review, the verdict, DESIGN.md, and every shipping raster carrying its provenance

Unresolved: whether My Card should gain a larger HiHello-style hero treatment (colour band behind the card) in a later pass.
