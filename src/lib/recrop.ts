import { decode } from './image.ts'
import { quadSize, warpQuad, type Pt, type Quad } from './warp.ts'

const WORK_SIDE = 2200     // working size of the photo being adjusted
const OUT_SIDE = 1800      // longest side of the saved card, same as a fresh scan

/** Corners as fractions of the photo (0 to 1), in reading order: top-left, top-right, bottom-right, bottom-left. */
export const defaultQuad = (inset = 0.03): Quad => [[inset, inset], [1 - inset, inset], [1 - inset, 1 - inset], [inset, 1 - inset]]

export const clamp01 = (n: number) => Math.min(1, Math.max(0, n))

const cross = (o: Pt, a: Pt, b: Pt) => (a[0] - o[0]) * (b[1] - o[1]) - (a[1] - o[1]) * (b[0] - o[0])
export const quadArea = (q: Quad): number => Math.abs(q.reduce((s, p, i) => s + (p[0] * q[(i + 1) % 4]![1] - q[(i + 1) % 4]![0] * p[1]), 0)) / 2

/** A usable crop is a convex, untangled four-sided shape that covers a real part of the photo, not a sliver. */
export function quadUsable(q: Quad, minArea = 0.04): boolean {
  const signs = q.map((p, i) => Math.sign(cross(p, q[(i + 1) % 4]!, q[(i + 2) % 4]!)))
  return signs.every((s) => s !== 0 && s === signs[0]) && quadArea(q) >= minArea
}

export type Rotation = 0 | 90 | 180 | 270
export const turn = (r: Rotation, by: 90 | -90): Rotation => ((r + by + 360) % 360) as Rotation

/** Turn the corners a quarter turn clockwise along with the photo, keeping them in reading order. */
export function rotateQuadCW(q: Quad): Quad {
  const r = q.map(([x, y]) => [1 - y, x] as Pt)
  return [r[3]!, r[0]!, r[1]!, r[2]!]
}
export function rotateQuadCCW(q: Quad): Quad {
  const r = q.map(([x, y]) => [y, 1 - x] as Pt)
  return [r[1]!, r[2]!, r[3]!, r[0]!]
}

/** The photo drawn turned by `rotation` degrees clockwise, no larger than `maxSide` on its long edge. */
async function drawTurned(photo: Blob, rotation: Rotation, maxSide: number): Promise<HTMLCanvasElement> {
  const { source, width, height, release } = await decode(photo)
  try {
    const k = Math.min(1, maxSide / Math.max(width, height))
    const w = Math.round(width * k), h = Math.round(height * k)
    const c = document.createElement('canvas')
    const swap = rotation === 90 || rotation === 270
    c.width = swap ? h : w; c.height = swap ? w : h
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    ctx.translate(c.width / 2, c.height / 2); ctx.rotate((rotation * Math.PI) / 180)
    ctx.drawImage(source, -w / 2, -h / 2, w, h)
    return c
  } finally { release() }
}

/** A screen-sized copy of the photo, turned, for the editor to draw its corners over. */
export async function turnedPreview(photo: Blob, rotation: Rotation): Promise<Blob> {
  const c = await drawTurned(photo, rotation, 1400)
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.85))
}

/** Turn the photo, then flatten the chosen corners into a fresh card photo. Runs in the browser. */
export async function applyCrop(photo: Blob, quad: Quad, rotation: Rotation = 0): Promise<Blob> {
  {
    const full = await drawTurned(photo, rotation, WORK_SIDE)
    const fw = full.width, fh = full.height
    const ctx = full.getContext('2d', { willReadFrequently: true })!
    const q = quad.map(([x, y]) => [x * fw, y * fh] as Pt) as Quad
    const size = quadSize(q)
    const s = Math.min(1, OUT_SIDE / Math.max(size.w, size.h))
    const ow = Math.max(1, Math.round(size.w * s)), oh = Math.max(1, Math.round(size.h * s))
    const flat = warpQuad(ctx.getImageData(0, 0, fw, fh).data, fw, fh, q, ow, oh)
    const out = document.createElement('canvas'); out.width = ow; out.height = oh
    out.getContext('2d')!.putImageData(new ImageData(flat, ow, oh), 0, 0)
    return await new Promise<Blob>((resolve, reject) => out.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/jpeg', 0.9))
  }
}
