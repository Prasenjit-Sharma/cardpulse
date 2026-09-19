import { useEffect, useRef, useState } from 'react'
import { CARD_GUIDE, cropRect } from '../lib/crop'
import { log } from '../lib/debug'

const MODE_KEY = 'cardpulse.captureMode'
type Mode = 'single' | 'sided' | 'many'
const MODES: { id: Mode; label: string; hint: string }[] = [
  { id: 'single', label: 'One card', hint: 'One card per shot' },
  { id: 'sided', label: 'Front + back', hint: 'Shoot the front, then the back' },
  { id: 'many', label: 'Many cards', hint: 'Lay up to 6 cards flat, in good light' },
]

/**
 * Full-screen live camera that stays open between shots so a stack of cards can be captured quickly.
 * In "2-sided" mode shots pair up: first the front, then the back, delivered as one card.
 * `single` closes after one card (used to add a back side to an existing card).
 */
export default function Camera({ onCard, onClose, onGallery, eventLabel = '', single = false, sidedOnly = false }: {
  onCard: (files: File[]) => void
  onClose: () => void
  /** Photos picked from the gallery instead of the live camera. */
  onGallery?: (files: FileList) => void
  /** Where new cards are filed, shown at the top. */
  eventLabel?: string
  single?: boolean
  /** Back-side capture for an existing card: label the shot "Back" and hide the toggle. */
  sidedOnly?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [mode, setMode] = useState<Mode>(() => {
    try { const m = localStorage.getItem(MODE_KEY) as Mode; return MODES.some((x) => x.id === m) ? m : 'single' } catch { return 'single' }
  })
  const sided = mode === 'sided' && !sidedOnly
  const front = useRef<File | null>(null)
  const [hasFront, setHasFront] = useState(false)

  useEffect(() => {
    log('camera opened')
    let stream: MediaStream | undefined
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        const st = s.getVideoTracks()[0]?.getSettings()
        log(`camera stream ${st?.width}x${st?.height} facing=${st?.facingMode ?? '?'}`)
        if (video.current) { video.current.srcObject = s; void video.current.play() }
      })
      .catch((e: Error) => { log(`camera error ${e.name}: ${e.message}`); setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser site settings and try again.' : `Camera unavailable: ${e.message}`) })
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const finish = (files: File[]) => {
    onCard(files)
    setCount((n) => n + 1)
    navigator.vibrate?.(30)
    if (single) onClose()
  }

  const flushFront = () => {
    if (front.current) { finish([front.current]); front.current = null; setHasFront(false) }
  }

  const shoot = () => {
    const v = video.current
    log(`shutter tapped, video=${v?.videoWidth}x${v?.videoHeight}`)
    if (!v?.videoWidth) { setError('Camera not ready yet — wait a second and try again.'); return }
    // Save what was inside the frame (or, with no frame, everything visible), not the whole camera image.
    const box = view.current?.getBoundingClientRect()
    const r = box && box.width && box.height
      ? cropRect({ w: box.width, h: box.height }, { w: v.videoWidth, h: v.videoHeight }, mode === 'many' ? undefined : CARD_GUIDE)
      : { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }
    const c = document.createElement('canvas')
    const scale = Math.min(1, (mode === 'many' ? 2560 : 1800) / Math.max(r.w, r.h))
    c.width = Math.max(1, Math.round(r.w * scale)); c.height = Math.max(1, Math.round(r.h * scale))
    c.getContext('2d')!.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height)
    c.toBlob((b) => {
      log(`shutter: ${c.width}x${c.height}, blob=${b ? b.size : 'null'}`)
      if (!b) return
      const file = new File([b], `card-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (sidedOnly) return finish([file])
      if (!sided) return finish([file])
      if (front.current) { finish([front.current, file]); front.current = null; setHasFront(false) } else { front.current = file; setHasFront(true) }
    }, 'image/jpeg', 0.92)
  }

  const pickMode = (m: Mode) => {
    flushFront()
    setMode(m)
    try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ }
  }

  const close = () => { log('Done tapped'); flushFront(); onClose() }
  const step = sidedOnly ? 'Back side' : sided ? (hasFront ? 'Now the BACK' : 'FRONT') : ''

  return (
    <div className="camera">
      <div className="viewfinder" ref={view}>
        {error ? <div className="err">{error}</div> : <video ref={video} playsInline muted />}
        {!error && mode !== 'many' && <div className="guide" style={{ width: `${CARD_GUIDE.widthFrac * 100}%`, aspectRatio: CARD_GUIDE.aspect }} />}

        <div className="vf-top">
          {eventLabel && <span className="eventpill">Saving to {eventLabel}</span>}
          <span className="hint">{step || (sidedOnly ? 'Back side' : MODES.find((m) => m.id === mode)?.hint)}</span>
          {hasFront && <button className="skip" onClick={flushFront}>Skip back</button>}
        </div>

        {!sidedOnly && !single && (
          <div className="seg" role="tablist">
            {MODES.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => pickMode(m.id)}>{m.label}</button>)}
          </div>
        )}
      </div>
      <div className="bar">
        <button className="side" onClick={close}>{count ? `Done (${count})` : 'Cancel'}</button>
        <button className="shutter" onClick={shoot} disabled={!!error} aria-label="Take photo" />
        {onGallery && !single ? (
          <label className="side gallery">Photos<input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) { onGallery(e.target.files); close() } e.target.value = '' }} /></label>
        ) : <span className="side" />}
      </div>
    </div>
  )
}
