---
name: CardPulse
description: Business-card scanner and digital card, in a calm competitor-grade interface
colors:
  ground: "#F4F5F7"
  surface: "#FFFFFF"
  tonal: "#ECEEF1"
  field: "#F1F3F6"
  track: "#E4E7EB"
  border: "#DDE1E6"
  ink: "#111418"
  ink-secondary: "#434A55"
  ink-muted: "#5B6370"
  primary: "#2A2F36"
  on-primary: "#FFFFFF"
  danger: "#C4281C"
  warning: "#A34A08"
  success: "#1E7B45"
  ground-dark: "#0E1013"
  surface-dark: "#171A1F"
  tonal-dark: "#1D2127"
  field-dark: "#20242B"
  ink-dark: "#F1F3F5"
  primary-dark: "#C8CDD3"
typography:
  headline:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 700
    lineHeight: 1.15
    letterSpacing: "-0.022em"
  title:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "17px"
    fontWeight: 650
    lineHeight: 1.3
  body:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.45
  caption:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.45
  label:
    fontFamily: "Inter Variable, Inter, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 600
    letterSpacing: "0.06em"
rounded:
  thumb: "6px"
  photo: "8px"
  field: "12px"
  row: "14px"
  card: "16px"
  sheet: "24px"
  pill: "999px"
spacing:
  gutter: "16px"
  gap: "8px"
  group: "26px"
components:
  button-primary:
    backgroundColor: "{colors.primary}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    height: "50px"
  button-tonal:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    height: "44px"
  button-danger:
    backgroundColor: "{colors.danger}"
    textColor: "{colors.on-primary}"
    rounded: "{rounded.pill}"
    height: "50px"
  icon-button:
    backgroundColor: "{colors.tonal}"
    textColor: "{colors.ink}"
    rounded: "{rounded.pill}"
    size: "40px"
  input:
    backgroundColor: "{colors.field}"
    textColor: "{colors.ink}"
    rounded: "{rounded.field}"
    height: "48px"
    padding: "0 14px"
  card:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.card}"
    padding: "16px"
  list-row:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.row}"
    padding: "10px 12px"
  chip:
    backgroundColor: "{colors.surface}"
    textColor: "{colors.ink-secondary}"
    rounded: "{rounded.pill}"
    height: "36px"
  sheet:
    backgroundColor: "{colors.surface}"
    rounded: "{rounded.sheet}"
---

# Design System: CardPulse

## Overview

Calm, competitor-grade business software that sits beside Covve and HiHello on a phone: Covve's quiet grouped lists and settings, HiHello's confident presentation of the card itself. The interface recedes; the only rich objects on screen are business cards (the photo of a scanned card, or the user's digital card). Nothing looks like a browser default. It replaced the "Card Album" world (punched spine, condensed uppercase stamps, square controls, underlined fields), which read as home-made.

## Colors

Restrained: neutral greys plus one accent. The accent is user-chosen (Settings > Accent colour, eight options in `src/lib/accents.ts`, Graphite by default) and is set at run time as `--brand-base` / `--brand-lite`; dark mode uses the lighter twin. The accent fills primary buttons, the Scan button, the active tab's pill, selected chips and switches, and links. Red is for destructive actions and overdue states only; amber for warnings and "needs attention"; green for success and the confirmation toast. Secondary text is always `--ink-3` (5.9:1 on white), never a lighter grey.

## Typography

Inter Variable for the whole interface, sentence case everywhere. Five sizes: 28 page titles (700, tight tracking), 17 titles and sheet headings (650), 15 body, 13 captions, 12 labels. Uppercase appears only in section headings (12px, 600, +0.06em, muted), the way a phone's own settings label its groups. Inputs are 16px so iPhone Safari never zooms on focus. Figures in counts and dates are tabular. The digital cards are drawn on canvas in their own faces (Archivo or Inter) and are not governed by this ramp.

## Layout

A single 560px column centred on phones and small tablets, 16px side gutters, 8px between list rows, 26px above a section heading and 8px below it. Wide screens (900px+) widen the column to 880px on a quiet desk colour and put list rows in two columns. The bottom tab bar is fixed and translucent; the pill Scan button floats above it at the bottom right.

## Elevation & Depth

Lifted, not layered: white surfaces on the grey ground carry one faint two-part shadow (`--seat`); floating things (the Scan button, the contact actions button, toasts, sheets) carry a deeper one (`--seat-deep`, sheets a soft upward shadow). Borders are used only for outline buttons, chips and pickers on white, as a 1px inset ring.

## Shapes

Everything interactive is round: pill buttons, chips, segmented controls, switches, date chips, the search field; circular icon buttons. Containers are soft rectangles: 16px cards, 14px list rows, 12px fields, 24px sheet tops, 6 to 8px on card photos and thumbnails.

## Components

- **Buttons:** primary (accent fill, 50px, the one main action per screen), tonal (grey fill, 44px, the default), outline (1px ring), danger (red wash as a secondary, solid red in a confirm), text links. Press is a slight scale-down, never an offset shadow.
- **Fields:** filled rounded rectangles; focus turns the field white with an accent border and a 3px accent halo. Labels sit above in 13px, sentence case. Inline edit rows (contact and card editor) are borderless inside a white card, with an accent underline on focus.
- **Pickers:** never the native `<select>`: a pill trigger (or a field-shaped one) that opens the app's own option sheet (`Picker`). Dates are a pill chip over an invisible native date input (`DateChip`).
- **Confirm and prompt:** never `window.confirm`/`prompt`: a bottom sheet with a title, one line of detail, and Cancel beside the action (solid red when destructive) (`Dialog`).
- **Checkbox and switch:** a 22px rounded square check (`Check`) and a 48x28 pill switch with a round knob.
- **Lists:** people are white rows with the card photo as a 68x42 thumbnail, the name at 16px semibold, company and title muted, a star at the end. Settings are titled groups of ruled rows inside one white card (`SettingGroup`, `SettingRow`, `SwitchRow`), value and chevron on the right.
- **Tab bar:** five tabs, icon over an 11px label; the active tab's icon sits in a soft accent pill.
- **Sheets:** white, 24px top corners, a grey handle, a 17px title, rows of 54px.

## Do's and Don'ts

- Do use the app's own `Picker`, `DateChip`, `Check`, `Dialog` and `SettingRow` instead of any browser control.
- Do keep one primary (accent-filled) action per screen; everything else tonal, outline or text.
- Do keep sentence case on buttons, tabs and chips.
- Don't bring back uppercase condensed labels, square corners on controls, underlined grey fields, or hard offset shadows.
- Don't introduce a second accent colour; state colours (red, amber, green) carry meaning only.
- Don't add decorative textures, spines or skeuomorphic album details.
