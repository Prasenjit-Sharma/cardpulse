import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { applyCrop, clamp01, defaultQuad, quadUsable, rotateQuadCCW, rotateQuadCW, turn, turnedPreview, type Rotation } from '../lib/recrop'
import { useBackClose } from '../lib/useBackClose'
import type { Pt, Quad } from '../lib/warp'
import Icon from './Icon'

/**
 * Turn a card photo and drag its four corners onto the card. The corners flatten tilt and perspective, exactly as a fresh scan does.
 * `canUndo` offers the photo as first taken, kept only after a first adjustment.
 */
export default function PhotoAdjust({ photo, canUndo, onApply, onUndo, onClose }: {
  photo: Blob
  canUndo: boolean
  onApply: (adjusted: Blob) => void
  onUndo: () => void
  onClose: () => void
}) {
  const [rotation, setRotation] = useState<Rotation>(0)
  const [quad, setQuad] = useState<Quad>(defaultQuad())
  const [url, setUrl] = useState('')
  const [ratio, setRatio] = useState(1.6)
  const [busy, setBusy] = useState(false)
  const [failed, setFailed] = useState(false)
  const stage = useRef<HTMLDivElement>(null)
  const drag = useRef<number | null>(null)
  useBackClose(true, onClose)

  useEffect(() => {
    let live = true, made = ''
    void turnedPreview(photo, rotation).then((b) => {
      if (!live) return
      made = URL.createObjectURL(b); setUrl(made)
    }).catch(() => live && setFailed(true))
    return () => { live = false; if (made) URL.revokeObjectURL(made) }
  }, [photo, rotation])

  const rotate = (by: 90 | -90) => {
    setRotation((r) => turn(r, by))
    setQuad((q) => (by === 90 ? rotateQuadCW(q) : rotateQuadCCW(q)))
  }
  const move = (e: React.PointerEvent) => {
    const i = drag.current, box = stage.current?.getBoundingClientRect()
    if (i == null || !box) return
    const p: Pt = [clamp01((e.clientX - box.left) / box.width), clamp01((e.clientY - box.top) / box.height)]
    setQuad((q) => q.map((c, j) => (j === i ? p : c)) as Quad)
  }
  const usable = quadUsable(quad)
  const apply = async () => {
    setBusy(true)
    try { onApply(await applyCrop(photo, quad, rotation)) } catch { setFailed(true); setBusy(false) }
  }

  const outside = `M0 0H1V1H0Z M${quad.map((p) => p.join(' ')).join('L')}Z`

  return createPortal(
    <div className="adjust" role="dialog" aria-modal="true" aria-label="Adjust photo">
      <header className="adjust-top">
        <button className="icon-btn ghost" onClick={onClose} aria-label="Cancel"><Icon name="x" /></button>
        <strong>Adjust photo</strong>
        <button className="cta small" disabled={!usable || busy || !url} onClick={() => void apply()}>{busy ? 'Saving…' : 'Done'}</button>
      </header>

      <div className="adjust-body">
        <div className="adjust-stage" ref={stage} style={{ aspectRatio: String(ratio), width: `min(100%, calc(64dvh * ${ratio}))` }}
          onPointerMove={move} onPointerUp={() => { drag.current = null }} onPointerCancel={() => { drag.current = null }}>
          {url && <img src={url} alt="Card photo being adjusted" draggable={false} onLoad={(e) => setRatio(e.currentTarget.naturalWidth / e.currentTarget.naturalHeight)} />}
          <svg viewBox="0 0 1 1" preserveAspectRatio="none" aria-hidden="true">
            <path d={outside} className="adjust-dim" fillRule="evenodd" />
            <polygon points={quad.map((p) => p.join(',')).join(' ')} className={`adjust-edge${usable ? '' : ' bad'}`} vectorEffect="non-scaling-stroke" />
          </svg>
          {quad.map(([x, y], i) => (
            <button key={i} className="adjust-handle" style={{ left: `${x * 100}%`, top: `${y * 100}%` }}
              aria-label={['Top left', 'Top right', 'Bottom right', 'Bottom left'][i] + ' corner'}
              onPointerDown={(e) => { drag.current = i; e.currentTarget.setPointerCapture(e.pointerId) }} />
          ))}
        </div>
        {failed && <p className="hint bad" role="alert">The photo could not be adjusted. Try again.</p>}
        {!usable && !failed && <p className="hint bad" role="status">The corners cross. Drag them back around the card.</p>}
      </div>

      <p className="adjust-tip">Drag each corner onto the matching corner of the card. Moving them separately straightens a tilted or angled photo.</p>
      <div className="adjust-tools">
        <button onClick={() => rotate(-90)} aria-label="Rotate left"><Icon name="rotate-left" size={20} /> Left</button>
        <button onClick={() => rotate(90)} aria-label="Rotate right"><Icon name="rotate-right" size={20} /> Right</button>
        <button onClick={() => setQuad(defaultQuad())}><Icon name="frame" size={20} /> Reset</button>
        {canUndo && <button onClick={onUndo}><Icon name="refresh" size={20} /> Original</button>}
      </div>
    </div>,
    document.body,
  )
}
