import { cardQr } from './cardqr'
import { drawCard } from './drawcard'
import type { MyCard } from './mycards'

const EXPORT_PX = 2000

/** The card as a PNG, drawn by the same renderer as the on-screen preview. */
export async function cardPng(card: MyCard): Promise<Blob> {
  const c = document.createElement('canvas')
  c.width = EXPORT_PX; c.height = Math.round(EXPORT_PX / 1.75)
  await drawCard(c.getContext('2d')!, card, cardQr(card).matrix, EXPORT_PX)
  return new Promise<Blob>((resolve, reject) => c.toBlob((b) => (b ? resolve(b) : reject(new Error('encode'))), 'image/png'))
}
