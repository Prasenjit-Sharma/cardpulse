import { useLayoutEffect, useRef, useState } from 'react'
import { placeTip, type TipId, type TipPlace } from '../lib/onboarding'

/**
 * A one-time tip: a small bubble pointing at the element marked data-tip={id}. It never covers that element, and using
 * the element counts as "got it". With no such element on screen it stays hidden and is not counted as shown.
 */
export default function Tip({ id, text, onShown, onDismiss }: { id: TipId; text: string; onShown: () => void; onDismiss: () => void }) {
  const box = useRef<HTMLDivElement>(null)
  const [at, setAt] = useState<TipPlace | null>(null)
  const shown = useRef(onShown)
  shown.current = onShown
  const dismiss = useRef(onDismiss)
  dismiss.current = onDismiss

  useLayoutEffect(() => {
    const target = document.querySelector<HTMLElement>(`[data-tip="${id}"]`)
    const place = () => {
      const b = box.current
      if (!target || !b || !target.isConnected) { setAt(null); return }
      const r = target.getBoundingClientRect()
      setAt(placeTip(r, { w: b.offsetWidth, h: b.offsetHeight }, { w: window.innerWidth, h: window.innerHeight }))
    }
    // the camera and sheets slide in: place again once the layout has settled
    const raf = requestAnimationFrame(() => requestAnimationFrame(place))
    const late = window.setTimeout(place, 400)
    const used = () => dismiss.current()
    target?.addEventListener('click', used, { capture: true })
    window.addEventListener('resize', place)
    return () => { cancelAnimationFrame(raf); clearTimeout(late); target?.removeEventListener('click', used, { capture: true }); window.removeEventListener('resize', place) }
  }, [id])
  useLayoutEffect(() => { if (at) shown.current() }, [at])

  return (
    <div ref={box} className={`tip ${at?.side ?? ''}`} role="status" style={at ? { top: at.top, left: at.left } : { visibility: 'hidden', top: 0, left: 0 }}>
      <p>{text}</p>
      <button className="link" onClick={() => dismiss.current()}>Got it</button>
      {at && <span className="tip-arrow" style={{ left: at.arrow - 6 }} aria-hidden="true" />}
    </div>
  )
}
