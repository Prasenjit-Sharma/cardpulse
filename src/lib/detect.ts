import type { Pt, Quad } from './warp'

/**
 * Finds business cards in a small camera frame, in plain TypeScript (no OpenCV, no download).
 *
 * 1. Work out which pixels are "card" rather than "table": by brightness (light card on darker table or the reverse),
 *    and if that finds nothing, by colour (a blue card on a brown table can have the same brightness).
 * 2. Clean the mask, take the blob under the middle of the frame, fit a rectangle with PCA and find its four corners.
 * 3. Accept it only if it is card-shaped: right proportions, fills its rectangle, doesn't run off the frame.
 * Coordinates are in the analysed image's pixels; the caller scales them.
 */
export interface Detection {
  cx: number; cy: number
  /** Side lengths of the fitted rectangle: w along `angle`, h across it. w >= h. */
  w: number; h: number
  /** Radians, direction of the long side. */
  angle: number
  /** Fitted rectangle corners. */
  corners: Pt[]
  /** The card's four corners (TL, TR, BR, BL), following perspective. */
  quad: Quad
  /** How rectangular the blob is, 0..1. */
  fill: number
}

const MAX_AREA = 0.9
const MIN_ASPECT = 1.25, MAX_ASPECT = 2.3
const MIN_RECT_FILL = 0.6   // vs the fitted rectangle: a sanity floor (a trapezoid fills less)
const MIN_QUAD_FILL = 0.82  // vs the blob's own four corners: how card-like the shape is

/* ---------------- image helpers ---------------- */

function boxBlur(src: Float32Array, w: number, h: number, r: number): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length)
  const k = 2 * r + 1
  for (let y = 0; y < h; y++) {
    let sum = 0
    for (let x = -r; x <= r; x++) sum += src[y * w + Math.min(w - 1, Math.max(0, x))]!
    for (let x = 0; x < w; x++) {
      tmp[y * w + x] = sum / k
      sum += src[y * w + Math.min(w - 1, x + r + 1)]! - src[y * w + Math.max(0, x - r)]!
    }
  }
  for (let x = 0; x < w; x++) {
    let sum = 0
    for (let y = -r; y <= r; y++) sum += tmp[Math.min(h - 1, Math.max(0, y)) * w + x]!
    for (let y = 0; y < h; y++) {
      out[y * w + x] = sum / k
      sum += tmp[Math.min(h - 1, y + r + 1) * w + x]! - tmp[Math.max(0, y - r) * w + x]!
    }
  }
  return out
}

/** Grayscale dilation (max) or erosion (min) with a (2r+1) square: erases thin printing, keeps the card's body. */
function morph(src: Float32Array, w: number, h: number, r: number, max: boolean): Float32Array {
  const tmp = new Float32Array(src.length), out = new Float32Array(src.length)
  const better = max ? (a: number, b: number) => a > b : (a: number, b: number) => a < b
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = src[y * w + x]!
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const v = src[y * w + k]!; if (better(v, m)) m = v }
    tmp[y * w + x] = m
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let m = tmp[y * w + x]!
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const v = tmp[k * w + x]!; if (better(v, m)) m = v }
    out[y * w + x] = m
  }
  return out
}

/** Binary erode (`all` = every neighbour set) or dilate (`any` neighbour set) with a (2r+1) square. */
function binMorph(m: Uint8Array, w: number, h: number, r: number, all: boolean): Uint8Array {
  const tmp = new Uint8Array(m.length), out = new Uint8Array(m.length)
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = all ? 1 : 0
    for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const b = m[y * w + k]!; if (all ? !b : b) { v = all ? 0 : 1; break } }
    tmp[y * w + x] = v
  }
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let v = all ? 1 : 0
    for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const b = tmp[k * w + x]!; if (all ? !b : b) { v = all ? 0 : 1; break } }
    out[y * w + x] = v
  }
  return out
}
/** Opening removes specks and thin bridges to table texture; closing fills holes left by printing. */
const openMask = (m: Uint8Array, w: number, h: number, r: number) => binMorph(binMorph(m, w, h, r, true), w, h, r, false)
const closeMask = (m: Uint8Array, w: number, h: number, r: number) => binMorph(binMorph(m, w, h, r, false), w, h, r, true)

function percentile(vals: number[], p: number): number {
  vals.sort((a, b) => a - b)
  return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]!
}

const inMiddle = (x: number, y: number, W: number, H: number) => x > W * 0.3 && x < W * 0.7 && y > H * 0.3 && y < H * 0.7
const inRing = (x: number, y: number, W: number, H: number) => x < W * 0.08 || x > W * 0.92 || y < H * 0.08 || y > H * 0.92

interface Prepared { mask: Uint8Array; R: number }

/* ---------------- step 1a: brightness mask ---------------- */

function brightnessMask(rgba: Uint8ClampedArray, W: number, H: number, dbg?: Record<string, unknown>): Prepared | null {
  const n = W * H
  let gray: Float32Array = new Float32Array(n)
  for (let i = 0; i < n; i++) gray[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
  gray = boxBlur(gray, W, H, 1)

  // Is the card lighter or darker than the table? Compare the extremes of the middle against the edge ring,
  // because printing drags the middle's average toward the ink colour.
  const centre: number[] = [], ring: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inMiddle(x, y, W, H)) centre.push(gray[y * W + x]!); else if (inRing(x, y, W, H)) ring.push(gray[y * W + x]!)
  }
  const lightScore = percentile(centre.slice(), 0.9) - percentile(ring.slice(), 0.9)
  const darkScore = percentile(ring.slice(), 0.1) - percentile(centre.slice(), 0.1)
  const cardIsLight = lightScore >= darkScore
  if (dbg) Object.assign(dbg, { lightScore, darkScore, cardIsLight })
  if (Math.max(lightScore, darkScore) < 18) return null

  const R = Math.max(2, Math.round(W * 0.018))                    // ~3px at 160px: enough to erase printing, gentle on textured tables
  gray = boxBlur(morph(gray, W, H, R, cardIsLight), W, H, 1)

  // Threshold halfway between the card's level and the table's level. (Otsu can lock onto an unrelated very dark or
  // bright object, like a phone on the table, and call everything else "card".)
  const centre2: number[] = [], ring2: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inMiddle(x, y, W, H)) centre2.push(gray[y * W + x]!); else if (inRing(x, y, W, H)) ring2.push(gray[y * W + x]!)
  }
  const cardLevel = percentile(centre2, cardIsLight ? 0.85 : 0.15)
  const tableLevel = percentile(ring2, 0.5)
  if (dbg) Object.assign(dbg, { cardLevel, tableLevel })
  if (Math.abs(cardLevel - tableLevel) < 14) return null
  const thr = (cardLevel + tableLevel) / 2

  let mask: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = (gray[i]! > thr) === cardIsLight ? 1 : 0
  return { mask: openMask(mask, W, H, 2), R }
}

/* ---------------- step 1b: colour mask (fallback) ---------------- */

function colourMask(rgba: Uint8ClampedArray, W: number, H: number, dbg?: Record<string, unknown>): Prepared | null {
  const n = W * H
  const ch = [0, 1, 2].map((c) => { const a = new Float32Array(n); for (let i = 0; i < n; i++) a[i] = rgba[i * 4 + c]!; return boxBlur(boxBlur(a, W, H, 1), W, H, 1) })
  const [rr, gg, bb] = ch as [Float32Array, Float32Array, Float32Array]
  const ringPx: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (inRing(x, y, W, H)) ringPx.push(y * W + x)
  const med = (a: Float32Array) => percentile(ringPx.map((i) => a[i]!), 0.5)
  const tr = med(rr), tg = med(gg), tb = med(bb), ts = tr + tg + tb || 1
  const tL = 0.299 * tr + 0.587 * tg + 0.114 * tb

  // Two clues that a pixel is card: its colour differs from the table's (shadows change brightness, not colour),
  // or it is clearly brighter than the table.
  const dc = new Float32Array(n), dl = new Float32Array(n)
  for (let i = 0; i < n; i++) {
    const s = (rr[i]! + gg[i]! + bb[i]!) || 1
    dc[i] = Math.hypot(rr[i]! / s - tr / ts, gg[i]! / s - tg / ts)
    dl[i] = 0.299 * rr[i]! + 0.587 * gg[i]! + 0.114 * bb[i]! - tL
  }
  const mid: number[] = [], midL: number[] = [], ringC: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    if (inMiddle(x, y, W, H)) { mid.push(dc[y * W + x]!); midL.push(dl[y * W + x]!) } else if (inRing(x, y, W, H)) ringC.push(dc[y * W + x]!)
  }
  const cardC = percentile(mid.slice(), 0.85), cardL = percentile(midL.slice(), 0.85)
  const noiseC = percentile(ringC, 0.9)
  const colourThr = Math.max(0.03, noiseC * 1.6, cardC * 0.5)
  const useColour = cardC >= Math.max(0.045, noiseC * 2)
  const useBright = cardL >= 28
  if (dbg) Object.assign(dbg, { cardC, noiseC, colourThr, cardL, useColour, useBright })
  if (!useColour && !useBright) return null

  const brightThr = cardL * 0.5
  const mask = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = (useColour && dc[i]! > colourThr) || (useBright && dl[i]! > brightThr) ? 1 : 0
  return { mask: openMask(closeMask(mask, W, H, 2), W, H, 2), R: 0 }
}

/* ---------------- step 2: blobs ---------------- */

/** 4-connected flood fill. The queue doubles as the list of blob pixels. Returns the blob's size and how much of it touches the frame edge. */
function floodFill(mask: Uint8Array, W: number, H: number, seed: number, seen: Uint8Array, queue: Int32Array): { area: number; borderPx: number } {
  let head = 0, tail = 0, borderPx = 0
  queue[tail++] = seed; seen[seed] = 1
  while (head < tail) {
    const p = queue[head++]!
    const x = p % W, y = (p / W) | 0
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) borderPx++
    if (x > 0 && !seen[p - 1] && mask[p - 1]) { seen[p - 1] = 1; queue[tail++] = p - 1 }
    if (x < W - 1 && !seen[p + 1] && mask[p + 1]) { seen[p + 1] = 1; queue[tail++] = p + 1 }
    if (y > 0 && !seen[p - W] && mask[p - W]) { seen[p - W] = 1; queue[tail++] = p - W }
    if (y < H - 1 && !seen[p + W] && mask[p + W]) { seen[p + W] = 1; queue[tail++] = p + W }
  }
  return { area: tail, borderPx }
}

/** Is this blob a card? If so: its fitted rectangle and its four corners. */
function evaluate(queue: Int32Array, area: number, borderPx: number, W: number, H: number, R: number, minArea: number, minSide: number, dbg?: Record<string, unknown>): Detection | null {
  const n = W * H
  if (dbg) Object.assign(dbg, { area, areaFrac: +(area / n).toFixed(3), borderPx })
  if (area < minArea * n || area > MAX_AREA * n) return null
  if (borderPx > 0.25 * 2 * (W + H)) return null // it is the background, not a card

  let sx = 0, sy = 0
  for (let i = 0; i < area; i++) { const p = queue[i]!; sx += p % W; sy += (p / W) | 0 }
  const mcx = sx / area, mcy = sy / area
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < area; i++) { const p = queue[i]!; const dx = (p % W) - mcx, dy = ((p / W) | 0) - mcy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
  let ang = 0.5 * Math.atan2(2 * sxy, sxx - syy)

  // Extents in the principal frame; if the long side is across, turn the frame a quarter so the long side is `u`.
  const extents = (a: number) => {
    const ca = Math.cos(a), sa = Math.sin(a)
    let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
    for (let i = 0; i < area; i++) {
      const p = queue[i]!; const dx = (p % W) - mcx, dy = ((p / W) | 0) - mcy
      const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
      if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v
    }
    return { u0, u1, v0, v1 }
  }
  let e = extents(ang)
  if (e.v1 - e.v0 > e.u1 - e.u0) { ang += Math.PI / 2; e = extents(ang) }
  const ca = Math.cos(ang), sa = Math.sin(ang)

  const w = e.u1 - e.u0 + 1 - 2 * R, h = e.v1 - e.v0 + 1 - 2 * R // the max/min filter grew the blob by R on every side
  if (w <= 0 || h <= 0) return null
  const fill = area / ((w + 2 * R) * (h + 2 * R))
  if (dbg) Object.assign(dbg, { w, h, fill: +fill.toFixed(2), aspect: +(w / h).toFixed(2), R })
  if (fill < MIN_RECT_FILL) return null

  // The four corners: the blob's extreme points along each diagonal of the principal frame.
  let aU = 0, aV = 0, bU = 0, bV = 0, cU = 0, cV = 0, dU = 0, dV = 0
  let aS = Infinity, bS = -Infinity, cS = -Infinity, dS = Infinity
  for (let i = 0; i < area; i++) {
    const p = queue[i]!; const dx = (p % W) - mcx, dy = ((p / W) | 0) - mcy
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
    if (u + v < aS) { aS = u + v; aU = u; aV = v }          // top-left
    if (u - v > bS) { bS = u - v; bU = u; bV = v }          // top-right
    if (u + v > cS) { cS = u + v; cU = u; cV = v }          // bottom-right
    if (u - v < dS) { dS = u - v; dU = u; dV = v }          // bottom-left
  }
  const ins = R * 1.2                                        // undo the filter's growth
  const toXY = (u: number, v: number): Pt => [mcx + u * ca - v * sa, mcy + u * sa + v * ca]
  const quad: Quad = [toXY(aU + ins, aV + ins), toXY(bU - ins, bV + ins), toXY(cU - ins, cV - ins), toXY(dU + ins, dV - ins)]

  // Judge the shape by its own corners so a card seen at an angle (a trapezoid) still counts.
  const edge = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])
  const topE = edge(quad[0], quad[1]), botE = edge(quad[3], quad[2]), leftE = edge(quad[0], quad[3]), rightE = edge(quad[1], quad[2])
  const qw = (topE + botE) / 2, qh = (leftE + rightE) / 2
  const long = Math.max(qw, qh), short = Math.min(qw, qh)
  let shoelace = 0
  for (let i = 0; i < 4; i++) { const a = quad[i]!, b = quad[(i + 1) % 4]!; shoelace += a[0] * b[1] - b[0] * a[1] }
  const quadArea = Math.abs(shoelace) / 2, perim = topE + botE + leftE + rightE
  const quadFill = area / (quadArea + R * perim + 4 * R * R)
  let convex = true, sign = 0
  for (let i = 0; i < 4; i++) {
    const a = quad[i]!, b = quad[(i + 1) % 4]!, c = quad[(i + 2) % 4]!
    const cross = (b[0] - a[0]) * (c[1] - b[1]) - (b[1] - a[1]) * (c[0] - b[0])
    if (sign === 0) sign = Math.sign(cross); else if (Math.sign(cross) !== sign) convex = false
  }
  const opposite = Math.min(topE, botE) / Math.max(topE, botE) > 0.5 && Math.min(leftE, rightE) / Math.max(leftE, rightE) > 0.5
  if (dbg) Object.assign(dbg, { quadFill: +quadFill.toFixed(2), qAspect: +(long / short).toFixed(2), convex, opposite })
  if (quadFill < MIN_QUAD_FILL || !convex || !opposite) return null
  if (long / short < MIN_ASPECT || long / short > MAX_ASPECT) return null
  if (short < minSide) return null

  const cu = (e.u0 + e.u1) / 2, cv = (e.v0 + e.v1) / 2
  const cx = mcx + cu * ca - cv * sa, cy = mcy + cu * sa + cv * ca
  const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => toXY(cu + (a * w) / 2, cv + (b * h) / 2))
  return { cx, cy, w, h, angle: ang, corners, quad, fill: quadFill }
}

function centreSeed(mask: Uint8Array, W: number, H: number): number {
  const mx = (W / 2) | 0, my = (H / 2) | 0
  for (let r = 0; r < Math.min(W, H) * 0.3; r++) {
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const x = mx + dx, y = my + dy
      if (x >= 0 && y >= 0 && x < W && y < H && mask[y * W + x]) return y * W + x
    }
  }
  return -1
}

const MASKS = [brightnessMask, colourMask]

/** The card under the middle of the frame, or null. */
export function detectCard(rgba: Uint8ClampedArray, W: number, H: number, dbg?: Record<string, unknown>): Detection | null {
  const seen = new Uint8Array(W * H), queue = new Int32Array(W * H)
  for (const build of MASKS) {
    const prep = build(rgba, W, H, dbg)
    if (!prep) continue
    const seed = centreSeed(prep.mask, W, H)
    if (seed < 0) continue
    seen.fill(0)
    const { area, borderPx } = floodFill(prep.mask, W, H, seed, seen, queue)
    const d = evaluate(queue, area, borderPx, W, H, prep.R, 0.06, Math.min(W, H) * 0.14, dbg)
    if (d) return d
  }
  return null
}

/** Every card-shaped blob in the frame (used to tell one card from a table of several). Largest first. */
export function detectCards(rgba: Uint8ClampedArray, W: number, H: number): Detection[] {
  const seen = new Uint8Array(W * H), queue = new Int32Array(W * H)
  for (const build of MASKS) {
    const prep = build(rgba, W, H)
    if (!prep) continue
    seen.fill(0)
    const found: Detection[] = []
    for (let i = 0; i < W * H; i++) {
      if (!prep.mask[i] || seen[i]) continue
      const { area, borderPx } = floodFill(prep.mask, W, H, i, seen, queue)
      if (area < 0.012 * W * H) continue
      const d = evaluate(queue, area, borderPx, W, H, prep.R, 0.012, Math.min(W, H) * 0.08)
      if (d) found.push(d)
    }
    if (found.length) return found.sort((a, b) => b.w * b.h - a.w * a.h)
  }
  return []
}

/** Same card seen in two consecutive frames? Used to decide when the user is holding still. */
export function isStable(a: Detection, b: Detection, frameW: number): boolean {
  const near = Math.hypot(a.cx - b.cx, a.cy - b.cy) < frameW * 0.045
  const size = Math.abs(a.w - b.w) < a.w * 0.09 && Math.abs(a.h - b.h) < a.h * 0.11
  let da = Math.abs(a.angle - b.angle) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da
  return near && size && da < 0.1
}
