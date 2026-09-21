import { buildCardVcf, type Dropped } from './cardvcf.ts'
import { graphemes } from './graphemes.ts'
import { sanitizeCard, type MyCard } from './mycards.ts'
import { qrMatrix } from './qr.ts'

const clip = (s: string, n: number) => graphemes(s).slice(0, n).join('')

export interface CardQr { matrix: boolean[][]; dropped: Dropped[]; /** The QR carries a shortened card because the details were too long for any QR. */ trimmed: boolean }

/**
 * The QR for a card, and it never throws. A QR holds about 2 KB at most; if the fields together are longer than that the
 * generator fails, so fall back to a shortened card (name, company, first phone and email) rather than leaving a blank screen.
 */
export function cardQr(card: MyCard): CardQr {
  const c = sanitizeCard(card)
  try {
    const { text, dropped } = buildCardVcf(c)
    return { matrix: qrMatrix(text), dropped, trimmed: false }
  } catch { /* too long: shorten below */ }
  const short: MyCard = {
    ...c, name: clip(c.name, 60), company: clip(c.company, 60), title: '', website: '', address: '', social: [],
    phones: c.phones.slice(0, 1).map((p) => clip(p, 20)), emails: c.emails.slice(0, 1).map((e) => clip(e, 60)),
  }
  try { return { matrix: qrMatrix(buildCardVcf(short).text), dropped: ['social', 'address'], trimmed: true } } catch { /* fall through */ }
  return { matrix: qrMatrix(['BEGIN:VCARD', 'VERSION:3.0', 'FN:Contact', 'END:VCARD'].join('\r\n')), dropped: ['social', 'address'], trimmed: true }
}
