import { CARD_H, CARD_W, layoutCard, type Box, type Op, type TextStyle } from './cardlayout'
import { photoKindOf, type PhotoKind } from './cardphoto'
import type { FontId, MyCard } from './mycards'

const FAMILY: Record<FontId, string> = {
  archivo: "'Archivo', system-ui, sans-serif",
  inter: "'Inter Variable', Inter, system-ui, sans-serif",
}
const WEIGHTS = [400, 500, 650, 700, 800]

/** Archivo is always loaded by the app. Inter is only fetched when a card asks for it, so nobody else pays for it. */
async function ready(font: FontId): Promise<void> {
  try {
    if (font === 'inter') await import('@fontsource-variable/inter/wght.css')
    await Promise.all(WEIGHTS.map((w) => document.fonts.load(`${w} 16px ${FAMILY[font]}`)))
  } catch { /* draw with the fallback face; the card is still complete */ }
}

/**
 * Draws the card, `px` pixels wide, onto a canvas. The one renderer behind the on-screen preview, the image export and
 * the share sheet, so they cannot drift apart. `qr` is the module grid to print on the QR plate.
 */
export async function drawCard(ctx: CanvasRenderingContext2D, card: MyCard, qr: boolean[][], px: number, isCurrent: () => boolean = () => true): Promise<void> {
  await ready(card.font)
  if (!isCurrent()) return
  const k = px / CARD_W
  const font = (size: number, weight: number) => `${weight} ${size * k}px ${FAMILY[card.font]}`
  const measure = (t: string, size: number, weight: number, style?: TextStyle) => {
    ctx.font = font(size, weight); setStyle(ctx, style, size, k)
    const w = ctx.measureText(t).width / k
    setStyle(ctx, undefined, size, k)
    return w
  }
  const photo = card.photo ? await createImageBitmap(card.photo).catch(() => undefined) : undefined
  if (!isCurrent()) { photo?.close(); return }                       // a newer draw has started; do not paint over it with old content
  // A photo that cannot be decoded (a corrupt file that came in through a restore) shows the monogram instead of a hole.
  const { ops, qrBox, background } = layoutCard(photo ? card : { ...card, photo: undefined }, measure, false)
  ctx.save()
  ctx.clearRect(0, 0, px, CARD_H * k)
  ctx.fillStyle = background; ctx.fillRect(0, 0, px, CARD_H * k)
  const kind = photo ? photoKindOf(photo, photo.width, photo.height) : 'face'
  for (const op of ops) paint(ctx, op, k, font, qr, qrBox, photo, kind)
  ctx.restore()
  photo?.close()
}

/** Letter-spacing and font width, applied identically when measuring and painting so fitted text is exactly as wide as it is drawn. Older browsers ignore what they lack. */
function setStyle(ctx: CanvasRenderingContext2D, style: TextStyle | undefined, size: number, k: number): void {
  if ('letterSpacing' in ctx) ctx.letterSpacing = `${(style?.spacing ?? 0) * size * k}px`
  if ('fontStretch' in ctx) ctx.fontStretch = style?.stretch ?? 'normal'
}

function paint(ctx: CanvasRenderingContext2D, op: Op, k: number, font: (s: number, w: number) => string, qr: boolean[][], qrBox: Box, photo?: ImageBitmap, kind: PhotoKind = 'face'): void {
  const b = op.box
  if (op.kind === 'rect') {
    ctx.fillStyle = op.fill; ctx.beginPath(); ctx.roundRect(b.x * k, b.y * k, b.w * k, b.h * k, (op.radius ?? 0) * k); ctx.fill()
  } else if (op.kind === 'text') {
    ctx.font = font(op.size, op.weight); ctx.fillStyle = op.color; ctx.textBaseline = 'top'; ctx.textAlign = 'left'
    setStyle(ctx, { spacing: op.spacing, stretch: op.stretch }, op.size, k)
    ctx.fillText(op.text, b.x * k, b.y * k)
    setStyle(ctx, undefined, op.size, k)
  } else if (op.kind === 'mono') {
    ctx.fillStyle = op.fill; ctx.beginPath(); ctx.arc((b.x + b.w / 2) * k, (b.y + b.h / 2) * k, (b.w / 2) * k, 0, Math.PI * 2); ctx.fill()
    ctx.fillStyle = op.color; ctx.font = font(b.w * 0.38, 700); ctx.textAlign = 'center'; ctx.textBaseline = 'middle'
    ctx.fillText(op.text, (b.x + b.w / 2) * k, (b.y + b.h / 2) * k); ctx.textAlign = 'left'
  } else if (op.kind === 'photo') {
    if (!photo) return
    const right = op.anchor === 'right'
    if (kind === 'logo') {
      // a logo is drawn whole on a white plate, like the QR's, sized to the logo and set against the slot's anchored end
      const pad = b.h * 0.12
      const fit = Math.min(((b.w - 2 * pad) * k) / photo.width, ((b.h - 2 * pad) * k) / photo.height)
      const w = photo.width * fit, h = photo.height * fit
      const plateW = w + 2 * pad * k, plateX = right ? (b.x + b.w) * k - plateW : b.x * k
      ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(plateX, b.y * k, plateW, b.h * k, 1.4 * k); ctx.fill()
      ctx.drawImage(photo, plateX + pad * k, (b.y + b.h / 2) * k - h / 2, w, h)
      return
    }
    // a face fills a circle the slot's height, at its anchored end
    const r = (b.h / 2) * k, cx = right ? (b.x + b.w) * k - r : b.x * k + r, cy = (b.y + b.h / 2) * k
    ctx.save(); ctx.beginPath(); ctx.arc(cx, cy, r, 0, Math.PI * 2); ctx.clip()
    const sc = Math.max((2 * r) / photo.width, (2 * r) / photo.height)
    ctx.drawImage(photo, cx - (photo.width * sc) / 2, cy - (photo.height * sc) / 2, photo.width * sc, photo.height * sc)
    ctx.restore()
  } else if (op.kind === 'qr') {
    // A white plate with dark modules and a quiet zone of four modules: the same on every template, whatever the accent.
    ctx.fillStyle = '#FFFFFF'; ctx.beginPath(); ctx.roundRect(qrBox.x * k, qrBox.y * k, qrBox.w * k, qrBox.h * k, 1.4 * k); ctx.fill()
    const quiet = 4, n = qr.length, cell = (qrBox.w * k) / (n + 2 * quiet)
    ctx.fillStyle = '#16191D'
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) if (qr[y]![x]) ctx.fillRect(qrBox.x * k + (x + quiet) * cell, qrBox.y * k + (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell))
  }
}
