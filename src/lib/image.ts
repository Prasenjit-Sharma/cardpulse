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

interface Decoded { source: CanvasImageSource; width: number; height: number; release: () => void }

/** createImageBitmap is fastest, but some mobile browsers reject it; an <img> element is the universal fallback. */
async function decode(file: Blob): Promise<Decoded> {
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
