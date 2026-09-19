export interface Rect { x: number; y: number; w: number; h: number }
export interface Guide { widthFrac: number; aspect: number; pad: number }

/** The card frame drawn over the viewfinder. Camera and crop must agree, so both read this. */
export const CARD_GUIDE: Guide = { widthFrac: 0.92, aspect: 1.75, pad: 0.03 }

/**
 * Which part of the video frame the user actually saw inside the guide, in video pixels.
 * The <video> is shown with object-fit: cover, so the frame is scaled to fill the viewfinder and the overflow is cut off.
 * With no guide, returns everything visible in the viewfinder (what you see is what you get).
 */
export function cropRect(view: { w: number; h: number }, video: { w: number; h: number }, guide?: Guide): Rect {
  const s = Math.max(view.w / video.w, view.h / video.h)
  const ox = (view.w - video.w * s) / 2
  const oy = (view.h - video.h * s) / 2

  let gx = 0, gy = 0, gw = view.w, gh = view.h
  if (guide) {
    const w = view.w * guide.widthFrac, h = w / guide.aspect
    gw = w * (1 + 2 * guide.pad); gh = h * (1 + 2 * guide.pad)
    gx = (view.w - gw) / 2; gy = (view.h - gh) / 2
  }

  const x0 = Math.max(0, (gx - ox) / s), y0 = Math.max(0, (gy - oy) / s)
  const x1 = Math.min(video.w, (gx + gw - ox) / s), y1 = Math.min(video.h, (gy + gh - oy) / s)
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 }
}
