import { accentById } from './accents.ts'
import { initials, type MyCard } from './mycards.ts'

/** A card is laid out in units of its own width (100), so one layout draws at any size. */
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
export interface Layout { ops: Op[]; qrBox: Box; background: string }

const PAPER = '#FBFAF7', INK = '#16191D', MUTED = '#4E545C', NOIR = '#15181C', WHITE = '#FFFFFF'
const M = 6                                                      // side margin
const QR = 19                                                    // the QR plate is this square on every template but Split

/** Shrinks text to fit, down to `min`; if it still does not fit, cuts it and adds an ellipsis. */
export function fitText(text: string, maxW: number, size: number, min: number, weight: number, measure: Measure): { text: string; size: number } {
  let s = size
  while (s > min && measure(text, s, weight) > maxW) s = Math.max(min, s - 0.25)
  if (measure(text, s, weight) <= maxW) return { text, size: s }
  const chars = [...text]
  while (chars.length > 1 && measure(chars.join('') + '…', s, weight) > maxW) chars.pop()
  return { text: chars.join('') + '…', size: s }
}

/** Collects a template's drawing operations. Text is fitted, and kept clear of anything to its right on the same lines. */
class Sheet {
  ops: Op[] = []
  private obstacles: Box[] = []
  private measure: Measure
  private card: MyCard
  constructor(measure: Measure, card: MyCard) { this.measure = measure; this.card = card }
  keepClear(b: Box) { this.obstacles.push(b) }
  rect(box: Box, fill: string, radius?: number) { this.ops.push({ kind: 'rect', box, fill, radius }) }
  /** Text at (x, y). `full` is the widest it may be; obstacles to the right on the same lines narrow that. Returns the box, or undefined for empty text. */
  text(text: string, x: number, y: number, full: number, size: number, min: number, weight: number, color: string, extra: { caps?: boolean; spacing?: number } = {}): Box | undefined {
    if (!text.trim()) return undefined
    const h = size * 1.25
    let maxW = full
    for (const o of this.obstacles) if (y < o.y + o.h + 1 && y + h > o.y - 1 && o.x > x) maxW = Math.min(maxW, o.x - 3 - x)
    const f = fitText(extra.caps ? text.toUpperCase() : text, Math.max(4, maxW), size, min, weight, this.measure)
    const box = { x, y, w: Math.min(maxW, this.measure(f.text, f.size, weight)), h: f.size * 1.25 }
    this.ops.push({ kind: 'text', box, text: f.text, size: f.size, weight, color, ...extra })
    return box
  }
  /** The person's photo if there is one, else their initials. */
  face(box: Box, fill: string, color: string) {
    if (this.card.photo) this.ops.push({ kind: 'photo', box })
    else this.ops.push({ kind: 'mono', box, text: initials(this.card.name), fill, color })
  }
  qr(box: Box) { this.ops.push({ kind: 'qr', box }) }
}

const contactLines = (c: MyCard, n: number) => [c.phones[0], c.emails[0], c.website].filter((x): x is string => !!x).slice(0, n)
const qrBottomRight: Box = { x: CARD_W - 5 - QR, y: CARD_H - 4.6 - QR, w: QR, h: QR }
const qrTopRight: Box = { x: CARD_W - 5 - QR, y: 5, w: QR, h: QR }
const FACE_TR: Box = { x: CARD_W - M - 9.4, y: 5, w: 9.4, h: 9.4 }

function ledger(c: MyCard, m: Measure): Layout {
  const a = accentById(c.accent).hex, s = new Sheet(m, c), qr = qrBottomRight
  s.keepClear(qr); s.keepClear(FACE_TR)
  s.text(c.company, M, 5.4, CARD_W - 2 * M, 2.5, 1.8, 650, a, { caps: true, spacing: 0.14 })
  s.face(FACE_TR, a, WHITE)
  const name = s.text(c.name, M, 15.4, CARD_W - 2 * M, 7, 3.6, 700, INK)
  s.text(c.title, M, (name ? name.y + name.h : 15.4) + 0.6, CARD_W - 2 * M, 3.3, 2.4, 500, MUTED)
  const rows = [['M', c.phones[0]], ['E', c.emails[0]], ['W', c.website]].filter((r): r is [string, string] => !!r[1])
  rows.forEach(([k, v], i) => {
    const y = CARD_H - 4.4 - (rows.length - i) * 6.3
    s.rect({ x: M, y, w: 58, h: 0.15 }, 'rgba(22,25,29,0.16)')
    s.text(k, M, y + 1.3, 3, 2.9, 2.9, 700, a)
    s.text(v, M + 5, y + 1.3, 53, 2.9, 2, 500, INK)
  })
  s.qr(qr)
  return { ops: s.ops, qrBox: qr, background: PAPER }
}

function header(c: MyCard, m: Measure): Layout {
  const a = accentById(c.accent).hex, s = new Sheet(m, c), qr = qrBottomRight, band = CARD_H * 0.39
  s.keepClear(qr); s.keepClear(FACE_TR)
  s.rect({ x: 0, y: 0, w: CARD_W, h: band }, a)
  s.face(FACE_TR, WHITE, a)
  const bottom = band - 4
  const hasTitle = !!c.title
  const titleY = bottom - 3.3 * 1.25
  const nameY = hasTitle ? titleY - 7 * 1.25 - 0.6 : bottom - 7 * 1.25
  s.text(c.name, M, nameY, CARD_W - 2 * M, 7, 3.6, 700, WHITE)
  s.text(c.title, M, titleY, CARD_W - 2 * M, 3.3, 2.4, 500, 'rgba(255,255,255,0.92)')
  s.text(c.company, M, band + 4.4, CARD_W - 2 * M, 2.5, 1.8, 650, a, { caps: true, spacing: 0.14 })
  contactLines(c, 3).forEach((l, i) => s.text(l, M, band + 9.6 + i * 4.65, CARD_W - 2 * M, 3, 2, 500, INK))
  s.qr(qr)
  return { ops: s.ops, qrBox: qr, background: PAPER }
}

function split(c: MyCard, m: Measure): Layout {
  const a = accentById(c.accent).hex, s = new Sheet(m, c)
  const qr: Box = { x: 5.4, y: CARD_H - 5.4 - 20.5, w: 20.5, h: 20.5 }
  s.rect({ x: 0, y: 0, w: 37, h: CARD_H }, a)
  s.face({ x: 5.4, y: 5.4, w: 11, h: 11 }, WHITE, a)
  const x = 43, w = CARD_W - x - 5.6
  s.text(c.name, x, 6, w, 6.2, 3.4, 700, INK)
  s.text(c.title, x, 15, w, 3.3, 2.4, 500, MUTED)
  s.text(c.company, x, 24, w, 2.5, 1.8, 650, a, { caps: true, spacing: 0.14 })
  contactLines(c, 3).forEach((l, i) => s.text(l, x, 29.2 + i * 4.65, w, 3, 2, 500, INK))
  s.qr(qr)
  return { ops: s.ops, qrBox: qr, background: PAPER }
}

function noir(c: MyCard, m: Measure): Layout {
  const acc = accentById(c.accent), s = new Sheet(m, c), qr = qrBottomRight
  s.keepClear(qr); s.keepClear(FACE_TR)
  s.text(c.company, M, 5.4, CARD_W - 2 * M, 2.5, 1.8, 650, acc.lite, { caps: true, spacing: 0.14 })
  s.face(FACE_TR, acc.lite, NOIR)
  const name = s.text(c.name, M, 15.4, CARD_W - 2 * M, 7, 3.6, 700, '#F6F7F8')
  s.text(c.title, M, (name ? name.y + name.h : 15.4) + 0.6, CARD_W - 2 * M, 3.3, 2.4, 500, acc.lite)
  s.rect({ x: M, y: 30.4, w: 9, h: 0.9 }, acc.lite, 0.4)
  contactLines(c, 3).forEach((l, i) => s.text(l, M, 33.6 + i * 4.65, CARD_W - 2 * M, 3, 2, 500, '#C9CDD2'))
  s.qr(qr)
  return { ops: s.ops, qrBox: qr, background: NOIR }
}

function bold(c: MyCard, m: Measure): Layout {
  const a = accentById(c.accent).hex, s = new Sheet(m, c), qr = qrTopRight
  s.keepClear(qr)
  s.text(c.company, M, 5.4, CARD_W - 2 * M, 2.5, 1.8, 650, 'rgba(255,255,255,0.88)', { caps: true, spacing: 0.14 })
  const name = s.text(c.name, M, 14, 66, 10.4, 4.5, 800, WHITE, { caps: true })
  s.text(c.title, M, (name ? name.y + name.h : 14) + 1, CARD_W - 2 * M, 3.3, 2.4, 500, 'rgba(255,255,255,0.92)')
  contactLines(c, 2).forEach((l, i) => s.text(l, M, CARD_H - 4.6 - 9.3 + i * 4.65, CARD_W - 2 * M, 3, 2, 500, 'rgba(255,255,255,0.95)'))
  s.qr(qr)
  return { ops: s.ops, qrBox: qr, background: a }
}

const BY_TEMPLATE = { ledger, header, split, noir, bold }

/** Where everything on the card goes. `measure` says how wide text is (the canvas measures it; tests use an estimate). */
export function layoutCard(card: MyCard, measure: Measure, _dark = false): Layout {
  return BY_TEMPLATE[card.template]?.(card, measure) ?? ledger(card, measure)
}

export function cardDescription(c: MyCard): string {
  return [c.name || 'Unnamed', c.title, c.company, c.phones[0], c.emails[0]].filter(Boolean).join(', ')
}
