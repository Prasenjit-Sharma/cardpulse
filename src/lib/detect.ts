/**
 * Finds a business card in a small camera frame, in plain TypeScript (no OpenCV, no download).
 *
 * Idea: erase the printing (grey-level dilate/erode), threshold halfway between the card's brightness and the
 * table's, clean the mask, take the blob that contains the middle of the frame, and fit a rotated rectangle to it with PCA.
 * If the blob is card-shaped (right proportions, fills its rectangle, doesn't run off the frame),
 * it is a card. Coordinates are in the analysed image's pixels; the caller scales them.
 */
export interface Detection {
  cx: number; cy: number
  /** Side lengths: w along `angle`, h across it. w >= h. */
  w: number; h: number
  /** Radians, direction of the long side. */
  angle: number
  corners: [number, number][]
  /** How rectangular the blob is, 0..1. */
  fill: number
}

const MIN_AREA = 0.06, MAX_AREA = 0.9
const MIN_ASPECT = 1.25, MAX_ASPECT = 2.3
const MIN_FILL = 0.8

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

/** Grayscale dilation (max) or erosion (min) with a (2r+1) square: erases thin text, keeps the card's body. */
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

/** Binary opening with a (2r+1) square: removes specks and thin bridges, keeps the solid card body. */
function openMask(m: Uint8Array, w: number, h: number, r: number): Uint8Array {
  const pass = (src: Uint8Array, wantAll: boolean): Uint8Array => {
    const tmp = new Uint8Array(src.length), out = new Uint8Array(src.length)
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = wantAll ? 1 : 0
      for (let k = Math.max(0, x - r); k <= Math.min(w - 1, x + r); k++) { const b = src[y * w + k]!; if (wantAll ? !b : b) { v = wantAll ? 0 : 1; break } }
      tmp[y * w + x] = v
    }
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      let v = wantAll ? 1 : 0
      for (let k = Math.max(0, y - r); k <= Math.min(h - 1, y + r); k++) { const b = tmp[k * w + x]!; if (wantAll ? !b : b) { v = wantAll ? 0 : 1; break } }
      out[y * w + x] = v
    }
    return out
  }
  return pass(pass(m, true), false) // erode (all neighbours set), then dilate (any neighbour set)
}

function percentile(vals: number[], p: number): number {
  vals.sort((a, b) => a - b)
  return vals[Math.min(vals.length - 1, Math.floor(p * vals.length))]!
}

export function detectCard(rgba: Uint8ClampedArray, W: number, H: number, dbg?: Record<string, unknown>): Detection | null {
  const n = W * H
  let gray: Float32Array = new Float32Array(n)
  for (let i = 0; i < n; i++) gray[i] = 0.299 * rgba[i * 4]! + 0.587 * rgba[i * 4 + 1]! + 0.114 * rgba[i * 4 + 2]!
  gray = boxBlur(gray, W, H, 1)

  // Is the card lighter or darker than the table? Compare the extremes of the middle against the frame's edge ring,
  // because printing drags the middle's average toward the ink colour.
  const centre: number[] = [], ring: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inMid = x > W * 0.3 && x < W * 0.7 && y > H * 0.3 && y < H * 0.7
    const inRing = x < W * 0.08 || x > W * 0.92 || y < H * 0.08 || y > H * 0.92
    if (inMid) centre.push(gray[y * W + x]!); else if (inRing) ring.push(gray[y * W + x]!)
  }
  const lightScore = percentile(centre.slice(), 0.9) - percentile(ring.slice(), 0.9)
  const darkScore = percentile(ring.slice(), 0.1) - percentile(centre.slice(), 0.1)
  const cardIsLight = lightScore >= darkScore
  if (dbg) Object.assign(dbg, { lightScore, darkScore, cardIsLight })
  if (Math.max(lightScore, darkScore) < 18) return null // no meaningful difference between card and table

  const R = Math.max(2, Math.round(W * 0.018))                    // ~3px at 160px: enough to erase printing, gentle on textured tables
  gray = boxBlur(morph(gray, W, H, R, cardIsLight), W, H, 1)      // dilate (light card) / erode (dark card) removes the printing

  // Threshold halfway between the card's level and the table's level. (Otsu can lock onto some unrelated
  // very dark or very bright object, like a phone on the table, and call everything else "card".)
  const centre2: number[] = [], ring2: number[] = []
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const inMid = x > W * 0.3 && x < W * 0.7 && y > H * 0.3 && y < H * 0.7
    const inRing = x < W * 0.08 || x > W * 0.92 || y < H * 0.08 || y > H * 0.92
    if (inMid) centre2.push(gray[y * W + x]!); else if (inRing) ring2.push(gray[y * W + x]!)
  }
  const cardLevel = percentile(centre2, cardIsLight ? 0.85 : 0.15)
  const tableLevel = percentile(ring2, 0.5)
  if (dbg) Object.assign(dbg, { cardLevel, tableLevel })
  if (Math.abs(cardLevel - tableLevel) < 14) return null
  const thr = (cardLevel + tableLevel) / 2

  // Binary mask, then an opening (erode then dilate) to cut thin bridges to specks of table texture.
  let mask: Uint8Array = new Uint8Array(n)
  for (let i = 0; i < n; i++) mask[i] = (gray[i]! > thr) === cardIsLight ? 1 : 0
  mask = openMask(mask, W, H, 2)
  const inMask = (i: number) => mask[i] === 1

  // Seed: the middle pixel, or the nearest masked pixel to it.
  const mx = (W / 2) | 0, my = (H / 2) | 0
  let seed = -1
  for (let r = 0; r < Math.min(W, H) * 0.3 && seed < 0; r++) {
    for (let dy = -r; dy <= r && seed < 0; dy++) for (let dx = -r; dx <= r; dx++) {
      if (Math.max(Math.abs(dx), Math.abs(dy)) !== r) continue
      const x = mx + dx, y = my + dy
      if (x >= 0 && y >= 0 && x < W && y < H && inMask(y * W + x)) { seed = y * W + x; break }
    }
  }
  if (seed < 0) return null

  // Flood fill (4-connected). The queue doubles as the list of blob pixels.
  const seen = new Uint8Array(n), queue = new Int32Array(n)
  let head = 0, tail = 0
  queue[tail++] = seed; seen[seed] = 1
  let borderPx = 0
  while (head < tail) {
    const p = queue[head++]!
    const x = p % W, y = (p / W) | 0
    if (x === 0 || y === 0 || x === W - 1 || y === H - 1) borderPx++
    if (x > 0 && !seen[p - 1] && inMask(p - 1)) { seen[p - 1] = 1; queue[tail++] = p - 1 }
    if (x < W - 1 && !seen[p + 1] && inMask(p + 1)) { seen[p + 1] = 1; queue[tail++] = p + 1 }
    if (y > 0 && !seen[p - W] && inMask(p - W)) { seen[p - W] = 1; queue[tail++] = p - W }
    if (y < H - 1 && !seen[p + W] && inMask(p + W)) { seen[p + W] = 1; queue[tail++] = p + W }
  }
  const area = tail
  if (dbg) Object.assign(dbg, { area, areaFrac: +(area / n).toFixed(3), borderPx, seedFound: seed >= 0 })
  if (area < MIN_AREA * n || area > MAX_AREA * n) return null
  if (borderPx > 0.25 * 2 * (W + H)) return null // it is the background, not a card

  let sx = 0, sy = 0
  for (let i = 0; i < area; i++) { const p = queue[i]!; sx += p % W; sy += (p / W) | 0 }
  const mcx = sx / area, mcy = sy / area
  let sxx = 0, syy = 0, sxy = 0
  for (let i = 0; i < area; i++) { const p = queue[i]!; const dx = (p % W) - mcx, dy = ((p / W) | 0) - mcy; sxx += dx * dx; syy += dy * dy; sxy += dx * dy }
  const angle = 0.5 * Math.atan2(2 * sxy, sxx - syy)
  const ca = Math.cos(angle), sa = Math.sin(angle)
  let u0 = Infinity, u1 = -Infinity, v0 = Infinity, v1 = -Infinity
  for (let i = 0; i < area; i++) {
    const p = queue[i]!; const dx = (p % W) - mcx, dy = ((p / W) | 0) - mcy
    const u = dx * ca + dy * sa, v = -dx * sa + dy * ca
    if (u < u0) u0 = u; if (u > u1) u1 = u; if (v < v0) v0 = v; if (v > v1) v1 = v
  }
  let w = u1 - u0 + 1 - 2 * R, h = v1 - v0 + 1 - 2 * R // the max/min filter grew the blob by R on every side
  if (w <= 0 || h <= 0) return null
  const fill = area / ((w + 2 * R) * (h + 2 * R))
  if (dbg) Object.assign(dbg, { w, h, fill: +fill.toFixed(2), aspect: +(Math.max(w, h) / Math.min(w, h)).toFixed(2), R })
  if (fill < MIN_FILL) return null
  let ang = angle
  if (h > w) { [w, h] = [h, w]; ang += Math.PI / 2; [u0, u1, v0, v1] = [v0, v1, -u1, -u0] }
  const aspect = w / h
  if (aspect < MIN_ASPECT || aspect > MAX_ASPECT) return null
  if (h < Math.min(W, H) * 0.14) return null

  // Centre of the fitted rectangle (not the blob's centroid, which shifts if a corner is missing).
  const ca2 = Math.cos(ang), sa2 = Math.sin(ang)
  const cu = (u0 + u1) / 2, cv = (v0 + v1) / 2
  const cx = mcx + cu * ca2 - cv * sa2, cy = mcy + cu * sa2 + cv * ca2
  const corners = ([[-1, -1], [1, -1], [1, 1], [-1, 1]] as const).map(([a, b]) => {
    const u = (a * w) / 2, v = (b * h) / 2
    return [cx + u * ca2 - v * sa2, cy + u * sa2 + v * ca2] as [number, number]
  })
  return { cx, cy, w, h, angle: ang, corners, fill }
}

/** Same card seen in two consecutive frames? Used to decide when the user is holding still. */
export function isStable(a: Detection, b: Detection, frameW: number): boolean {
  const near = Math.hypot(a.cx - b.cx, a.cy - b.cy) < frameW * 0.045
  const size = Math.abs(a.w - b.w) < a.w * 0.09 && Math.abs(a.h - b.h) < a.h * 0.11
  let da = Math.abs(a.angle - b.angle) % Math.PI; if (da > Math.PI / 2) da = Math.PI - da
  return near && size && da < 0.1
}
