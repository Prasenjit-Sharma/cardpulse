/** Downscale to maxSide and re-encode as JPEG — keeps uploads small and fast without hurting card text. */
export async function prepareImage(file: Blob, maxSide = 1800, quality = 0.88): Promise<Blob> {
  const { source, width, height, release } = await decode(file)
  const scale = Math.min(1, maxSide / Math.max(width, height))
  const canvas = document.createElement('canvas')
  canvas.width = Math.max(1, Math.round(width * scale))
  canvas.height = Math.max(1, Math.round(height * scale))
  canvas.getContext('2d')!.drawImage(source, 0, 0, canvas.width, canvas.height)
  release()
  return new Promise((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/jpeg', quality),
  )
}

export interface Decoded { source: CanvasImageSource; width: number; height: number; release: () => void }

/** createImageBitmap is fastest, but some mobile browsers reject it; an <img> element is the universal fallback. */
export async function decode(file: Blob): Promise<Decoded> {
  try {
    const bmp = await createImageBitmap(file, { imageOrientation: 'from-image' }).catch(() => createImageBitmap(file))
    return { source: bmp, width: bmp.width, height: bmp.height, release: () => bmp.close() }
  } catch {
    const url = URL.createObjectURL(file)
    const img = new Image()
    img.src = url
    try {
      await img.decode()
    } catch {
      URL.revokeObjectURL(url)
      throw new Error('This browser could not decode the image')
    }
    return { source: img, width: img.naturalWidth, height: img.naturalHeight, release: () => URL.revokeObjectURL(url) }
  }
}

/** Total photo bytes one batch request may carry. Keeps the request inside the server's limits (and its free CPU budget). */
export const BATCH_TOTAL_BYTES = 3_000_000

/**
 * Re-encode a photo so `n` of them fit in one batch request. Photos already small enough are sent untouched, so a
 * clean 1800px card is never degraded; only the heavy ones (textured backgrounds, tables of cards) are shrunk, stepwise.
 */
export async function fitForBatch(b: Blob, n: number): Promise<Blob> {
  const budget = Math.min(1_200_000, Math.floor(BATCH_TOTAL_BYTES / Math.max(1, n)))
  if (b.size <= budget) return b
  for (const [side, q] of [[1800, 0.86], [1600, 0.82], [1400, 0.78], [1200, 0.74], [1000, 0.7]] as const) {
    const out = await prepareImage(b, side, q)
    if (out.size <= budget) return out
  }
  return prepareImage(b, 900, 0.65)
}
