import { emptyContact, type Contact } from './types.ts'

// What a scanned QR code holds, in the forms business cards actually use: a vCard (most printed cards and every
// CardPulse "Just share" QR), a MeCard (older Android cards), a CardPulse card link ("Collect leads"), a phone number
// or email, or just a website. Pure: no network, no DOM.

export type QrResult =
  | { kind: 'contact'; contact: Contact; source: 'vcard' | 'mecard' | 'tel' | 'mailto' }
  | { kind: 'cardpulse'; slug: string; eventId?: string; eventName?: string }
  | { kind: 'link'; url: string }
  | { kind: 'text'; text: string }

const BS = String.fromCharCode(92)
/** vCard/MeCard value unescaping: \n, \, \; \: and \\ */
function unescape(v: string): string {
  let out = ''
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]!
    if (ch === BS && i + 1 < v.length) { const n = v[++i]!; out += n === 'n' || n === 'N' ? '\n' : n }
    else out += ch
  }
  return out
}
/** Splits on a separator that is not escaped. */
function splitUnescaped(v: string, sep: string): string[] {
  const out: string[] = []
  let cur = ''
  for (let i = 0; i < v.length; i++) {
    const ch = v[i]!
    if (ch === BS && i + 1 < v.length) { cur += ch + v[++i]; continue }
    if (ch === sep) { out.push(cur); cur = ''; continue }
    cur += ch
  }
  out.push(cur)
  return out
}
function decodeQP(v: string): string {
  const bytes: number[] = []
  const s = v.replace(/=\r?\n/g, '')
  for (let i = 0; i < s.length; i++) {
    if (s[i] === '=' && /^[0-9A-F]{2}$/i.test(s.slice(i + 1, i + 3))) { bytes.push(parseInt(s.slice(i + 1, i + 3), 16)); i += 2 }
    else bytes.push(s.charCodeAt(i))
  }
  try { return new TextDecoder().decode(new Uint8Array(bytes)) } catch { return v }
}
const uniq = (xs: string[]) => [...new Set(xs.map((x) => x.trim()).filter(Boolean))]
const isSocial = (u: string) => /linkedin\.com|twitter\.com|x\.com\/|instagram\.com|facebook\.com|wa\.me|youtube\.com|github\.com/i.test(u)

export function parseVCard(text: string): Contact | null {
  if (!/BEGIN:VCARD/i.test(text)) return null
  const lines = text.replace(/\r\n[ \t]/g, '').replace(/\n[ \t]/g, '').split(/\r?\n/)
  const c = emptyContact()
  let n = ''
  const phones: string[] = [], emails: string[] = [], urls: string[] = [], social: string[] = []
  for (const line of lines) {
    const colon = line.indexOf(':')
    if (colon < 0) continue
    const head = line.slice(0, colon)
    let value = line.slice(colon + 1)
    const [nameRaw, ...params] = head.split(';')
    const name = nameRaw!.replace(/^item\d+\./i, '').toUpperCase()
    if (params.some((p) => /QUOTED-PRINTABLE/i.test(p))) value = decodeQP(value)
    const v = () => unescape(value).trim()
    switch (name) {
      case 'FN': c.name = v(); break
      case 'N': n = splitUnescaped(value, ';').map(unescape).map((x) => x.trim()).filter(Boolean).slice(0, 3).reverse().join(' '); break
      case 'ORG': c.company = unescape(splitUnescaped(value, ';')[0] ?? '').trim(); break
      case 'TITLE': case 'ROLE': if (!c.title) c.title = v(); break
      case 'TEL': phones.push(v().replace(/^tel:/i, '')); break
      case 'EMAIL': emails.push(v().replace(/^mailto:/i, '')); break
      case 'URL': (isSocial(v()) ? social : urls).push(v()); break
      case 'X-SOCIALPROFILE': social.push(v()); break
      case 'ADR': if (!c.address) c.address = splitUnescaped(value, ';').map(unescape).map((x) => x.trim()).filter(Boolean).join(', '); break
      case 'NOTE': c.note = v(); break
    }
  }
  if (!c.name) c.name = n
  c.phones = uniq(phones); c.emails = uniq(emails); c.website = urls[0] ?? ''; c.social = uniq([...urls.slice(1), ...social])
  return c.name || c.company || c.phones.length || c.emails.length ? c : null
}

export function parseMeCard(text: string): Contact | null {
  if (!/^MECARD:/i.test(text.trim())) return null
  const c = emptyContact()
  const phones: string[] = [], emails: string[] = []
  for (const part of splitUnescaped(text.trim().slice(7), ';')) {
    const i = part.indexOf(':')
    if (i < 0) continue
    const key = part.slice(0, i).toUpperCase(), value = unescape(part.slice(i + 1)).trim()
    if (!value) continue
    if (key === 'N') c.name = value.includes(',') ? value.split(',').map((x) => x.trim()).reverse().join(' ') : value
    else if (key === 'TEL') phones.push(value)
    else if (key === 'EMAIL') emails.push(value)
    else if (key === 'ORG') c.company = value
    else if (key === 'TITLE') c.title = value
    else if (key === 'URL') c.website = value
    else if (key === 'ADR') c.address = value.split(',').map((x) => x.trim()).filter(Boolean).join(', ')
    else if (key === 'NOTE') c.note = value
  }
  c.phones = uniq(phones); c.emails = uniq(emails)
  return c.name || c.company || c.phones.length || c.emails.length ? c : null
}

/** A CardPulse card link (the "Collect leads" QR): the app's own address with ?card=<slug>. */
export function parseCardLink(text: string): { slug: string; eventId?: string; eventName?: string } | null {
  let u: URL
  try { u = new URL(text.trim()) } catch { return null }
  const slug = u.searchParams.get('card')
  if (!slug || !/^[0-9A-Za-z]{4,16}$/.test(slug)) return null
  if (!/(^|\.)github\.io$|^localhost$|cardpulse/i.test(u.hostname)) return null
  const eventId = u.searchParams.get('event') ?? undefined, eventName = u.searchParams.get('eventName') ?? undefined
  return { slug, ...(eventId ? { eventId } : {}), ...(eventName ? { eventName } : {}) }
}

export function parseQr(raw: string): QrResult {
  const text = raw.trim()
  const v = parseVCard(text); if (v) return { kind: 'contact', contact: v, source: 'vcard' }
  const m = parseMeCard(text); if (m) return { kind: 'contact', contact: m, source: 'mecard' }
  const link = parseCardLink(text); if (link) return { kind: 'cardpulse', ...link }
  if (/^tel:/i.test(text)) return { kind: 'contact', contact: { ...emptyContact(), phones: [text.slice(4).trim()] }, source: 'tel' }
  if (/^mailto:/i.test(text)) return { kind: 'contact', contact: { ...emptyContact(), emails: [decodeURIComponent(text.slice(7).split('?')[0]!).trim()] }, source: 'mailto' }
  if (/^https?:\/\//i.test(text)) return { kind: 'link', url: text }
  return { kind: 'text', text }
}
