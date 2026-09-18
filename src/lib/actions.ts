import type { Contact } from './types'

/** wa.me wants country code + number, digits only. Bare Indian numbers get 91. */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return '91' + d
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1)
  return d
}
export const telHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '')

const esc = (v: string) => v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

export function toVCard(c: Contact, note = ''): string {
  const parts = c.name.trim().split(/\s+/)
  const last = parts.length > 1 ? parts.pop()! : ''
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', `N:${esc(last)};${esc(parts.join(' '))};;;`, `FN:${esc(c.name)}`]
  if (c.company) lines.push(`ORG:${esc(c.company)}`)
  if (c.title) lines.push(`TITLE:${esc(c.title)}`)
  for (const p of c.phones) lines.push(`TEL;TYPE=CELL:${p.replace(/[^\d+]/g, '')}`)
  for (const e of c.emails) lines.push(`EMAIL;TYPE=WORK:${e}`)
  if (c.website) lines.push(`URL:${c.website}`)
  if (c.address) lines.push(`ADR;TYPE=WORK:;;${esc(c.address)};;;;`)
  if (note) lines.push(`NOTE:${esc(note)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

export function download(name: string, text: string, type: string) {
  const a = document.createElement('a')
  a.href = URL.createObjectURL(new Blob([text], { type }))
  a.download = name
  a.click()
  setTimeout(() => URL.revokeObjectURL(a.href), 1000)
}
