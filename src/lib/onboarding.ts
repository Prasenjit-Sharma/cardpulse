/**
 * First run: whether to show the welcome tour (and in which wording), which one-time tip a screen may show, and the
 * small geometry the tour and tips need. Pure: storage is handed in. A storage that cannot be read counts as "seen",
 * so a phone that cannot save never loops on the tour.
 */
export const TOUR_KEY = 'cardpulse.tour'
export const TIPS_KEY = 'cardpulse.tips'
export type TipId = 'scan-modes' | 'events' | 'contact' | 'mycard'
export type TourVariant = 'new' | 'existing' | 'replay'
export type Store = Pick<Storage, 'getItem' | 'setItem'>
/** What this phone already has: features already used get no tip. */
export interface Usage { cards: number; photoCards: number; events: number; myCards: number }

/** localStorage, or a stand-in that reads as blocked when the browser refuses access to it. */
export function storage(): Store {
  try { return localStorage } catch { return { getItem: () => { throw new Error('storage blocked') }, setItem: () => {} } }
}
const read = (s: Store, k: string): string | null | undefined => { try { return s.getItem(k) } catch { return undefined } }
const write = (s: Store, k: string, v: string): void => { try { s.setItem(k, v) } catch { /* cannot save: shown again at worst */ } }
const seenTips = (s: Store): Set<TipId> | null => {
  const v = read(s, TIPS_KEY)
  if (v === undefined) return null
  try { const a = JSON.parse(v ?? '[]'); return new Set(Array.isArray(a) ? a : []) } catch { return new Set() }
}

/** Tips for features this phone has already used. Applied once, on the first tour decision. */
function used(u: Usage): TipId[] {
  const out: TipId[] = []
  if (u.photoCards > 0) out.push('scan-modes')
  if (u.events > 0) out.push('events')
  if (u.cards > 0) out.push('contact')
  if (u.myCards > 0) out.push('mycard')
  return out
}

/** The tour to show at start-up, or null. Deciding it also records as seen the tips for features already used. */
export function tourVariant(s: Store, u: Usage): TourVariant | null {
  const v = read(s, TOUR_KEY)
  if (v === undefined || v === '1') return null
  write(s, TIPS_KEY, JSON.stringify([...new Set([...(seenTips(s) ?? []), ...used(u)])]))
  return u.cards > 0 || u.events > 0 ? 'existing' : 'new'
}
export const markTourSeen = (s: Store): void => write(s, TOUR_KEY, '1')

export const tipDue = (s: Store, id: TipId): boolean => { const seen = seenTips(s); return !!seen && !seen.has(id) }
export function markTipSeen(s: Store, id: TipId): void {
  const seen = seenTips(s) ?? new Set<TipId>()
  seen.add(id)
  write(s, TIPS_KEY, JSON.stringify([...seen]))
}

/** The page on screen: the camera, a contact (read), another full-page view (a scan result, an editor), or a tab. */
export interface Screen { tour: boolean; overlay: boolean; page: string }
/** The one tip this screen may show. Never over the tour or over a sheet, dialog or full-screen layer. */
export function tipForScreen({ tour, overlay, page }: Screen): TipId | null {
  if (tour || overlay) return null
  return page === 'camera' ? 'scan-modes' : page === 'contact' ? 'contact' : page === 'exhibition' ? 'events' : page === 'mycard' ? 'mycard' : null
}

/** A horizontal drag of 48px, or a quick 24px fling, moves one screen: left (negative) forward. */
export function swipeStep(dx: number, ms: number): -1 | 0 | 1 {
  const far = Math.abs(dx) >= 48 || (Math.abs(dx) >= 24 && Math.abs(dx) / Math.max(ms, 1) > 0.5)
  return !far ? 0 : dx < 0 ? 1 : -1
}

export interface TipPlace { top: number; left: number; side: 'above' | 'below'; arrow: number }
/** Below the target when it fits, else above; centred on it, kept inside 16px gutters, never over the target. */
export function placeTip(t: { top: number; bottom: number; left: number; width: number }, b: { w: number; h: number }, v: { w: number; h: number }, gutter = 16, gap = 10): TipPlace {
  const below = t.bottom + gap + b.h <= v.h - gutter
  const centre = t.left + t.width / 2
  const left = Math.min(Math.max(centre - b.w / 2, gutter), v.w - gutter - b.w)
  return { top: below ? t.bottom + gap : t.top - gap - b.h, left, side: below ? 'below' : 'above', arrow: Math.min(Math.max(centre - left, 14), b.w - 14) }
}

export type TourArt = 'mark' | 'cards' | 'event' | 'follow'
export const TOUR: { art: TourArt; title: (v: TourVariant) => string; text: string }[] = [
  { art: 'mark', title: (v) => (v === 'existing' ? 'CardPulse is now Pulse' : 'Meet Pulse'), text: 'Business cards become contacts you can call or WhatsApp, in seconds. The pulse of your network.' },
  { art: 'cards', title: () => 'Several cards, one photo', text: 'Lay a stack of cards flat and take one picture. Everyone on them becomes a contact.' },
  { art: 'event', title: () => 'Built for expos and exhibitions', text: 'Create an event and every card you scan is filed under it. Duplicates are flagged, and you export each event when it ends.' },
  { art: 'follow', title: () => "Follow up while it's warm", text: 'Call, WhatsApp or save to your phone in one tap. Pulse Brief researches the person before you call.' },
]
export const lastAction = (v: TourVariant): string => (v === 'new' ? 'Scan your first card' : v === 'existing' ? "Let's go" : 'Done')

export const TIP_TEXT: Record<TipId, string> = {
  'scan-modes': 'Card, 2-sided, or Group: lay many cards flat for one photo.',
  events: 'Create an event, and every card you scan is filed under it, ready to export.',
  contact: 'Call, WhatsApp or save to your phone in one tap. Brief researches them before you call.',
  mycard: 'Make your digital card. At your stall, visitors scan its QR to leave their details.',
}
