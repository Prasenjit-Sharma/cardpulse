import { displayName, type NameFormat } from './naming.ts'
import { splitAddress } from './address.ts'
import { androidPhoneType, rankedPhones, vcardTelType } from './phones.ts'
import type { Contact } from './types'
import { getNative, notify, saveBlob, shareNav, type ContactFields } from './platform.ts'

/** wa.me wants country code + number, digits only. Bare Indian numbers get 91. */
export function waNumber(phone: string): string {
  const d = phone.replace(/\D/g, '')
  if (d.length === 10) return '91' + d
  if (d.length === 11 && d.startsWith('0')) return '91' + d.slice(1)
  return d
}
export const telHref = (phone: string) => 'tel:' + phone.replace(/[^\d+]/g, '')

const esc = (v: string) => v.replace(/([,;\\])/g, '\\$1').replace(/\n/g, '\\n')

export function toVCard(c: Contact, note = '', fmt: NameFormat = 'name'): string {
  const disp = displayName(c, fmt)
  // With the company folded into the name, keep it all in the given-name field so every Contacts app shows it unchanged.
  let nLine: string
  if (disp === c.name.trim() || !c.name.trim()) {
    const parts = c.name.trim().split(/\s+/)
    const last = parts.length > 1 ? parts.pop()! : ''
    nLine = `N:${esc(last)};${esc(parts.join(' '))};;;`
  } else nLine = `N:;${esc(disp)};;;`
  const lines = ['BEGIN:VCARD', 'VERSION:3.0', nLine, `FN:${esc(disp)}`]
  if (c.company) lines.push(`ORG:${esc(c.company)}`)
  if (c.title) lines.push(`TITLE:${esc(c.title)}`)
  const phones = rankedPhones(c)
  for (const p of phones) lines.push(`TEL;TYPE=${vcardTelType(p.kind, p.main && phones.length > 1)}:${p.number.replace(/[^\d+]/g, '')}`)
  for (const e of c.emails) lines.push(`EMAIL;TYPE=WORK:${e}`)
  if (c.website) lines.push(`URL:${c.website}`)
  if (c.address) {
    const a = splitAddress(c.address)
    lines.push(`ADR;TYPE=WORK:;;${esc(a.street)};${esc(a.city)};${esc(a.region)};${esc(a.postcode)};${esc(a.country)}`)
  }
  if (note) lines.push(`NOTE:${esc(note)}`)
  lines.push('END:VCARD')
  return lines.join('\r\n')
}

/**
 * A file to keep: a download in a browser, the share sheet in the app (the WebView cannot download). A failure is shown
 * to the user as a notice rather than lost; closing the share sheet is not a failure.
 */
export async function download(name: string, text: string, type: string): Promise<void> {
  try { await saveBlob(name, new Blob([text], { type })) }
  catch (e) { if ((e as Error)?.name !== 'AbortError') notify('Could not save the file. Try again.') }
}

/* ---------- Save to phone / Share ---------- */

/** Plain-text version of a contact: readable in any chat, SMS or email. */
export function contactText(c: Contact, note = ''): string {
  return [c.name, [c.title, c.company].filter(Boolean).join(', '), ...rankedPhones(c).map((p) => p.number), ...c.emails, c.website, c.address, note].filter(Boolean).join('\n')
}

export interface ActionEnv {
  nav: {
    share?: (data: { title?: string; text?: string; files?: File[] }) => Promise<void>
    canShare?: (data: { files?: File[] }) => boolean
    clipboard?: { writeText: (t: string) => Promise<void> }
  }
  download: (name: string, text: string, type: string) => void
  log?: (msg: string) => void
}

export const browserEnv = (log?: (m: string) => void): ActionEnv => ({ nav: shareNav() as ActionEnv['nav'], download, log })

export type ActionResult = 'shared' | 'copied' | 'downloaded' | 'cancelled'
export interface ActionOutcome { result: ActionResult; /** Why the share sheet could not be used, if it could not. */ problem?: string }

/** Contact-file MIME types, most widely supported first. */
const VCARD_TYPES = ['text/x-vcard', 'text/vcard']
const errName = (e: unknown) => (e instanceof Error ? e.name : String(e))

/**
 * Hand a vCard to the system. The share sheet lists Contacts, WhatsApp, Drive, email and more, so it is tried first.
 * If it cannot be used the reason is reported and the details are copied or the file downloaded: never silence.
 * NOTE: browser methods must be called ON `navigator` (a detached canShare throws "Illegal invocation").
 */
export async function shareVcf(name: string, vcf: string, title: string, text: string | undefined, env: ActionEnv, textOnlyFallback = true): Promise<ActionOutcome> {
  const nav = env.nav
  let problem: string | undefined

  // Android's own contact files are text/x-vcard (what Covve sends), which is what Contacts, Truecaller and others
  // register for. Some browsers only allow text/vcard, so try both and use whichever the browser will share.
  let file = new File([vcf], name, { type: VCARD_TYPES[0] })
  let canFiles = false
  for (const type of VCARD_TYPES) {
    const candidate = new File([vcf], name, { type })
    try { if (nav.canShare?.({ files: [candidate] })) { file = candidate; canFiles = true; break } }
    catch (e) { problem = `canShare: ${errName(e)}`; env.log?.(`share: ${problem}`); break }
  }
  env.log?.(`share: hasShare=${typeof nav.share === 'function'} canShareFiles=${canFiles} type=${file.type}`)

  if (typeof nav.share === 'function' && canFiles) {
    // the file travels alone: Android puts any text beside a text/x-vcard file in EXTRA_TEXT, and WhatsApp then reads
    // that text as the vCard ("The format of this vcard is not supported"). Text is only the fallback below.
    try { await nav.share({ files: [file], title }); return { result: 'shared' } }
    catch (e) { if (errName(e) === 'AbortError') return { result: 'cancelled' }; problem = `share file: ${errName(e)}`; env.log?.(`share: ${problem}`) }
  }
  if (typeof nav.share === 'function' && text && textOnlyFallback) {
    try { await nav.share({ title, text }); return { result: 'shared' } }
    catch (e) { if (errName(e) === 'AbortError') return { result: 'cancelled' }; problem = `share text: ${errName(e)}`; env.log?.(`share: ${problem}`) }
  }
  if (typeof nav.share !== 'function') problem ??= 'no share sheet in this browser'
  if (text && nav.clipboard) {
    try { await nav.clipboard.writeText(text); return { result: 'copied', problem } } catch (e) { env.log?.(`clipboard: ${errName(e)}`) }
  }
  env.download(name, vcf, VCARD_TYPES[0]!)
  return { result: 'downloaded', problem }
}

/** The contact as the phone's new-contact screen takes it: the Saved as name, numbers main first with their types. */
export function contactFields(c: Contact, note: string, fmt: NameFormat): ContactFields {
  return {
    name: displayName(c, fmt), company: c.company, title: c.title,
    phones: rankedPhones(c).map((p) => ({ number: p.number, type: androidPhoneType(p.kind) })),
    emails: c.emails, website: c.website, address: c.address, note,
  }
}

/**
 * "Save to phone". In the app: the phone's own new-contact screen, filled in, where the user picks Google, Outlook or the
 * phone and saves; no file changes hands. In a browser: the share sheet with the contact file, else a download.
 */
export async function saveToPhone(c: Contact, note: string, env: ActionEnv = browserEnv(), fmt: NameFormat = 'name'): Promise<ActionOutcome> {
  const n = getNative()
  if (n?.saveContact) { await n.saveContact(contactFields(c, note, fmt)); return { result: 'shared' } }
  return shareVcf(`${c.name || 'contact'}.vcf`, toVCard(c, note, fmt), displayName(c, fmt), undefined, env, false)
}

/** "Share contact": the share sheet with the contact card and readable text. */
export function shareContact(c: Contact, note: string, env: ActionEnv = browserEnv(), fmt: NameFormat = 'name'): Promise<ActionOutcome> {
  return shareVcf(`${c.name || 'contact'}.vcf`, toVCard(c, note, fmt), displayName(c, fmt), contactText(c, note), env)
}
