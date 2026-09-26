import { useState } from 'react'
import { noteShare } from '../lib/sharelog'
import { browserEnv, shareVcf } from '../lib/actions'
import { buildCardVcf } from '../lib/cardvcf'
import { cardAsText, cardFileName } from '../lib/cardshare'
import { cardQr } from '../lib/cardqr'
import { drawCard } from '../lib/drawcard'
import type { MyCard } from '../lib/mycards'
import Sheet, { SheetItem } from './Sheet'
import { saveBlob, shareNav } from '../lib/platform'

const EXPORT_PX = 2000

/** The card as a PNG, drawn by the same renderer as the on-screen preview. */
async function cardPng(card: MyCard): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = EXPORT_PX; c.height = Math.round(EXPORT_PX / 1.75)
  await drawCard(c.getContext('2d')!, card, cardQr(card).matrix, EXPORT_PX)
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'))
}

/** Four ways to give someone the card: show the QR, send the contact file, send the picture, copy the text. */
export default function CardShare({ card, onClose, onStall }: { card: MyCard; onClose: () => void; onStall: () => void }) {
  const [status, setStatus] = useState('')
  const [bad, setBad] = useState(false)
  const say = (text: string, isBad = false) => { setStatus(text); setBad(isBad) }
  const guard = (job: () => Promise<void>) => async () => {
    say('')
    try { await job() } catch (e) { if ((e as Error)?.name !== 'AbortError') say('Could not share. Try again.', true) }
  }

  const sendFile = guard(async () => {
    const out = await shareVcf(cardFileName(card, 'vcf'), buildCardVcf(card).text, card.name, undefined, browserEnv(), false)
    if (out.result !== 'cancelled') noteShare(card.id, 'file')
    if (out.result === 'downloaded') say('Saved as a file. Open it to add the contact.')
  })
  const sendImage = guard(async () => {
    const blob = await cardPng(card)
    const file = new File([blob], cardFileName(card, 'png'), { type: 'image/png' })
    const nav = shareNav()
    if (nav.canShare?.({ files: [file] })) { await nav.share!({ files: [file], title: card.name }); noteShare(card.id, 'picture'); return }
    await saveBlob(file.name, blob); noteShare(card.id, 'picture'); say('Saved as a picture.')
  })
  const copy = guard(async () => { await navigator.clipboard.writeText(cardAsText(card)); noteShare(card.id, 'text'); say('Copied.') })

  return (
    <Sheet open onClose={onClose} title={card.name || 'Share card'}>
      <SheetItem icon="frame" label="Show QR full screen" hint="For a stall or a meeting" onClick={() => { onClose(); onStall() }} />
      <SheetItem icon="file" label="Send contact file" hint="Opens in Contacts, WhatsApp, email" onClick={() => void sendFile()} />
      <SheetItem icon="image" label="Send as picture" hint="The card as an image" onClick={() => void sendImage()} />
      <SheetItem icon="note" label="Copy as text" onClick={() => void copy()} />
      {status && <p className={bad ? 'hint bad' : 'hint ok'} role="status" style={{ padding: '4px 20px 12px', margin: 0 }}>{status}</p>}
    </Sheet>
  )
}
