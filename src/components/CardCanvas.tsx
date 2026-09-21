import { useEffect, useRef } from 'react'
import { cardDescription } from '../lib/cardlayout'
import { cardQr } from '../lib/cardqr'
import { drawCard } from '../lib/drawcard'
import type { MyCard } from '../lib/mycards'

/**
 * The one place a card is painted on screen. Drawn a beat after the last keystroke so typing never stalls, and only resized when
 * the size really changes: resizing a canvas clears it, which would blink the preview on every edit.
 */
export default function CardCanvas({ card, className = 'card-canvas' }: { card: MyCard; className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null)
  const run = useRef(0)

  useEffect(() => {
    const el = ref.current
    if (!el) return
    const draw = () => {
      const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 700
      const ticket = ++run.current
      const ctx = el.getContext('2d')
      if (!ctx) return
      void drawCard(ctx, card, cardQr(card).matrix, px, () => ticket === run.current).catch(() => undefined)
      if (el.width !== px) { el.width = px; el.height = Math.round(px / 1.75) }       // only when the size changed
    }
    const t = setTimeout(draw, 60)
    const ro = new ResizeObserver(() => { clearTimeout(t); draw() })
    ro.observe(el)
    return () => { clearTimeout(t); ro.disconnect(); run.current++ }
  }, [card])

  return <canvas ref={ref} className={className} role="img" aria-label={cardDescription(card)} />
}
