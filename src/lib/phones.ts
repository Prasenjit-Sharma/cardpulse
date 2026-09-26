import type { Contact } from './types'

/** The labels Google and Apple Contacts both understand. */
export type PhoneKind = 'mobile' | 'work' | 'home' | 'main' | 'fax' | 'other'

export const PHONE_KINDS: { value: PhoneKind; label: string }[] = [
  { value: 'mobile', label: 'Mobile' }, { value: 'work', label: 'Work' }, { value: 'home', label: 'Home' },
  { value: 'main', label: 'Main' }, { value: 'fax', label: 'Fax' }, { value: 'other', label: 'Other' },
]
export const kindLabel = (k: PhoneKind) => PHONE_KINDS.find((x) => x.value === k)!.label

/** A number's identity, whatever way it was typed: +91 98250 07291, 098250 07291 and 9825007291 are one number. */
export const phoneKey = (p: string) => p.replace(/\D/g, '').replace(/^(91)?0?(?=\d{10}$)/, '')

/** Written the Indian way: +91, 91, a trunk 0, or a bare ten digits. */
const indian = (p: string) => {
  const d = p.replace(/\D/g, '')
  return d.length === 10 || (d.length === 11 && d.startsWith('0')) || (d.length === 12 && d.startsWith('91'))
}
/**
 * An Indian landline: STD code plus subscriber number, ten digits. Mobiles open with 6–9 and no STD code opens with 9, so
 * 1–5 is a landline and 9 a mobile. 6, 7 and 8 open both (079 Ahmedabad, 080 Bengaluru), and there the way it is written
 * decides: a landline sets its 2–4 digit code apart, and the subscriber number after it opens with 2–5.
 */
export function isIndianLandline(p: string): boolean {
  if (!indian(p)) return false
  const key = phoneKey(p)
  if (/^[1-5]/.test(key)) return true
  if (key.startsWith('9')) return false
  return /^\(?0?(\d{2,4})\)?[\s-]+[2-5]/.test(p.trim().replace(/^\+?\s*91[\s-]*/, ''))
}

/** What the number most likely is, from its shape. A card prints landlines next to mobiles with nothing to tell them apart. */
export function guessKind(p: string): PhoneKind {
  if (!indian(p)) return 'mobile'
  return isIndianLandline(p) ? 'work' : 'mobile'
}

export const kindOf = (c: Pick<Contact, 'phoneKinds'>, p: string): PhoneKind => c.phoneKinds?.[phoneKey(p)] ?? guessKind(p)

/** A landline or a fax cannot take a WhatsApp message. */
export const canWhatsApp = (p: string, kind: PhoneKind) => kind !== 'fax' && !isIndianLandline(p)

export interface RankedPhone { number: string; kind: PhoneKind; main: boolean }

/**
 * The contact's numbers, the one to call first at the top: the number the user made main, else the first mobile, then the
 * rest as printed. `main` marks that top number. The stored list keeps its printed order, so accuracy is never affected.
 */
export function rankedPhones(c: Pick<Contact, 'phones' | 'phoneKinds' | 'mainPhone'>): RankedPhone[] {
  const all = c.phones.map((number, i) => ({ number, kind: kindOf(c, number), i }))
  const pinned = c.mainPhone ? all.find((x) => phoneKey(x.number) === c.mainPhone) : undefined
  const rank = (x: (typeof all)[number]) => (x === pinned ? 0 : x.kind === 'mobile' ? 1 : 2)
  return [...all].sort((a, b) => rank(a) - rank(b) || a.i - b.i).map((x, n) => ({ number: x.number, kind: x.kind, main: n === 0 }))
}

/** The number Call dials. */
export const callNumber = (c: Pick<Contact, 'phones' | 'phoneKinds' | 'mainPhone'>) => rankedPhones(c)[0]?.number
/** The number WhatsApp opens: the first that can take a message. */
export const whatsAppNumber = (c: Pick<Contact, 'phones' | 'phoneKinds' | 'mainPhone'>) => rankedPhones(c).find((x) => canWhatsApp(x.number, x.kind))?.number

/** Labels and the main number for numbers no longer on the contact are dropped, so an edited number starts fresh. */
export function prunePhoneMeta(c: Pick<Contact, 'phones' | 'phoneKinds' | 'mainPhone'>): Pick<Contact, 'phoneKinds' | 'mainPhone'> {
  const keys = new Set(c.phones.map(phoneKey))
  const kinds = Object.fromEntries(Object.entries(c.phoneKinds ?? {}).filter(([k]) => keys.has(k)))
  return { phoneKinds: Object.keys(kinds).length ? kinds : undefined, mainPhone: c.mainPhone && keys.has(c.mainPhone) ? c.mainPhone : undefined }
}

/** vCard 3.0 TEL types. MAIN is Apple's and Google's own; the first number also carries PREF so phones dial it by default. */
export function vcardTelType(kind: PhoneKind, main: boolean): string {
  const t = { mobile: 'CELL', work: 'WORK,VOICE', home: 'HOME,VOICE', main: 'MAIN', fax: 'WORK,FAX', other: 'VOICE' }[kind]
  return main ? `${t},PREF` : t
}

/** Android's own phone types (ContactsContract.CommonDataKinds.Phone.TYPE_*), for the phone's new-contact screen. */
export const androidPhoneType = (kind: PhoneKind): number => ({ home: 1, mobile: 2, work: 3, fax: 4, other: 7, main: 12 })[kind]
