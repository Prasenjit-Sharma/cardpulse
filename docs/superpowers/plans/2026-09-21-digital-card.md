# Digital Card (Phase 2a) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A user creates up to five digital business cards on their phone, shows a scannable vCard QR (or a full-screen stall QR), and shares a card as a contact file or an image, offline and free.

**Architecture:** Pure logic (model, vCard text with a byte budget, QR matrix, template layout) lives in `src/lib` and is unit tested in Node. One canvas function draws a layout, so preview, export and stall header cannot drift. React components (`MyCards`, `CardEditor`, `CardShare`, `StallMode`) sit on top, behind a new fifth tab. Cards persist in their own IndexedDB database and travel inside the existing backup zip.

**Tech Stack:** React 19, TypeScript, Vite, idb-keyval, Node's built-in test runner, `qrcode-generator` (new, MIT, the only new dependency).

**Spec:** `docs/superpowers/specs/2026-09-21-digital-card-design.md`

## Global Constraints

- Two fonts only: Archivo and Inter (both already bundled). Five templates: `ledger` (default), `header`, `split`, `noir`, `bold`.
- Accents come from `ACCENTS` in `src/lib/accents.ts`; a new card starts on the app's current accent (Graphite by default).
- At most 5 cards; at most 3 phones and 3 emails per card. New cards start blank; no own-details entry in Settings.
- QR encodes a vCard 3.0, error correction M, quiet zone 4 modules, dark modules on a white plate in every template. vCard target under 600 bytes; drop order when over budget: social, address, extra emails, extra phones (keep the first of each).
- Photo: resized to 512 px long side, JPEG. Cards live in IndexedDB database `cardpulse-mycards` (not the existing `cardpulse` database).
- Every control at least 48 px, labelled. Reduced motion respected. Everything free; no locked options.
- Node tests import with explicit `.ts` extensions inside `src/lib`. Colours use the `--brand` tokens; no hard-coded accent.
- Tests: `npm test` must stay green; new test files are added to the `test` script in `package.json`.

## Review Focus

1. A very long name, company or address (and a Hindi or other non-Latin name): text must shrink then truncate, never overlap the QR plate or leave the card. Pinned in Task 3.
2. A card with no phone and no email: QR still carries name and company; the editor warns. Pinned in Tasks 2 and 5.
3. Special characters in fields (comma, semicolon, backslash, newline, `:` in an address) must be escaped in the vCard so a phone parses it correctly. Pinned in Task 2.
4. A photo that cannot be decoded (HEIC, corrupt) must not break saving; the card falls back to a monogram. Pinned in Task 5.
5. Restoring a backup containing card ids that already exist, or a card open in the editor being deleted, must not duplicate or crash. Pinned in Tasks 1 and 4.

---

### Task 1: Card model, storage and backup entries

**Files:**
- Create: `src/lib/mycards.ts`
- Test: `test/mycards.test.mjs`
- Modify: `src/lib/backup.ts` (Task 7 wires it in; this task only produces the pure helpers)

**Interfaces:**
- Produces:
  - `type TemplateId = 'ledger'|'header'|'split'|'noir'|'bold'`, `type FontId = 'archivo'|'inter'`
  - `interface MyCard { id: string; createdAt: number; updatedAt: number; label: string; name: string; title: string; company: string; phones: string[]; emails: string[]; website: string; address: string; social: string[]; photo?: Blob; template: TemplateId; accent: string; font: FontId }`
  - `const MAX_CARDS = 5`, `const MAX_LIST = 3`
  - `emptyCard(accent?: string, now?: number): MyCard`
  - `sanitizeCard(c: MyCard): MyCard` (trims, drops blanks, caps lists, unknown template/font/accent fall back to defaults)
  - `initials(name: string): string` (up to two letters, `?` when empty)
  - `cardsToEntries(cards: MyCard[]): { json: unknown[]; files: { name: string; blob: Blob }[] }`
  - `cardsFromEntries(json: unknown[], read: (name: string) => Blob | undefined): MyCard[]`
  - `planCardRestore(existingIds: Iterable<string>, incoming: MyCard[]): { add: MyCard[]; skipped: number }`
  - Storage (browser only, untested): `listMyCards(): Promise<MyCard[]>`, `putMyCard(c)`, `deleteMyCard(id)`

- [ ] **Step 1: Write the failing test**

```js
// test/mycards.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { MAX_CARDS, MAX_LIST, cardsFromEntries, cardsToEntries, emptyCard, initials, planCardRestore, sanitizeCard } from '../src/lib/mycards.ts'

test('a new card is blank, on the given accent, with the default template and font', () => {
  const c = emptyCard('navy', 5)
  assert.equal(c.name, ''); assert.equal(c.accent, 'navy'); assert.equal(c.template, 'ledger'); assert.equal(c.font, 'archivo')
  assert.equal(c.createdAt, 5); assert.equal(emptyCard().accent, 'graphite')
})
test('sanitizing trims, drops blanks, caps lists and repairs unknown choices', () => {
  const c = sanitizeCard({ ...emptyCard(), name: '  Asha  ', phones: [' 1 ', '', '2', '3', '4'], emails: ['a@b.co'], template: 'zzz', font: 'papyrus', accent: 'nope' })
  assert.equal(c.name, 'Asha'); assert.deepEqual(c.phones, ['1', '2', '3']); assert.equal(c.phones.length, MAX_LIST)
  assert.equal(c.template, 'ledger'); assert.equal(c.font, 'archivo'); assert.equal(c.accent, 'graphite')
})
test('initials are up to two letters, and a question mark for nothing', () => {
  assert.equal(initials('Rajesh Shah'), 'RS'); assert.equal(initials('  madonna '), 'M'); assert.equal(initials(''), '?')
  assert.equal(initials('प्रसेनजीत शर्मा'), 'प्श')
})
test('cards round-trip through backup entries with their photos', () => {
  const photo = new Blob([new Uint8Array(40)], { type: 'image/jpeg' })
  const cards = [{ ...emptyCard(), id: 'a', name: 'A', photo }, { ...emptyCard(), id: 'b', name: 'B' }]
  const { json, files } = cardsToEntries(cards)
  assert.equal(files.length, 1); assert.match(files[0].name, /^mycards\/a-photo\.jpg$/)
  const back = cardsFromEntries(json, (n) => files.find((f) => f.name === n)?.blob)
  assert.equal(back.length, 2); assert.equal(back[0].photo.size, 40); assert.equal(back[1].photo, undefined)
  assert.equal(JSON.stringify(json).includes('photo"'), false)
})
test('restoring never duplicates an id already on the phone', () => {
  const plan = planCardRestore(['a'], [{ ...emptyCard(), id: 'a' }, { ...emptyCard(), id: 'b' }])
  assert.deepEqual(plan.add.map((c) => c.id), ['b']); assert.equal(plan.skipped, 1)
})
test('the limit is five', () => assert.equal(MAX_CARDS, 5))
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/mycards.test.mjs` — Expected: FAIL, cannot find module `mycards.ts`.

- [ ] **Step 3: Implement**

```ts
// src/lib/mycards.ts
import { createStore, del, entries, set } from 'idb-keyval'
import { ACCENTS, DEFAULT_ACCENT } from './accents.ts'

export type TemplateId = 'ledger' | 'header' | 'split' | 'noir' | 'bold'
export type FontId = 'archivo' | 'inter'
export const TEMPLATES: TemplateId[] = ['ledger', 'header', 'split', 'noir', 'bold']
export const FONTS: FontId[] = ['archivo', 'inter']
export const MAX_CARDS = 5
export const MAX_LIST = 3

export interface MyCard {
  id: string; createdAt: number; updatedAt: number
  label: string
  name: string; title: string; company: string
  phones: string[]; emails: string[]
  website: string; address: string; social: string[]
  photo?: Blob
  template: TemplateId; accent: string; font: FontId
}

export const emptyCard = (accent: string = DEFAULT_ACCENT, now = Date.now()): MyCard => ({
  id: typeof crypto !== 'undefined' && crypto.randomUUID ? crypto.randomUUID() : String(now),
  createdAt: now, updatedAt: now, label: '', name: '', title: '', company: '', phones: [], emails: [], website: '', address: '', social: [],
  template: 'ledger', accent, font: 'archivo',
})

const list = (xs: string[]) => xs.map((x) => x.trim()).filter(Boolean).slice(0, MAX_LIST)

export function sanitizeCard(c: MyCard): MyCard {
  return {
    ...c,
    label: c.label.trim(), name: c.name.trim(), title: c.title.trim(), company: c.company.trim(),
    website: c.website.trim(), address: c.address.trim(),
    phones: list(c.phones), emails: list(c.emails), social: list(c.social),
    template: TEMPLATES.includes(c.template) ? c.template : 'ledger',
    font: FONTS.includes(c.font) ? c.font : 'archivo',
    accent: ACCENTS.some((a) => a.id === c.accent) ? c.accent : DEFAULT_ACCENT,
  }
}

export function initials(name: string): string {
  const words = name.trim().split(/\s+/).filter(Boolean).slice(0, 2)
  return words.length ? words.map((w) => [...w][0]!.toUpperCase()).join('') : '?'
}

export function cardsToEntries(cards: MyCard[]): { json: unknown[]; files: { name: string; blob: Blob }[] } {
  const files: { name: string; blob: Blob }[] = []
  const json = cards.map((c) => {
    const { photo, ...rest } = c
    if (!photo) return rest
    const file = `mycards/${c.id}-photo.jpg`
    files.push({ name: file, blob: photo })
    return { ...rest, photoFile: file }
  })
  return { json, files }
}

export function cardsFromEntries(json: unknown[], read: (name: string) => Blob | undefined): MyCard[] {
  return json.map((raw) => {
    const { photoFile, ...rest } = raw as MyCard & { photoFile?: string }
    const photo = photoFile ? read(photoFile) : undefined
    return sanitizeCard({ ...rest, ...(photo ? { photo } : {}) })
  })
}

export function planCardRestore(existingIds: Iterable<string>, incoming: MyCard[]): { add: MyCard[]; skipped: number } {
  const have = new Set(existingIds)
  const add = incoming.filter((c) => !have.has(c.id))
  return { add, skipped: incoming.length - add.length }
}

// Cards live in their own database: idb-keyval cannot add an object store to the existing `cardpulse` database.
const store = createStore('cardpulse-mycards', 'cards')
export async function listMyCards(): Promise<MyCard[]> {
  return (await entries<string, MyCard>(store)).map(([, v]) => v).sort((a, b) => a.createdAt - b.createdAt)
}
export const putMyCard = (c: MyCard) => set(c.id, { ...c, updatedAt: Date.now() }, store)
export const deleteMyCard = (id: string) => del(id, store)
```

- [ ] **Step 4: Register the test and run it**

Add `test/mycards.test.mjs` to the `test` script in `package.json`. Run: `node --test test/mycards.test.mjs` — Expected: 6 pass. (Node can import `idb-keyval` without touching IndexedDB until a storage function is called.)

- [ ] **Step 5: Commit**

```bash
git add src/lib/mycards.ts test/mycards.test.mjs package.json
git commit -m "Digital card: model, sanitising, storage and backup helpers"
```

---

### Task 2: vCard text with a byte budget, and the QR matrix

**Files:**
- Create: `src/lib/cardvcf.ts`, `src/lib/qr.ts`
- Test: `test/cardvcf.test.mjs`
- Modify: `package.json` (add dependency)

**Interfaces:**
- Consumes: `MyCard` from `src/lib/mycards.ts`.
- Produces:
  - `buildCardVcf(card: MyCard, maxBytes?: number): { text: string; dropped: ('social'|'address'|'emails'|'phones')[] }` (default `maxBytes = 600`)
  - `qrMatrix(text: string): boolean[][]` (square, error correction M; the quiet zone is added by the drawing code, not here)
  - `reachable(card: MyCard): boolean` (has at least one phone or email)

- [ ] **Step 1: Install the dependency**

Run: `npm install qrcode-generator` and `npm install -D @types/qrcode-generator` if types are absent (the package ships its own types; skip the second if so).

- [ ] **Step 2: Write the failing test**

```js
// test/cardvcf.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { buildCardVcf, reachable } from '../src/lib/cardvcf.ts'
import { qrMatrix } from '../src/lib/qr.ts'
import { emptyCard } from '../src/lib/mycards.ts'

const card = (o = {}) => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'General Manager', company: 'ABC Polymers', phones: ['+91 98240 22893'], emails: ['r@abc.com'], website: 'abc.com', address: 'GIDC Vatva, Ahmedabad 382445', ...o })

test('a vCard 3.0 carries name, organisation, title, phone, email, url and address', () => {
  const { text, dropped } = buildCardVcf(card())
  for (const l of ['BEGIN:VCARD', 'VERSION:3.0', 'FN:Rajesh Shah', 'N:Shah;Rajesh;;;', 'ORG:ABC Polymers', 'TITLE:General Manager', 'TEL;TYPE=CELL:+919824022893', 'EMAIL;TYPE=WORK:r@abc.com', 'URL:abc.com', 'END:VCARD']) assert.ok(text.split('\r\n').includes(l), l)
  assert.ok(text.includes('ADR;TYPE=WORK:;;GIDC Vatva\\, Ahmedabad 382445;;;;')); assert.deepEqual(dropped, [])
})
test('commas, semicolons, backslashes and newlines in fields are escaped', () => {
  const { text } = buildCardVcf(card({ company: 'A;B, C\\D', address: 'line1\nline2: near, market' }))
  assert.ok(text.includes('ORG:A\\;B\\, C\\\\D')); assert.ok(text.includes('line1\\nline2: near\\, market'))
  assert.equal(text.split('\r\n').every((l) => !l.includes('\n')), true)
})
test('over budget, optional parts drop in a fixed order and are reported', () => {
  const big = card({ social: ['linkedin.com/in/' + 'x'.repeat(200)], address: 'a'.repeat(300), emails: ['a@b.co', 'c@d.co', 'e@f.co'], phones: ['1111111111', '2222222222', '3333333333'] })
  const r = buildCardVcf(big, 350)
  assert.ok(new TextEncoder().encode(r.text).length <= 350)
  assert.deepEqual(r.dropped.slice(0, 2), ['social', 'address'])
  assert.ok(r.text.includes('EMAIL;TYPE=WORK:a@b.co'), 'the first email is always kept')
})
test('a card with only a name still produces a valid vCard, and is reported unreachable', () => {
  const c = card({ phones: [], emails: [], website: '', address: '', title: '', company: '' })
  assert.ok(buildCardVcf(c).text.includes('FN:Rajesh Shah')); assert.equal(reachable(c), false); assert.equal(reachable(card()), true)
})
test('a Hindi name survives and counts in bytes, not characters', () => {
  const { text } = buildCardVcf(card({ name: 'प्रसेनजीत शर्मा' }))
  assert.ok(text.includes('FN:प्रसेनजीत शर्मा'))
})
test('the QR is a square matrix with the three finder patterns', () => {
  const m = qrMatrix(buildCardVcf(card()).text)
  const n = m.length
  assert.ok(n >= 21 && m.every((r) => r.length === n))
  for (const [x, y] of [[0, 0], [n - 7, 0], [0, n - 7]]) { assert.ok(m[y][x] && m[y][x + 6] && m[y + 6][x] && m[y + 6][x + 6]); assert.ok(m[y + 3][x + 3]) }
})
```

- [ ] **Step 3: Run it and see it fail** — `node --test test/cardvcf.test.mjs` — Expected: FAIL, modules not found.

- [ ] **Step 4: Implement**

```ts
// src/lib/cardvcf.ts
import type { MyCard } from './mycards.ts'

export type Dropped = 'social' | 'address' | 'emails' | 'phones'
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\\;').replace(/,/g, '\\,')
const bytes = (s: string) => new TextEncoder().encode(s).length

export const reachable = (c: MyCard) => c.phones.length > 0 || c.emails.length > 0

function lines(c: MyCard, keep: { social: boolean; address: boolean; emails: number; phones: number }): string[] {
  const parts = c.name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  const out = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(parts.join(' '))};;;`, `FN:${esc(c.name)}`]
  if (c.company) out.push(`ORG:${esc(c.company)}`)
  if (c.title) out.push(`TITLE:${esc(c.title)}`)
  for (const p of c.phones.slice(0, keep.phones)) out.push(`TEL;TYPE=CELL:${p.replace(/[^\d+]/g, '')}`)
  for (const e of c.emails.slice(0, keep.emails)) out.push(`EMAIL;TYPE=WORK:${e}`)
  if (c.website) out.push(`URL:${c.website}`)
  if (keep.address && c.address) out.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`)
  if (keep.social) for (const s of c.social) out.push(`X-SOCIALPROFILE:${s}`)
  out.push('END:VCARD')
  return out
}

/** The text the QR carries. Kept small so it scans fast: optional parts are dropped, in a fixed order, until it fits. */
export function buildCardVcf(c: MyCard, maxBytes = 600): { text: string; dropped: Dropped[] } {
  const keep = { social: true, address: true, emails: 3, phones: 3 }
  const dropped: Dropped[] = []
  const text = () => lines(c, keep).join('\r\n')
  const steps: [Dropped, () => boolean][] = [
    ['social', () => { if (!keep.social || !c.social.length) return false; keep.social = false; return true }],
    ['address', () => { if (!keep.address || !c.address) return false; keep.address = false; return true }],
    ['emails', () => { if (keep.emails <= 1 || c.emails.length <= 1) return false; keep.emails = 1; return true }],
    ['phones', () => { if (keep.phones <= 1 || c.phones.length <= 1) return false; keep.phones = 1; return true }],
  ]
  for (const [name, drop] of steps) {
    if (bytes(text()) <= maxBytes) break
    if (drop()) dropped.push(name)
  }
  return { text: text(), dropped }
}
```

```ts
// src/lib/qr.ts
import qrcode from 'qrcode-generator'

/** A QR code as a square grid of dark (true) and light (false) modules, error correction M. The caller draws the quiet zone. */
export function qrMatrix(text: string): boolean[][] {
  const qr = qrcode(0, 'M')
  qr.addData(text, 'Byte')
  qr.make()
  const n = qr.getModuleCount()
  return Array.from({ length: n }, (_, y) => Array.from({ length: n }, (_, x) => qr.isDark(y, x)))
}
```

- [ ] **Step 5: Register the test and run it** — add `test/cardvcf.test.mjs` to `package.json`; run `node --test test/cardvcf.test.mjs` — Expected: 6 pass. If the Hindi-name QR fails on encoding, pass the text as UTF-8 by calling `qr.addData(unescape(encodeURIComponent(text)), 'Byte')` and add that to the test.

- [ ] **Step 6: Commit**

```bash
git add src/lib/cardvcf.ts src/lib/qr.ts test/cardvcf.test.mjs package.json package-lock.json
git commit -m "Digital card: vCard builder with a byte budget, and QR matrix"
```

---

### Task 3: Template layouts and the canvas renderer

**Files:**
- Create: `src/lib/cardlayout.ts` (pure layout, five templates), `src/lib/drawcard.ts` (canvas renderer)
- Test: `test/cardlayout.test.mjs`

**Interfaces:**
- Consumes: `MyCard`, `initials` from `mycards.ts`; `accentById` from `accents.ts`.
- Produces:
  - `const CARD_W = 100`, `const CARD_H = 100 / 1.75` (layout units; a card is 100 wide)
  - `type Measure = (text: string, size: number, weight: number) => number` (width in layout units)
  - `interface Box { x: number; y: number; w: number; h: number }`
  - `type Op = { kind: 'rect'; box: Box; fill: string; radius?: number } | { kind: 'text'; box: Box; text: string; size: number; weight: number; color: string; caps?: boolean; spacing?: number } | { kind: 'qr'; box: Box } | { kind: 'photo'; box: Box } | { kind: 'mono'; box: Box; text: string; fill: string; color: string }`
  - `layoutCard(card: MyCard, measure: Measure, dark: boolean): { ops: Op[]; qrBox: Box; background: string }`
  - `fitText(text: string, maxW: number, size: number, min: number, weight: number, measure: Measure): { text: string; size: number }` (shrinks to `min`, then truncates with an ellipsis)
  - `drawCard(ctx: CanvasRenderingContext2D, card: MyCard, qr: boolean[][], px: number): Promise<void>` where `px` is the canvas width in pixels
  - `cardDescription(card: MyCard): string` for accessibility

- [ ] **Step 1: Write the failing test**

```js
// test/cardlayout.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { CARD_H, CARD_W, fitText, layoutCard } from '../src/lib/cardlayout.ts'
import { TEMPLATES, emptyCard } from '../src/lib/mycards.ts'

const measure = (t, size) => [...t].length * size * 0.56           // a rough width model: enough to test fitting
const base = () => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'General Manager', company: 'ABC Polymers Pvt. Ltd.', phones: ['+91 98240 22893'], emails: ['rajesh@abcpolymers.com'], website: 'abcpolymers.com' })
const inside = (b) => b.x >= -0.01 && b.y >= -0.01 && b.x + b.w <= CARD_W + 0.01 && b.y + b.h <= CARD_H + 0.01
const overlap = (a, b) => a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h

test('fitText shrinks first, then truncates with an ellipsis', () => {
  assert.deepEqual(fitText('Asha', 50, 8, 4, 700, measure), { text: 'Asha', size: 8 })
  const s = fitText('A very long name indeed for a card', 40, 8, 4, 700, measure)
  assert.ok(s.size >= 4 && s.size < 8 || s.text.endsWith('…'))
  assert.ok(measure(s.text, s.size) <= 40)
  const t = fitText('x'.repeat(200), 40, 8, 4, 700, measure)
  assert.equal(t.size, 4); assert.ok(t.text.endsWith('…')); assert.ok(measure(t.text, t.size) <= 40)
})
for (const template of TEMPLATES) {
  for (const [label, o] of [['normal', {}], ['very long text', { name: 'Dr. Balasubramaniam Venkataraghavan Iyer-Subramanyam', title: 'Senior Vice President, Strategic Procurement and Supply Chain', company: 'Hindustan Petroleum Corporation Limited (A Government of India Enterprise)', emails: ['balasubramaniam.venkataraghavan@hindustanpetroleum.example.com'] }], ['hindi', { name: 'प्रसेनजीत शर्मा', company: 'हिन्दुस्तान पेट्रोलियम कॉर्पोरेशन लिमिटेड' }], ['name only', { phones: [], emails: [], website: '', title: '', company: '' }]]) {
    test(`${template} (${label}): everything is inside the card and nothing touches the QR plate`, () => {
      const { ops, qrBox } = layoutCard({ ...base(), ...o, template }, measure, false)
      assert.ok(inside(qrBox), 'qr inside'); assert.ok(qrBox.w >= 17 && Math.abs(qrBox.w - qrBox.h) < 0.01, 'qr is square and big enough to scan')
      for (const op of ops) {
        if (op.kind === 'qr') continue
        assert.ok(inside(op.box), `${op.kind} inside the card`)
        if (op.kind === 'text' && op.text.trim()) assert.equal(overlap(op.box, qrBox), false, `text "${op.text.slice(0, 20)}" clear of the QR`)
      }
    })
  }
}
test('the layout is deterministic and uses the card accent', () => {
  const a = layoutCard({ ...base(), template: 'header', accent: 'navy' }, measure, false)
  assert.deepEqual(a, layoutCard({ ...base(), template: 'header', accent: 'navy' }, measure, false))
  assert.ok(a.ops.some((op) => op.kind === 'rect' && op.fill === '#1C3F73'))
})
test('noir uses the light twin of the accent on its dark ground', () => {
  const n = layoutCard({ ...base(), template: 'noir', accent: 'navy' }, measure, false)
  assert.ok(n.ops.some((op) => op.kind === 'text' && op.color === '#8AAEEA')); assert.equal(n.background, '#15181C')
})
```

- [ ] **Step 2: Run it and see it fail** — `node --test test/cardlayout.test.mjs` — Expected: FAIL, module missing.

- [ ] **Step 3: Implement `cardlayout.ts`**

Write `src/lib/cardlayout.ts` implementing the interface above. Rules the code must follow (they are what the tests check and what the preview page showed):

```ts
// src/lib/cardlayout.ts (structure; each template is one function returning Op[])
import { accentById } from './accents.ts'
import { initials, type MyCard, type TemplateId } from './mycards.ts'

export const CARD_W = 100
export const CARD_H = 100 / 1.75
export type Measure = (text: string, size: number, weight: number) => number
export interface Box { x: number; y: number; w: number; h: number }
export type Op =
  | { kind: 'rect'; box: Box; fill: string; radius?: number }
  | { kind: 'text'; box: Box; text: string; size: number; weight: number; color: string; caps?: boolean; spacing?: number }
  | { kind: 'qr'; box: Box }
  | { kind: 'photo'; box: Box }
  | { kind: 'mono'; box: Box; text: string; fill: string; color: string }

const PAPER = '#FBFAF7', INK = '#16191D', MUTED = '#4E545C', NOIR = '#15181C'
const QR = 19                                                   // the QR plate is 19 units square on every template

export function fitText(text: string, maxW: number, size: number, min: number, weight: number, measure: Measure) {
  let s = size
  while (s > min && measure(text, s, weight) > maxW) s = Math.max(min, s - 0.25)
  if (measure(text, s, weight) <= maxW) return { text, size: s }
  const chars = [...text]
  while (chars.length > 1 && measure(chars.join('') + '…', s, weight) > maxW) chars.pop()
  return { text: chars.join('') + '…', size: s }
}

/** A text op whose box is exactly the measured, fitted text, so overlap tests are honest. */
function txt(text: string, x: number, y: number, maxW: number, size: number, min: number, weight: number, color: string, measure: Measure, extra: { caps?: boolean; spacing?: number } = {}): Op {
  const f = fitText(extra.caps ? text.toUpperCase() : text, maxW, size, min, weight, measure)
  return { kind: 'text', box: { x, y, w: Math.min(maxW, measure(f.text, f.size, weight)), h: f.size * 1.2 }, text: f.text, size: f.size, weight, color, ...extra }
}
```

Then implement one function per template (`ledger`, `header`, `split`, `noir`, `bold`) that returns `{ ops, qrBox, background }`, placing text so that its `maxW` never reaches the QR plate (compute each text's `maxW` as the distance from its left edge to the QR box's left edge minus 3 units when the text's y-range meets the QR's y-range; otherwise the full inner width). Geometry to reproduce from the approved preview page `docs/superpowers/plans/assets/card-options.html` (units of card width): Ledger — company caps in accent top-left, monogram or photo circle 9.4 wide top-right, name 7 at y=14, title 3.3 muted, contact rows at the bottom-left with hairlines, QR bottom-right at (100-5-19, CARD_H-4.6-19). Header — accent block 39% high with name and title in white, company caps in accent below, contacts, QR bottom-right. Split — accent panel 37% wide holding monogram/photo (11 wide, top) and QR (20.5 wide, bottom, on a white plate), text on the right. Noir — `NOIR` background, name `#F6F7F8`, title/company/rule in `accentById(card.accent).lite`, contacts `#C9CDD2`, QR bottom-right. Bold — accent background, name 10.4 weight 800 caps at max 66% width, contacts bottom-left, QR top-right. Colours for accent surfaces come from `accentById(card.accent).hex`; text on accent is `#FFFFFF`. The QR box for split is 20.5 (tests require ≥ 17 and square). Export `layoutCard(card, measure, dark)` dispatching on `card.template`.

Include the `cardDescription`:

```ts
export function cardDescription(c: MyCard): string {
  return [c.name || 'Unnamed', c.title, c.company, c.phones[0], c.emails[0]].filter(Boolean).join(', ')
}
```

- [ ] **Step 4: Iterate until the tests pass** — `node --test test/cardlayout.test.mjs` — Expected: all pass (4 layouts × 5 templates plus 3). If a template overlaps the QR in "very long text", reduce its text `maxW`, not the QR size.

- [ ] **Step 5: Implement `drawcard.ts`** (browser only; no Node test, covered by Task 6's manual check)

```ts
// src/lib/drawcard.ts
import { CARD_H, CARD_W, layoutCard, type Op } from './cardlayout'
import type { MyCard } from './mycards'

const FAMILY = { archivo: "'Archivo Variable', Archivo, system-ui, sans-serif", inter: "'Inter Variable', Inter, system-ui, sans-serif" }

async function ready(font: MyCard['font']) {
  try { await Promise.all([400, 600, 700, 800].map((w) => document.fonts.load(`${w} 16px ${FAMILY[font]}`))) } catch { /* draw with the fallback */ }
}

/** Draws the card, `px` pixels wide. The single renderer behind the preview, the image export and the stall screen. */
export async function drawCard(ctx: CanvasRenderingContext2D, card: MyCard, qr: boolean[][], px: number): Promise<void> {
  await ready(card.font)
  const k = px / CARD_W
  const font = (size: number, weight: number) => `${weight} ${size * k}px ${FAMILY[card.font]}`
  const measure = (t: string, size: number, weight: number) => { ctx.font = font(size, weight); return ctx.measureText(t).width / k }
  const { ops, qrBox, background } = layoutCard(card, measure, false)
  ctx.save(); ctx.clearRect(0, 0, px, CARD_H * k)
  ctx.fillStyle = background; ctx.fillRect(0, 0, px, CARD_H * k)
  const photo = card.photo ? await createImageBitmap(card.photo).catch(() => undefined) : undefined
  for (const op of ops) paint(ctx, op, k, font, qr, qrBox, photo)
  ctx.restore(); photo?.close()
}

function paint(ctx: CanvasRenderingContext2D, op: Op, k: number, font: (s: number, w: number) => string, qr: boolean[][], qrBox: { x: number; y: number; w: number; h: number }, photo?: ImageBitmap) {
  const b = op.box
  if (op.kind === 'rect') { ctx.fillStyle = op.fill; ctx.beginPath(); ctx.roundRect(b.x * k, b.y * k, b.w * k, b.h * k, (op.radius ?? 0) * k); ctx.fill() }
  else if (op.kind === 'text') { ctx.font = font(op.size, op.weight); ctx.fillStyle = op.color; ctx.textBaseline = 'top'; ctx.letterSpacing = `${(op.spacing ?? 0) * op.size * k}px`; ctx.fillText(op.text, b.x * k, b.y * k) }
  else if (op.kind === 'mono') { ctx.fillStyle = op.fill; ctx.beginPath(); ctx.arc((b.x + b.w / 2) * k, (b.y + b.h / 2) * k, (b.w / 2) * k, 0, Math.PI * 2); ctx.fill(); ctx.fillStyle = op.color; ctx.font = font(b.w * 0.38, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(op.text, (b.x + b.w / 2) * k, (b.y + b.h / 2) * k); ctx.textAlign = 'left' }
  else if (op.kind === 'photo' && photo) { ctx.save(); ctx.beginPath(); ctx.arc((b.x + b.w / 2) * k, (b.y + b.h / 2) * k, (b.w / 2) * k, 0, Math.PI * 2); ctx.clip(); const s = Math.max(b.w * k / photo.width, b.h * k / photo.height); ctx.drawImage(photo, (b.x + b.w / 2) * k - (photo.width * s) / 2, (b.y + b.h / 2) * k - (photo.height * s) / 2, photo.width * s, photo.height * s); ctx.restore() }
  else if (op.kind === 'qr') {
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(qrBox.x * k, qrBox.y * k, qrBox.w * k, qrBox.h * k, 1.4 * k); ctx.fill()
    const q = 4, n = qr.length, cell = (qrBox.w * k) / (n + 2 * q)                       // quiet zone: four modules
    ctx.fillStyle = '#16191D'
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr[y]![x]) ctx.fillRect(qrBox.x * k + (x + q) * cell, qrBox.y * k + (y + q) * cell, Math.ceil(cell), Math.ceil(cell))
  }
}
```

The layout code must emit a `photo` op when `card.photo` exists (else a `mono` op) and exactly one `qr` op whose box is `qrBox`.

- [ ] **Step 6: Typecheck and commit**

Run: `npx tsc --noEmit -p .` — Expected: no errors. Register `test/cardlayout.test.mjs` in `package.json`, run `npm test`.

```bash
git add src/lib/cardlayout.ts src/lib/drawcard.ts test/cardlayout.test.mjs package.json
git commit -m "Digital card: five template layouts and the canvas renderer"
```

---

### Task 4: My Card tab, carousel and empty state

**Files:**
- Create: `src/components/MyCards.tsx`, `src/components/CardCanvas.tsx`
- Modify: `src/App.tsx` (tab, nav, state), `src/components/Icon.tsx` (a `card` icon), `src/styles.css`

**Interfaces:**
- Consumes: `MyCard`, `listMyCards`, `putMyCard`, `deleteMyCard`, `emptyCard`, `MAX_CARDS` (Task 1); `drawCard` (Task 3); `qrMatrix`, `buildCardVcf` (Task 2).
- Produces:
  - `<CardCanvas card={MyCard} width?: number className?: string />` (draws on a canvas at device pixel ratio; `role="img"` with `aria-label={cardDescription(card)}`)
  - `<MyCards cards onAdd onEdit onShare onStall />` where `onAdd(): void`, `onEdit(id: string)`, `onShare(id: string)`, `onStall(id: string)`.
  - App state: `myCards: MyCard[]`, refreshed by `refreshMyCards()`; tab id `'mycard'`.

- [ ] **Step 1: Add the tab.** In `src/App.tsx`: extend `Tab` and `TABS` with `'mycard'`; add `<NavBtn id="mycard" label="My Card" icon="card" .../>` between Contacts and Events; extend `NavBtn`'s `icon` union with `'card'`; add `'card': 'M3 6h18v12H3z M7 10h6 M7 14h4 M16 10h1'` to `Icon.tsx`.

- [ ] **Step 2: `CardCanvas`**

```tsx
// src/components/CardCanvas.tsx
import { useEffect, useRef } from 'react'
import { buildCardVcf } from '../lib/cardvcf'
import { cardDescription } from '../lib/cardlayout'
import { drawCard } from '../lib/drawcard'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'

/** The one place a card is painted on screen. Redraws when the card changes; never blocks typing. */
export default function CardCanvas({ card, className }: { card: MyCard; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 700
    el.width = px; el.height = Math.round(px / 1.75)
    const t = setTimeout(() => { const ctx = el.getContext('2d'); if (ctx && live) void drawCard(ctx, card, qrMatrix(buildCardVcf(card).text), px) }, 60)
    return () => { live = false; clearTimeout(t) }
  }, [card])
  return <canvas ref={ref} className={className ?? 'card-canvas'} role="img" aria-label={cardDescription(card)} />
}
```

- [ ] **Step 3: `MyCards` screen** — a header "My Card", then either the empty state (heading "Your digital card", one line "A card you can show or send in a second. It works with no signal.", a primary button "Make my card") or a horizontally scrolling scroll-snap carousel of `CardCanvas` items (each in a `<div role="group" aria-label="Card 1 of 3, Work">`), a dot row (reuse `.dots-row`), and beneath the visible card two buttons: **Edit** and **Share**, plus an **Add a card** tile after the last card when `cards.length < MAX_CARDS`. Track the visible index from `scrollLeft / clientWidth` exactly as `ContactDetail` does for its photo carousel. CSS: `.card-canvas { width: 100%; aspect-ratio: 1.75; display: block; border-radius: 6px; box-shadow: var(--seat-deep) }`, `.mycards-track { display: flex; gap: 14px; overflow-x: auto; scroll-snap-type: x mandatory; scrollbar-width: none }`, `.mycards-item { flex: 0 0 100%; scroll-snap-align: center }`, and a `prefers-reduced-motion` rule setting `scroll-behavior: auto`.

- [ ] **Step 4: Wire state in `App.tsx`.** Add `const [myCards, setMyCards] = useState<MyCard[]>([])`, `refreshMyCards = useCallback(async () => setMyCards(await listMyCards()), [])`, call it on mount. Render `<MyCards .../>` when `tab === 'mycard'`. Handlers for now: `onAdd` creates `emptyCard(settings.accent)` saved on the first save in the editor (Task 5); leave `onEdit`, `onShare`, `onStall` as state setters `setEditing(id)`, `setSharing(id)`, `setStall(id)` that Tasks 5 and 6 render. Hide the floating Scan button on this tab (it already shows only on `home` and `contacts`).

- [ ] **Step 5: Handle a deleted-while-open card.** In `App.tsx`, derive `editingCard = myCards.find(c => c.id === editing)`; if `editing` is set but the card no longer exists (deleted elsewhere or after restore), clear `editing` in an effect instead of rendering the editor. Add this to the effect that already reconciles `open`.

- [ ] **Step 6: Verify** — `npx tsc --noEmit -p .` (no errors), `npm test` (green), `npm run build` (no errors), `npx impeccable detect --json src` (only the known camera-guide advisory). Commit.

```bash
git add src && git commit -m "Digital card: My Card tab, carousel and empty state"
```

---

### Task 5: Card editor

**Files:**
- Create: `src/components/CardEditor.tsx`, `src/lib/cardphoto.ts`
- Test: `test/cardphoto.test.mjs` (the pure size helper)
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: Task 1 model and storage; `CardCanvas`; `buildCardVcf`, `reachable` (Task 2); `ACCENTS`; `prepareImage` from `src/lib/image.ts` (signature `prepareImage(file: Blob, maxSide = 1800, quality = 0.88): Promise<Blob>`).
- Produces:
  - `photoTarget(w: number, h: number, maxSide = 512): { w: number; h: number }` (never upscales, keeps aspect)
  - `preparePhoto(file: Blob): Promise<Blob | undefined>` (returns a 512 px JPEG, or `undefined` when the file cannot be decoded)
  - `<CardEditor card: MyCard isNew: boolean onSave(c: MyCard): Promise<void> onDelete(id: string): void onClose(): void />`

- [ ] **Step 1: Failing test for the size helper**

```js
// test/cardphoto.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { photoTarget } from '../src/lib/cardphoto.ts'
test('a large photo shrinks to 512 on its long side, keeping proportions', () => {
  assert.deepEqual(photoTarget(4000, 3000), { w: 512, h: 384 }); assert.deepEqual(photoTarget(3000, 4000), { w: 384, h: 512 })
})
test('a small photo is never enlarged', () => assert.deepEqual(photoTarget(200, 100), { w: 200, h: 100 }))
test('a degenerate size does not divide by zero', () => assert.deepEqual(photoTarget(0, 0), { w: 1, h: 1 }))
```

- [ ] **Step 2: Run it (fails), implement, run (passes)**

```ts
// src/lib/cardphoto.ts
import { decode } from './image.ts'

export function photoTarget(w: number, h: number, maxSide = 512): { w: number; h: number } {
  if (w <= 0 || h <= 0) return { w: 1, h: 1 }
  const k = Math.min(1, maxSide / Math.max(w, h))
  return { w: Math.max(1, Math.round(w * k)), h: Math.max(1, Math.round(h * k)) }
}

/** A 512 px JPEG of the chosen picture, or undefined when the phone cannot decode it (the card then shows a monogram). */
export async function preparePhoto(file: Blob): Promise<Blob | undefined> {
  try {
    const { source, width, height, release } = await decode(file)
    try {
      const t = photoTarget(width, height)
      const c = document.createElement('canvas'); c.width = t.w; c.height = t.h
      c.getContext('2d')!.drawImage(source, 0, 0, t.w, t.h)
      return await new Promise<Blob | undefined>((res) => c.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.86))
    } finally { release() }
  } catch { return undefined }
}
```

Register the test in `package.json`; run `node --test test/cardphoto.test.mjs` (3 pass).

- [ ] **Step 3: The editor screen.** Full-page screen (same shell as `ContactDetail`: `bar-top` with Back and a **Save** button). Top: `<CardCanvas card={draft}>` updating live from a `draft` state. Sections, each a `panel` using the existing `Row` look (`frow`): **Card** (label), **Details** (name, title, company; phones and emails each as up to three inputs with "+ Add"; website; address as a two-row textarea; social links up to three), **Photo** (a button "Add photo or logo" opening a file input, a "Remove" button when set; on a file, call `preparePhoto`; when it returns `undefined`, show an inline message "That picture could not be used. Try a JPEG or PNG." and keep the previous photo), **Design** (template as a five-button radio group with the template name as text, accent as the same eight-swatch radio group used in Settings, font as a two-button radio group "Archivo" / "Inter"). Inputs use `aria-label`s; all inputs are 16 px (`font-size: var(--t-l)`) to avoid iOS zoom. A live hint under Details: when `!reachable(draft)` show "Add a phone or email so people can reach you." (role status); when `buildCardVcf(draft).dropped.length` show "To keep the QR quick to scan, left out: social links, address." naming the dropped parts in plain words. **Delete card** at the bottom (not shown when `isNew`), using `confirm('Delete this card?')`. Save calls `onSave(sanitizeCard({...draft}))`. Back with unsaved changes uses `confirm('Discard changes?')`. Use `useBackClose(true, ...)` so the phone's back button behaves the same way (return `false` from the handler when the user declines to discard).

- [ ] **Step 4: Wire it in `App.tsx`.** `onSave` writes `putMyCard`, calls `refreshMyCards()`, closes the editor and shows the tab. `onDelete` calls `deleteMyCard`, refreshes, closes. Limit: the Add tile and `onAdd` are disabled at `MAX_CARDS`.

- [ ] **Step 5: Verify and commit.** `npx tsc --noEmit -p .`, `npm test`, `npm run build`, detector. Commit:

```bash
git add src test package.json && git commit -m "Digital card: editor with live preview, photo, design choices"
```

---

### Task 6: Share sheet and stall mode

**Files:**
- Create: `src/components/CardShare.tsx`, `src/components/StallMode.tsx`, `src/lib/wakelock.ts`
- Test: `test/cardshare.test.mjs` (pure helpers)
- Modify: `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `buildCardVcf`, `qrMatrix`, `drawCard`, `sanitizeCard`; `download`, `browserEnv`, `shareVcf` from `src/lib/actions.ts`; `Sheet`, `SheetItem` from `src/components/Sheet.tsx`.
- Produces:
  - `cardFileName(card: MyCard, ext: 'vcf' | 'png'): string` (safe, e.g. `Rajesh-Shah-card.vcf`; `card.vcf`... `my-card.png` when the name is empty)
  - `cardAsText(card: MyCard): string` (plain readable text for Copy: name, title, company, phones, emails, website, address, one per line)
  - `useWakeLock(active: boolean): { supported: boolean }` (requests `navigator.wakeLock.request('screen')`, releases on cleanup and on `visibilitychange` re-acquires)
  - `<CardShare card onClose onStall />`, `<StallMode card onClose />`

- [ ] **Step 1: Failing test**

```js
// test/cardshare.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { cardAsText, cardFileName } from '../src/lib/cardshare.ts'
import { emptyCard } from '../src/lib/mycards.ts'
const c = (o = {}) => ({ ...emptyCard(), name: 'Rajesh Shah', title: 'GM', company: 'ABC', phones: ['+91 98240 22893'], emails: ['r@abc.com'], website: 'abc.com', address: 'Vatva, Ahmedabad', ...o })
test('file names are safe and readable', () => {
  assert.equal(cardFileName(c(), 'vcf'), 'Rajesh-Shah-card.vcf')
  assert.equal(cardFileName(c({ name: 'A/B: C?' }), 'png'), 'A-B-C-card.png')
  assert.equal(cardFileName(c({ name: '' }), 'png'), 'my-card.png')
})
test('copied text lists what is on the card, one item a line, skipping empties', () => {
  assert.equal(cardAsText(c()), ['Rajesh Shah', 'GM', 'ABC', '+91 98240 22893', 'r@abc.com', 'abc.com', 'Vatva, Ahmedabad'].join('\n'))
  assert.equal(cardAsText(c({ title: '', website: '' })).includes('\n\n'), false)
})
```

- [ ] **Step 2: Implement the helpers**

```ts
// src/lib/cardshare.ts
import type { MyCard } from './mycards.ts'

export function cardFileName(c: MyCard, ext: 'vcf' | 'png'): string {
  const base = c.name.trim().replace(/[^\p{L}\p{N}]+/gu, '-').replace(/^-+|-+$/g, '')
  return `${base ? base + '-card' : 'my-card'}.${ext}`
}
export const cardAsText = (c: MyCard): string =>
  [c.name, c.title, c.company, ...c.phones, ...c.emails, c.website, c.address].map((x) => x.trim()).filter(Boolean).join('\n')
```

`src/lib/wakelock.ts`:

```ts
import { useEffect, useState } from 'react'

/** Keeps the screen on while `active`. Where the phone does not support it, stall mode still works and the screen may dim. */
export function useWakeLock(active: boolean): { supported: boolean } {
  const [supported] = useState(() => 'wakeLock' in navigator)
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let lock: WakeLockSentinel | undefined, gone = false
    const get = async () => { try { lock = await navigator.wakeLock.request('screen') } catch { /* denied or hidden: nothing to do */ } }
    void get()
    const again = () => { if (document.visibilityState === 'visible' && !gone) void get() }
    document.addEventListener('visibilitychange', again)
    return () => { gone = true; document.removeEventListener('visibilitychange', again); void lock?.release() }
  }, [active])
  return { supported }
}
```

Register `test/cardshare.test.mjs`; run it (2 pass).

- [ ] **Step 3: `CardShare`** — a `Sheet` titled with the card's name, with `SheetItem`s: **Show QR full screen** (calls `onStall`), **Send contact file (.vcf)** (`shareVcf(cardFileName(card,'vcf'), buildCardVcf(card).text, card.name, undefined, browserEnv(), false)`), **Send as image** (draw with `drawCard` into an offscreen canvas 2000 px wide, `toBlob('image/png')`, share as a `File` via `navigator.share({files})` when `navigator.canShare?.({files})`, otherwise download with `cardFileName(card,'png')`), **Copy as text** (`navigator.clipboard.writeText(cardAsText(card))`, then a status line "Copied."). Failures show an inline status message ("Could not share. Try again."); an `AbortError` from the share sheet is silent.

- [ ] **Step 4: `StallMode`** — a portal full-screen page over everything (`position: fixed; inset: 0; background: #FFFFFF; color: #16191D; z-index: 40`). Contents top to bottom: small caps line "Scan to save my contact"; a `<canvas>` QR sized `min(80vw, 62dvh)` (draw with the same matrix and a 4-module quiet zone directly, no template); the name (large) and company; a close button (48 px, `aria-label="Close"`) top-right and `useBackClose(true, onClose)`. Call `useWakeLock(true)`; when `!supported` show a one-line hint "Raise your screen timeout so the code stays on." The QR canvas has `role="img"` and `aria-label={`Contact card QR for ${card.name}`}`.

- [ ] **Step 5: Wire in `App.tsx`** (`sharing`, `stall` state from Task 4). Long-press on a card in the carousel (pointerdown timer of 600 ms) also opens stall mode. Verify and commit:

```bash
npx tsc --noEmit -p . && npm test && npm run build
git add src test package.json && git commit -m "Digital card: share sheet and stall mode"
```

---

### Task 7: Backup integration, finish, deploy

**Files:**
- Modify: `src/lib/backup.ts`, `test/backup.test.mjs`, `src/App.tsx` (restore and backup handlers), `ROADMAP.md`

**Interfaces:**
- Consumes: `cardsToEntries`, `cardsFromEntries`, `planCardRestore`, `listMyCards`, `putMyCard` (Task 1); the existing `buildBackup(cards, events, now)` and `parseBackup(blob)`.
- Produces: `buildBackup(cards, events, now?, myCards?: MyCard[]): Promise<Blob>` and `ParsedBackup.myCards: MyCard[]` (empty array for backups made before this feature).

- [ ] **Step 1: Failing test** — add to `test/backup.test.mjs`:

```js
import { emptyCard } from '../src/lib/mycards.ts'
test('digital cards travel in the backup with their photos, and older backups still restore', async () => {
  const mine = [{ ...emptyCard(), id: 'm1', name: 'Me', photo: jpeg(60) }, { ...emptyCard(), id: 'm2', name: 'Me 2' }]
  const parsed = await parseBackup(await buildBackup([], [], 1_700_000_000_000, mine))
  assert.equal(parsed.myCards.length, 2); assert.equal(parsed.myCards[0].name, 'Me'); assert.equal(parsed.myCards[0].photo.size, 60); assert.equal(parsed.myCards[1].photo, undefined)
  const old = await parseBackup(await buildBackup([], [], 1_700_000_000_000))
  assert.deepEqual(old.myCards, [])
})
```

- [ ] **Step 2: Run it (fails), implement.** In `buildBackup`, add the optional fourth parameter; put `cardsToEntries(myCards)` json into the manifest as `myCards` and push its files into `entries`. In `parseBackup`, read `manifest.myCards ?? []` and rebuild with `cardsFromEntries(json, (name) => byName.get(name) ? new Blob([byName.get(name)!.blob], { type: 'image/jpeg' }) : undefined)`, verifying each file with `readVerified` as photos already are. Return `myCards`.

- [ ] **Step 3: App wiring.** `backupNow` passes `await listMyCards()`. `restoreFrom` calls `planCardRestore((await listMyCards()).map(c => c.id), parsed.myCards)`, writes each with `putMyCard`, refreshes, and its message reads e.g. "Restored 12 cards and 2 digital cards."

- [ ] **Step 4: Full verification.** `npx tsc --noEmit -p .`, `npm test` (all green, run twice to catch flakiness), `npm run build`, `npx impeccable detect --json src`. Then the Impeccable finish review (dispatch `impeccable:impeccable-finish-reviewer` against the My Card screens, editor, share sheet and stall mode; apply its fix batch in one pass).

- [ ] **Step 5: Roadmap, commit, push, deploy check.**

Update `ROADMAP.md` Phase 2a to "built, awaiting real-phone check" and list what to test on real handsets: QR scan by a second phone (Android and iPhone camera apps both offer Add contact), long Hindi names, Bold's condensed capitals on iPhone, share of the PNG through WhatsApp, stall mode staying awake.

```bash
git add -A src test docs ROADMAP.md package.json
git commit -m "Digital card: backup integration and roadmap"
git push
gh run list --limit 1
```

---

## Self-review

**Spec coverage:** model and storage (Task 1); vCard, budget, QR (Task 2); five templates, one renderer, text fit, accessibility description (Task 3); tab, carousel, empty state, five-card limit (Tasks 4, 5); editor including photo, design choices, warnings, delete (Task 5); share sheet with QR, vcf, image, copy (Task 6); stall mode with wake lock and back handling (Task 6); backup and restore (Task 7); testing and Impeccable finish review (Tasks 3, 7). New cards start blank and there is no Settings entry (Task 4 `emptyCard(settings.accent)` only).

**Type consistency:** `MyCard`, `TemplateId`, `FontId`, `MAX_CARDS`, `MAX_LIST`, `emptyCard`, `sanitizeCard`, `initials`, `cardsToEntries`, `cardsFromEntries`, `planCardRestore`, `listMyCards`, `putMyCard`, `deleteMyCard` are defined in Task 1 and used unchanged later. `buildCardVcf` returns `{ text, dropped }` everywhere. `layoutCard` returns `{ ops, qrBox, background }`; `drawCard(ctx, card, qr, px)` is the only renderer.

**Placeholders:** the five template geometries in Task 3 are described from the approved preview page with the exact units and constraints the tests enforce, and the tests are the acceptance check; the implementer reads the approved preview page at `docs/superpowers/plans/assets/card-options.html` (open it in a browser; its CSS holds every size in container-width units) as well as the numbers in Step 3.
