import { detectCards } from './detect'
import { decode, prepareImage } from './image'
import { growQuad, quadSize, warpQuad, type Pt, type Quad } from './warp'

const MAX_SIDE = 2200      // working size of the source photo
const OUT_SIDE = 1800      // longest side of the saved card
const PAD = 0.03

/**
 * For photos that come from the gallery: if there is exactly ONE card-shaped card in the picture, crop to it and flatten it
 * (tilt and perspective). If there are several cards, or nothing that looks like a card, keep the whole photo so nothing
 * is ever cut off. Falls back to the plain resize on any problem.
 */
export async function prepareCardImage(file: Blob): Promise<Blob> {
  try {
    const { source, width, height, release } = await decode(file)
    try {
      const k = Math.min(1, MAX_SIDE / Math.max(width, height))
      const fw = Math.round(width * k), fh = Math.round(height * k)
      const full = document.createElement('canvas'); full.width = fw; full.height = fh
      const fctx = full.getContext('2d', { willReadFrequently: true })!
      fctx.drawImage(source, 0, 0, fw, fh)

      // Look for cards on a small copy.
      const aw = 160, ah = Math.max(1, Math.round((fh * aw) / fw))
      const small = document.createElement('canvas'); small.width = aw; small.height = ah
      const sctx = small.getContext('2d', { willReadFrequently: true })!
      sctx.drawImage(full, 0, 0, aw, ah)
      const cards = detectCards(sctx.getImageData(0, 0, aw, ah).data, aw, ah)

      const only = cards.length === 1 ? cards[0]! : null
      const share = only ? (only.w * only.h) / (aw * ah) : 0
      // The detector already checked shape, corners and proportions; here only make sure it is a sensible share of the photo.
      if (!only || share < 0.1 || share > 0.85) return await prepareImage(file)

      const f = fw / aw
      const q = growQuad(only.quad.map(([x, y]) => [x * f, y * f] as Pt) as Quad, PAD * 2)
      const size = quadSize(q)
      const s = Math.min(1, OUT_SIDE / Math.max(size.w, size.h))
      const ow = Math.max(1, Math.round(size.w * s)), oh = Math.max(1, Math.round(size.h * s))
      const flat = warpQuad(fctx.getImageData(0, 0, fw, fh).data, fw, fh, q, ow, oh)
      const out = document.createElement('canvas'); out.width = ow; out.height = oh
      out.getContext('2d')!.putImageData(new ImageData(flat, ow, oh), 0, 0)
      return await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9))
    } finally { release() }
  } catch {
    return prepareImage(file)
  }
}
