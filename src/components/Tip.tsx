import { useLayoutEffect, useRef, useState } from 'react'
import '@fontsource/caveat/latin-700.css'
import { coachLayout, TIP_TEXT, type CoachLayout, type TipId } from '../lib/onboarding'

interface Geo { r: { x: number; y: number; w: number; h: number }; v: { w: number; h: number }; lay: CoachLayout }

/** The dim with a rounded hole over the target: even-odd, so the hole is not part of the dim and taps go through to it. */
function holePath({ r, v }: Geo, pad = 6, rad = 14): string {
  const x = r.x - pad, y = r.y - pad, w = r.w + pad * 2, h = r.h + pad * 2, k = Math.min(rad, w / 2, h / 2)
  return `path(evenodd, 'M0 0H${v.w}V${v.h}H0Z M${x + k} ${y}H${x + w - k}A${k} ${k} 0 0 1 ${x + w} ${y + k}V${y + h - k}A${k} ${k} 0 0 1 ${x + w - k} ${y + h}H${x + k}A${k} ${k} 0 0 1 ${x} ${y + h - k}V${y + k}A${k} ${k} 0 0 1 ${x + k} ${y}Z')`
}

/** A hand-drawn arrow with one loop in it, from the message to just off the target, and its head. */
function curl({ x1, y1, x2, y2 }: CoachLayout['arrow']): { line: string; head: string } {
  const dy = y2 - y1, s = Math.sign(dy) || 1
  const mx = (x1 + x2) / 2 - 24, my = y1 + dy * 0.42
  const cx = mx - 10, cy = my + s * Math.min(46, Math.abs(dy) * 0.45)
  const line = `M${x1} ${y1} C${x1 - 46} ${y1 + dy * 0.16} ${mx - 34} ${my - s * 26} ${mx} ${my} C${mx + 24} ${my + s * 16} ${mx + 28} ${my - s * 14} ${mx + 8} ${my - s * 12} C${mx - 14} ${my - s * 10} ${cx} ${cy} ${x2} ${y2}`
  const a = Math.atan2(y2 - cy, x2 - cx), len = 10
  const p = (t: number) => `${x2 - len * Math.cos(a + t)} ${y2 - len * Math.sin(a + t)}`
  return { line, head: `M${p(0.5)} L${x2} ${y2} L${p(-0.5)}` }
}

/**
 * A one-time tip as a coach mark: the screen dims except for the element marked data-tip={id}, a hand-drawn arrow points
 * at it, and a short message explains it. Tapping the dim, the close key or Got it ends it; tapping the target ends it
 * too and still does what the target does. With no such element on screen nothing is shown or counted.
 */
export default function Tip({ id, onShown, onDismiss }: { id: TipId; onShown: () => void; onDismiss: () => void }) {
  const msg = useRef<HTMLDivElement>(null)
  const [geo, setGeo] = useState<Geo | null>(null)
  const shown = useRef(onShown)
  shown.current = onShown
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss
  const text = TIP_TEXT[id]

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tip="${id}"]`)
    const place = () => {
      const m = msg.current
      if (!target || !m || !target.isConnected) { setGeo(null); return }
      const b = target.getBoundingClientRect()
      if (!b.width || !b.height) { setGeo(null); return }
      const v = { w: window.innerWidth, h: window.innerHeight }
      setGeo({ r: { x: b.left, y: b.top, w: b.width, h: b.height }, v, lay: coachLayout(b, v, m.offsetHeight) })
    }
    // the camera and sheets slide in: place again once the layout has settled
    const raf = requestAnimationFrame(() => requestAnimationFrame(place))
    const late = window.setTimeout(place, 400)
    const used = () => dismiss.current()
    target?.addEventListener('click', used, { capture: true })
    window.addEventListener('resize', place)
    window.addEventListener('scroll', place, { capture: true, passive: true })
    return () => {
      cancelAnimationFrame(raf); clearTimeout(late)
      target?.removeEventListener('click', used, { capture: true })
      window.removeEventListener('resize', place)
      window.removeEventListener('scroll', place, { capture: true })
    }
  }, [id])
  useLayoutEffect(() => { if (geo) shown.current() }, [geo])

  const arrow = geo ? curl(geo.lay.arrow) : null
  return (
    <div className="tip" role="dialog" aria-label="Tip" aria-describedby={`tip-${id}`}>
      {geo && <div className="tip-dim" style={{ clipPath: holePath(geo) }} onClick={() => dismiss.current()} />}
      {arrow && (
        <svg className="tip-curl" width={geo!.v.w} height={geo!.v.h} aria-hidden="true">
          <path className="line" pathLength={1} d={arrow.line} />
          <path className="head" d={arrow.head} />
        </svg>
      )}
      <div ref={msg} id={`tip-${id}`} className="tip-msg" style={geo ? { top: geo.lay.msgTop } : { visibility: 'hidden', top: 0 }}>
        <p className="tip-hi">psst, quick tip</p>
        <p className="tip-line">{text.line}</p>
        <p className="tip-sub">{text.sub}</p>
        <button className="tip-ok" onClick={() => dismiss.current()}>Got it</button>
      </div>
      {geo && (
        <button className="tip-x" onClick={() => dismiss.current()} aria-label="Close tip">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round"><path d="M6 6l12 12M18 6L6 18" /></svg>
        </button>
      )}
    </div>
  )
}
