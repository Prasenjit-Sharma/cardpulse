import { useEffect, useRef } from 'react'
import { buildCardVcf } from '../lib/cardvcf'
import { cardDescription } from '../lib/cardlayout'
import { drawCard } from '../lib/drawcard'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'

/** The one place a card is painted on screen. Redraws when the card changes, a beat after the last keystroke, so typing never stalls. */
export default function CardCanvas({ card, className = 'card-canvas' }: { card: MyCard; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  useEffect(() => {
    const el = ref.current
    if (!el) return
    let live = true
    const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 700
    el.width = px; el.height = Math.round(px / 1.75)
    const t = setTimeout(() => {
      const ctx = el.getContext('2d')
      if (ctx && live) void drawCard(ctx, card, qrMatrix(buildCardVcf(card).text), px)
    }, 60)
    return () => { live = false; clearTimeout(t) }
  }, [card])
  return <canvas ref={ref} className={className} role="img" aria-label={cardDescription(card)} />
}
