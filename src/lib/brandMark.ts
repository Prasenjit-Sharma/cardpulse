/**
 * The Pulse mark on a 32-unit grid: a scan frame around a beat whose peaks are people. The one source for the in-app
 * Logo and for scripts/make-icons.mjs, so the app icon and the logo inside the app cannot drift apart.
 */
export const MARK = {
  frame: 'M6.5 11.5v-3a2 2 0 0 1 2-2h3M20.5 6.5h3a2 2 0 0 1 2 2v3M25.5 20.5v3a2 2 0 0 1-2 2h-3M11.5 25.5h-3a2 2 0 0 1-2-2v-3',
  beat: 'M9 16.5h3l1.9-4.6 3 8.8 2-5.2 1.3 1h3.8',
  dots: [[13.9, 11.9], [16.9, 20.7], [18.9, 15.5]] as [number, number][],
  dotR: 1.85,
  frameW: 2,
  beatW: 1.8,
  rx: 7.5,
  indigoLite: '#5A4FE0',
  indigo: '#3B2FC9',
  teal: '#5DD6C8',
  white: '#FFFFFF',
}

/** Farthest reach of the artwork from the tile's centre (16,16): a frame corner's arc centre, its radius, half the stroke. */
export const ART_RADIUS = 7.5 * Math.SQRT2 + 2 + MARK.frameW / 2
/** Android adaptive layers are 108 dp, of which the launcher shows the middle 72: the 32-unit tile maps onto those 72. */
export const ADAPTIVE_SCALE = 72 / 32
/** The maskable PWA icon shrinks the artwork so it sits inside the 80% circle any mask keeps. */
export const MASKABLE_ART = 0.85

type Colours = { frame: string; beat: string; dots: string }
const COLOURS: Colours = { frame: MARK.white, beat: MARK.teal, dots: MARK.white }

const art = (c: Colours) =>
  `<path d="${MARK.frame}" fill="none" stroke="${c.frame}" stroke-width="${MARK.frameW}" stroke-linecap="round"/>` +
  `<path d="${MARK.beat}" fill="none" stroke="${c.beat}" stroke-width="${MARK.beatW}" stroke-linecap="round" stroke-linejoin="round"/>` +
  MARK.dots.map(([x, y]) => `<circle cx="${x}" cy="${y}" r="${MARK.dotR}" fill="${c.dots}"/>`).join('')

/** The mark on its indigo tile. `square` is for the stores, which round icons themselves; `art` scales the artwork about the centre. */
export function markSvg({ size, tile = 'rounded', art: k = 1 }: { size: number; tile?: 'rounded' | 'square' | 'circle'; art?: number }): string {
  const shape = tile === 'circle'
    ? '<circle cx="16" cy="16" r="16" fill="url(#pulse-tile)"/>'
    : `<rect width="32" height="32" rx="${tile === 'rounded' ? MARK.rx : 0}" fill="url(#pulse-tile)"/>`
  const body = k === 1 ? art(COLOURS) : `<g transform="translate(16 16) scale(${k}) translate(-16 -16)">${art(COLOURS)}</g>`
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 32 32">` +
    `<defs><linearGradient id="pulse-tile" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${MARK.indigoLite}"/><stop offset="1" stop-color="${MARK.indigo}"/></linearGradient></defs>` +
    `${shape}${body}</svg>`
}

/** An Android adaptive-icon layer: the artwork alone on a transparent 108 dp canvas. `mono` draws it in one colour for the themed icon. */
export function layerSvg({ size, mono }: { size: number; mono?: string }): string {
  const c = mono ? { frame: mono, beat: mono, dots: mono } : COLOURS
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 108 108">` +
    `<g transform="translate(18 18) scale(${ADAPTIVE_SCALE})">${art(c)}</g></svg>`
}
