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
      c.getContext('2d')!.drawImage(source, 0, 0, t.w, t.h)
      return await new Promise<Blob | undefined>((res) => c.toBlob((b) => res(b ?? undefined), 'image/jpeg', 0.86))
    } finally { release() }
  } catch { return undefined }
}
