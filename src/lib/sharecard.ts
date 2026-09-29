import { waNumber } from './actions.ts'
import { buildCardVcf } from './cardvcf.ts'
import { cardFileName } from './cardshare.ts'
import type { MyCard } from './mycards.ts'
import { whatsAppNumber } from './phones.ts'
import { cacheName, type Native } from './platform.ts'
import type { Contact } from './types.ts'

// "Share my card" from a contact: the user's own vCard, straight into this person's WhatsApp chat.

export type WaApp = 'com.whatsapp' | 'com.whatsapp.w4b'
const APPS: WaApp[] = ['com.whatsapp', 'com.whatsapp.w4b']

/** The contact's WhatsApp number as WhatsApp wants it (country code, digits only), or null when none can take WhatsApp. */
export function waJid(c: Contact): string | null {
  const n = whatsAppNumber(c)
  return n ? waNumber(n) : null
}

export interface SendDeps {
  native: Pick<Native, 'writeCache' | 'waApps' | 'waSend'> | null
  remembered(): WaApp | undefined
  remember(a: WaApp): void
  ask(apps: WaApp[]): Promise<WaApp | null>
  fallback(): Promise<void>
}

/**
 * Puts the vCard into the contact's chat, alone (text beside a vCard breaks it in WhatsApp). With both WhatsApp and
 * WhatsApp Business, the user picks once. Anything that stops the hand-off falls back to the share sheet.
 */
export async function sendCardTo(c: Contact, card: MyCard, deps: SendDeps): Promise<'sent' | 'cancelled' | 'fallback'> {
  const jid = waJid(c), n = deps.native
  const fallback = async () => { await deps.fallback(); return 'fallback' as const }
  if (!jid || !n?.waApps || !n.waSend) return fallback()
  const apps = (await n.waApps().catch(() => [] as string[])).filter((a): a is WaApp => APPS.includes(a as WaApp))
  if (!apps.length) return fallback()
  const kept = deps.remembered()
  let app: WaApp | null = apps.length === 1 ? apps[0]! : kept && apps.includes(kept) ? kept : null
  if (!app) {
    app = await deps.ask(apps)
    if (!app) return 'cancelled'
    deps.remember(app)
  }
  try {
    const uri = await n.writeCache(cacheName(cardFileName(card, 'vcf')), new Blob([buildCardVcf(card).text], { type: 'text/x-vcard' }))
    await n.waSend({ uri, jid, pkg: app })
    return 'sent'
  } catch { return fallback() }
}
