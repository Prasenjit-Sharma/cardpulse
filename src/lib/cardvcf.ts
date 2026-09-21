import type { MyCard } from './mycards.ts'

export type Dropped = 'social' | 'address' | 'emails' | 'phones'
const esc = (s: string) => s.replace(/\\/g, '\\\\').replace(/\r?\n/g, '\\n').replace(/;/g, '\;').replace(/,/g, '\\,')
const bytes = (s: string) => new TextEncoder().encode(s).length

/** Someone can be reached from this card: it has at least one phone or email. */
export const reachable = (c: MyCard) => c.phones.length > 0 || c.emails.length > 0

function lines(c: MyCard, keep: { social: boolean; address: boolean; emails: number; phones: number }): string[] {
  const parts = c.name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  const out = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(parts.join(' '))};;;`, `FN:${esc(c.name)}`]
  if (c.company) out.push(`ORG:${esc(c.company)}`)
  if (c.title) out.push(`TITLE:${esc(c.title)}`)
  for (const p of c.phones.slice(0, keep.phones)) out.push(`TEL;TYPE=CELL:${p.replace(/[^\d+]/g, '')}`)
  for (const e of c.emails.slice(0, keep.emails)) out.push(`EMAIL;TYPE=WORK:${e}`)
  if (c.website) out.push(`URL:${c.website}`)
  if (keep.address && c.address) out.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`)
  if (keep.social) for (const s of c.social) out.push(`X-SOCIALPROFILE:${s}`)
  out.push('END:VCARD')
  return out
}

/** The text the QR carries. Kept small so it scans fast: optional parts are dropped, in a fixed order, until it fits. */
export function buildCardVcf(c: MyCard, maxBytes = 600): { text: string; dropped: Dropped[] } {
  const keep = { social: true, address: true, emails: 3, phones: 3 }
  const dropped: Dropped[] = []
  const text = () => lines(c, keep).join('\r\n')
  const steps: [Dropped, () => boolean][] = [
    ['social', () => { if (!keep.social || !c.social.length) return false; keep.social = false; return true }],
    ['address', () => { if (!keep.address || !c.address) return false; keep.address = false; return true }],
    ['emails', () => { if (keep.emails <= 1 || c.emails.length <= 1) return false; keep.emails = 1; return true }],
    ['phones', () => { if (keep.phones <= 1 || c.phones.length <= 1) return false; keep.phones = 1; return true }],
  ]
  for (const [name, drop] of steps) {
    if (bytes(text()) <= maxBytes) break
    if (drop()) dropped.push(name)
  }
  return { text: text(), dropped }
}
