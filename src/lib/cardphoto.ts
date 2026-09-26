import { decode } from './image.ts'

/** The size to draw a picture at so its long side is at most `maxSide`. Never enlarges. */
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
      const ctx = c.getContext('2d')!
      // JPEG has no transparency: without a white ground a transparent PNG logo would turn black
      ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, t.w, t.h)
      ctx.drawImage(source, 0, 0, t.w, t.h)
      return await new Promise<Blob | undefined>((res) => c.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.86))
    } finally { release() }
  } catch { return undefined }
}

export type PhotoKind = 'logo' | 'face'
type Rgba = [number, number, number, number] | number[]

/**
 * A logo is drawn whole on a white plate; a face fills a circle. Logos are wider or taller than square, or sit on a white
 * or transparent ground, which shows in all four corners. `corners` are the RGBA values of the four corner pixels.
 */
export function photoKind(w: number, h: number, corners: Rgba[]): PhotoKind {
  const aspect = w / Math.max(1, h)
  if (aspect > 1.25 || aspect < 0.8) return 'logo'
  const plain = (c: Rgba) => (c[3] ?? 255) < 16 || Math.min(c[0]!, c[1]!, c[2]!) >= 235
  return corners.length === 4 && corners.every(plain) ? 'logo' : 'face'
}

/** Reads the kind from a decoded picture: its corners, sampled from a small copy. */
export function photoKindOf(img: CanvasImageSource, w: number, h: number): PhotoKind {
  const n = 16
  const c = document.createElement('canvas'); c.width = n; c.height = n
  const ctx = c.getContext('2d', { willReadFrequently: true })!
  ctx.drawImage(img, 0, 0, n, n)
  const px = (x: number, y: number) => Array.from(ctx.getImageData(x, y, 1, 1).data)
  return photoKind(w, h, [px(0, 0), px(n - 1, 0), px(0, n - 1), px(n - 1, n - 1)])
}
