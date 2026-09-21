import { useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { buildCardVcf } from '../lib/cardvcf'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'
import { useBackClose } from '../lib/useBackClose'
import { useWakeLock } from '../lib/wakelock'
import Icon from './Icon'

/** The QR as big as the screen allows, nothing else competing, screen kept awake. For a stall where people scan from a queue. */
export default function StallMode({ card, onClose }: { card: MyCard; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useBackClose(true, onClose)
  const { supported } = useWakeLock(true)

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const m = qrMatrix(buildCardVcf(card).text)
    const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 800
    el.width = px; el.height = px
    const ctx = el.getContext('2d')!
    const quiet = 4, cell = px / (m.length + 2 * quiet)
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px)
    ctx.fillStyle = '#16191D'
    m.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell)) }))
  }, [card])

  return createPortal(
    <div className="stall" role="dialog" aria-modal="true" aria-label="QR code for your contact card">
      <button className="icon-btn ghost stall-close" onClick={onClose} aria-label="Close"><Icon name="x" size={24} /></button>
      <p className="stall-cap">Scan to save my contact</p>
      <canvas ref={canvas} className="stall-qr" role="img" aria-label={`Contact card QR for ${card.name}`} />
      <strong className="stall-name">{card.name}</strong>
      {card.company && <span className="stall-co">{card.company}</span>}
      {!supported && <p className="stall-hint">Raise your screen timeout so the code stays on.</p>}
    </div>,
    document.body,
  )
}
