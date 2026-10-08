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
/** Taking the tour again from Settings brings every tip back. */
export const resetTips = (s: Store): void => write(s, TIPS_KEY, '[]')
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

export interface CoachLayout { above: boolean; msgTop: number; arrow: { x1: number; y1: number; x2: number; y2: number } }
/**
 * Where a coach mark's message goes: above a target in the lower half of the screen, below one in the upper half, with
 * room between for the hand-drawn arrow. The arrow runs from the message's edge to just off the target's middle.
 */
export function coachLayout(t: { top: number; bottom: number; left: number; width: number }, v: { w: number; h: number }, msgH: number, gap = 96, inset = 72): CoachLayout {
  const above = (t.top + t.bottom) / 2 > v.h / 2
  const msgTop = above ? Math.max(inset, t.top - gap - msgH) : Math.min(v.h - msgH - 24, t.bottom + gap)
  const x2 = Math.min(Math.max(t.left + t.width / 2, t.left + 8), t.left + t.width - 8)
  return {
    above, msgTop,
    arrow: { x1: v.w / 2 - 36, y1: above ? msgTop + msgH + 10 : msgTop - 10, x2, y2: above ? t.top - 10 : t.bottom + 10 },
  }
}

/** A title's hand-written phrase is marked with asterisks: 'Several cards, *one photo*' gives [before, phrase, after]. */
export function handParts(title: string): { text: string; hand: boolean }[] {
  return title.split(/\*(.+?)\*/).map((text, i) => ({ text, hand: i % 2 === 1 })).filter((p) => p.text)
}

export function splitHand(title: string): [string, string, string] {
  const m = /^(.*?)\*(.+?)\*(.*)$/.exec(title)
  return m ? [m[1], m[2], m[3]] : [title, '', '']
}

export type TourArt = 'mark' | 'cards' | 'leads' | 'card' | 'brief'
/** The welcome tour. The words between asterisks are hand-written (Caveat) in the brand colour. */
export const TOUR: { art: TourArt; title: (v: TourVariant) => string; text: string }[] = [
  { art: 'mark', title: () => 'Meet *Pulse*', text: 'Business cards become contacts you can call or WhatsApp, in seconds. The pulse of your network.' },
  { art: 'cards', title: () => 'Several cards, *one photo*', text: 'Lay a stack of cards flat and take one picture. Everyone on them becomes a contact.' },
  { art: 'leads', title: () => '*Leads* walk in. *Brochures* walk out.', text: 'At your stall, visitors scan your QR, leave their details and get your brochure. Scan with an expo open and every card is filed under it.' },
  { art: 'card', title: () => 'Your card, *one scan away*', text: 'Make your digital card and share it on WhatsApp. At your stall, visitors scan its QR to leave their details.' },
  { art: 'brief', title: () => 'Never go into a call *cold*', text: 'Pulse Brief reads up on the person and their company, and gives you conversation starters before you call or WhatsApp.' },
]
export const lastAction = (v: TourVariant): string => (v === 'new' ? 'Scan your first card' : v === 'existing' ? "Let's go" : 'Done')

export const TIP_TEXT: Record<TipId, { line: string; sub: string }> = {
  'scan-modes': { line: 'Card, 2-sided or Group', sub: 'Lay many cards flat and take one photo.' },
  events: { line: 'Create an event first', sub: 'Every card you scan is filed under it, ready to export.' },
  contact: { line: 'Call or WhatsApp anyone in one tap', sub: 'Pulse Brief researches them before you call.' },
  mycard: { line: 'Make your digital card', sub: 'At your stall, visitors scan its QR to leave their details.' },
}
