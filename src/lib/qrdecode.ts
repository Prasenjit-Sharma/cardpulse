// Finds a QR code in a video frame or photo. Uses the phone's own detector where there is one (Chrome on Android);
// elsewhere (iPhone Safari) a small decoder is loaded the first time it is needed.

type Source = HTMLVideoElement | HTMLImageElement | ImageBitmap | HTMLCanvasElement
interface Detector { detect(src: Source): Promise<{ rawValue: string }[]> }
declare global { interface Window { BarcodeDetector?: { new (o: { formats: string[] }): Detector; getSupportedFormats?: () => Promise<string[]> } } }

let native: Detector | null | undefined
async function nativeDetector(): Promise<Detector | null> {
  if (native !== undefined) return native
  try {
    const BD = window.BarcodeDetector
    native = BD && (!BD.getSupportedFormats || (await BD.getSupportedFormats()).includes('qr_code')) ? new BD({ formats: ['qr_code'] }) : null
  } catch { native = null }
  return native
}

const canvas = () => document.createElement('canvas')
let scratch: HTMLCanvasElement | null = null

/** The QR's text, or null when there is none in view. Never throws. */
export async function decodeQr(src: Source): Promise<string | null> {
  try {
    const nd = await nativeDetector()
    if (nd) { const found = await nd.detect(src); return found[0]?.rawValue ?? null }
    const w = 'videoWidth' in src ? src.videoWidth : src.width, h = 'videoHeight' in src ? src.videoHeight : src.height
    if (!w || !h) return null
    const scale = Math.min(1, 900 / Math.max(w, h))                     // decoding a smaller frame is fast and still reads a card's QR
    scratch ??= canvas()
    scratch.width = Math.round(w * scale); scratch.height = Math.round(h * scale)
    const g = scratch.getContext('2d', { willReadFrequently: true })!
    g.drawImage(src as CanvasImageSource, 0, 0, scratch.width, scratch.height)
    const { default: jsQR } = await import('jsqr')
    const img = g.getImageData(0, 0, scratch.width, scratch.height)
    return jsQR(img.data, img.width, img.height, { inversionAttempts: 'attemptBoth' })?.data ?? null
  } catch { return null }
}

/** A QR in a photo from the gallery. */
export async function decodeQrFile(file: Blob): Promise<string | null> {
  try { const bmp = await createImageBitmap(file); return await decodeQr(bmp) } catch { return null }
}
