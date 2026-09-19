export type Pt = [number, number]
/** Corners in reading order: top-left, top-right, bottom-right, bottom-left. */
export type Quad = [Pt, Pt, Pt, Pt]

/** Projective map from the unit square to a quad (Heckbert). Returns [a,b,c,d,e,f,g,h]. */
export function unitToQuad(q: Quad): number[] {
  const [[x0, y0], [x1, y1], [x2, y2], [x3, y3]] = q
  const sx = x0 - x1 + x2 - x3, sy = y0 - y1 + y2 - y3
  const dx1 = x1 - x2, dx2 = x3 - x2, dy1 = y1 - y2, dy2 = y3 - y2
  const den = dx1 * dy2 - dx2 * dy1
  const g = den === 0 ? 0 : (sx * dy2 - sy * dx2) / den
  const h = den === 0 ? 0 : (dx1 * sy - dy1 * sx) / den
  return [x1 - x0 + g * x1, x3 - x0 + h * x3, x0, y1 - y0 + g * y1, y3 - y0 + h * y3, y0, g, h]
}

export const mapUnit = (m: number[], u: number, v: number): Pt => {
  const w = m[6]! * u + m[7]! * v + 1
  return [(m[0]! * u + m[1]! * v + m[2]!) / w, (m[3]! * u + m[4]! * v + m[5]!) / w]
}

/** Inverse: where in the unit square does image point (x, y) fall? (Used to synthesise test images.) */
export function quadToUnit(q: Quad, x: number, y: number): Pt {
  const [a, b, c, d, e, f, g, h] = unitToQuad(q) as [number, number, number, number, number, number, number, number]
  // Invert the 3x3 [[a,b,c],[d,e,f],[g,h,1]].
  const det = a * (e - f * h) - b * (d - f * g) + c * (d * h - e * g)
  const i0 = (e - f * h) / det, i1 = (c * h - b) / det, i2 = (b * f - c * e) / det
  const i3 = (f * g - d) / det, i4 = (a - c * g) / det, i5 = (c * d - a * f) / det
  const i6 = (d * h - e * g) / det, i7 = (b * g - a * h) / det, i8 = (a * e - b * d) / det
  const w = i6 * x + i7 * y + i8
  return [(i0 * x + i1 * y + i2) / w, (i3 * x + i4 * y + i5) / w]
}

const dist = (a: Pt, b: Pt) => Math.hypot(a[0] - b[0], a[1] - b[1])

/** Natural size of the card in the picture: average of opposite edges. */
export function quadSize(q: Quad): { w: number; h: number } {
  return { w: (dist(q[0], q[1]) + dist(q[3], q[2])) / 2, h: (dist(q[0], q[3]) + dist(q[1], q[2])) / 2 }
}

/** Grow a quad outward from its centre (breathing room around the card). */
export function growQuad(q: Quad, by: number): Quad {
  const cx = (q[0][0] + q[1][0] + q[2][0] + q[3][0]) / 4, cy = (q[0][1] + q[1][1] + q[2][1] + q[3][1]) / 4
  return q.map(([x, y]) => [cx + (x - cx) * (1 + by), cy + (y - cy) * (1 + by)] as Pt) as Quad
}

/**
 * Flatten the card: samples `src` (RGBA, sw x sh) through the quad into an outW x outH rectangle, with bilinear filtering.
 * Fixes tilt AND perspective (a phone held at an angle).
 */
export function warpQuad(src: Uint8ClampedArray, sw: number, sh: number, q: Quad, outW: number, outH: number): Uint8ClampedArray<ArrayBuffer> {
  const m = unitToQuad(q)
  const out = new Uint8ClampedArray(new ArrayBuffer(outW * outH * 4))
  for (let j = 0; j < outH; j++) {
    const v = (j + 0.5) / outH
    for (let i = 0; i < outW; i++) {
      const [x, y] = mapUnit(m, (i + 0.5) / outW, v)
      const fx = Math.min(sw - 1.001, Math.max(0, x - 0.5)), fy = Math.min(sh - 1.001, Math.max(0, y - 0.5))
      const x0 = fx | 0, y0 = fy | 0, tx = fx - x0, ty = fy - y0
      const p = (y0 * sw + x0) * 4, o = (j * outW + i) * 4
      for (let ch = 0; ch < 4; ch++) {
        const a = src[p + ch]!, b = src[p + 4 + ch]!, c = src[p + sw * 4 + ch]!, d = src[p + sw * 4 + 4 + ch]!
        out[o + ch] = a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty
      }
    }
  }
  return out
}
