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

/* ---------- Save to phone / Share ---------- */

/** Plain-text version of a contact: readable in any chat, SMS or email. */
export function contactText(c: Contact, note = ''): string {
  return [c.name, [c.title, c.company].filter(Boolean).join(', '), ...c.phones, ...c.emails, c.website, c.address, note].filter(Boolean).join('\n')
}

/**
 * Android "new contact" intent: opens the phone's Contacts app with the details filled in, and lets the user pick
 * where to save (Google account, phone, SIM). Keys are Android's ContactsContract.Intents.Insert extras.
 */
export function androidInsertIntent(c: Contact, note = ''): string {
  const extra = (k: string, v: string | undefined) => (v ? `S.${k}=${encodeURIComponent(v)};` : '')
  const notes = [note, c.website && `Web: ${c.website}`, c.gstin && `GSTIN: ${c.gstin}`].filter(Boolean).join('\n')
  return 'intent:#Intent;action=android.intent.action.INSERT;type=vnd.android.cursor.dir/contact;'
    + extra('name', c.name) + extra('company', c.company) + extra('job_title', c.title)
    + extra('phone', c.phones[0]) + extra('secondary_phone', c.phones[1]) + extra('tertiary_phone', c.phones[2])
    + extra('email', c.emails[0]) + extra('secondary_email', c.emails[1])
    + extra('postal', c.address) + extra('notes', notes)
    + 'end'
}

export interface ActionEnv {
  ua: string
  navigate: (url: string) => void
  nav: {
    share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>
    canShare?: (data: { files?: File[] }) => boolean
    clipboard?: { writeText: (t: string) => Promise<void> }
  }
  download: (name: string, text: string, type: string) => void
}

export const browserEnv = (): ActionEnv => ({
  ua: navigator.userAgent,
  navigate: (url) => { window.location.href = url },
  nav: navigator as unknown as ActionEnv['nav'],
  download,
})

export type ActionResult = 'contacts' | 'shared' | 'copied' | 'downloaded' | 'cancelled'

/**
 * Hand a vCard file to the system. Tries the share sheet (which lists Contacts, WhatsApp, Drive, email…), and only
 * downloads the file as a last resort.
 */
export async function shareVcf(name: string, vcf: string, title: string, text: string | undefined, env: ActionEnv): Promise<ActionResult> {
  const file = new File([vcf], name, { type: 'text/vcard' })
  const { share, canShare } = env.nav
  if (share && canShare?.({ files: [file] })) {
    try { await share.call(env.nav, { files: [file], title, ...(text ? { text } : {}) }); return 'shared' } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' }
  }
  if (share && text) {
    try { await share.call(env.nav, { title, text }); return 'shared' } catch (e) { if ((e as Error).name === 'AbortError') return 'cancelled' }
  }
  if (text && env.nav.clipboard) {
    try { await env.nav.clipboard.writeText(text); return 'copied' } catch { /* fall through to download */ }
  }
  env.download(name, vcf, 'text/vcard')
  return 'downloaded'
}

/** "Save to phone": on Android opens the Contacts app pre-filled (you choose the account); elsewhere the share sheet. */
export async function saveToPhone(c: Contact, note: string, env: ActionEnv = browserEnv()): Promise<ActionResult> {
  if (/android/i.test(env.ua)) { env.navigate(androidInsertIntent(c, note)); return 'contacts' } // must stay synchronous: needs the tap's user gesture
  return shareVcf(`${c.name || 'contact'}.vcf`, toVCard(c, note), c.name, undefined, env)
}

/** "Share contact": the share sheet with the contact card and readable text. Never fails silently. */
export async function shareContact(c: Contact, note: string, env: ActionEnv = browserEnv()): Promise<ActionResult> {
  return shareVcf(`${c.name || 'contact'}.vcf`, toVCard(c, note), c.name, contactText(c, note), env)
}
