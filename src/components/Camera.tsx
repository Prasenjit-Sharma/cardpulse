import { useEffect, useRef, useState } from 'react'
import { CARD_GUIDE, cropRect } from '../lib/crop'
import { log } from '../lib/debug'
import { detectCard, isStable, type Detection } from '../lib/detect'
import { growQuad, quadSize, warpQuad, type Pt, type Quad } from '../lib/warp'
import { useObjectUrl } from '../lib/useObjectUrl'
import Icon from './Icon'

const MODE_KEY = 'cardpulse.captureMode'
const AUTO_KEY = 'cardpulse.autoDetect'
type Mode = 'single' | 'sided' | 'many'
const MODES: { id: Mode; label: string }[] = [
  { id: 'single', label: 'Card' },
  { id: 'sided', label: 'Front + back' },
  { id: 'many', label: 'Many' },
]
const HOLD_MS = 300         // how long the card must hold still before Auto Detect captures
const ANALYSE_WIDTH = 160
const MIN_GAP_MS = 55       // detect at most ~18 times a second
const PAD = 0.03            // breathing room around a detected card

interface VideoDet extends Detection { fw: number; fh: number; progress: number } // detection in VIDEO pixels

/**
 * Full-screen scanner. With Auto Detect on, the card is found, outlined and captured straightened
 * when the phone is held still. Otherwise a frame guides the shot and the photo is cropped to it.
 */
export default function Camera({ onCard, onClose, onGallery, onOpenLast, eventLabel = '', single = false, sidedOnly = false }: {
  onCard: (files: File[]) => void
  onClose: () => void
  /** Tapping the last-shot thumbnail: leave the camera and open what was just scanned. */
  onOpenLast?: () => void
  onGallery?: (files: FileList) => void
  eventLabel?: string
  single?: boolean
  sidedOnly?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const [error, setError] = useState('')
  const [count, setCount] = useState(0)
  const [last, setLast] = useState<File | null>(null)
  const lastUrl = useObjectUrl(last ?? undefined)
  const [mode, setMode] = useState<Mode>(() => {
    try { const m = localStorage.getItem(MODE_KEY) as Mode; return MODES.some((x) => x.id === m) ? m : 'single' } catch { return 'single' }
  })
  const [auto, setAuto] = useState(() => { try { return localStorage.getItem(AUTO_KEY) !== '0' } catch { return true } })
  const [torchOk, setTorchOk] = useState(false)
  const [torch, setTorch] = useState(false)
  const [det, setDet] = useState<VideoDet | null>(null)
  const [hold, setHold] = useState(0)
  const [size, setSize] = useState({ w: 0, h: 0, vw: 0, vh: 0 })
  const [struggling, setStruggling] = useState(false)
  const sided = mode === 'sided' && !sidedOnly
  const front = useRef<File | null>(null)
  const [hasFront, setHasFront] = useState(false)
  const detRef = useRef<VideoDet | null>(null)
  detRef.current = det
  const shootRef = useRef<(d?: VideoDet) => void>(() => {})

  useEffect(() => {
    log('camera opened')
    let stream: MediaStream | undefined
    let cancelled = false
    navigator.mediaDevices
      .getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 2560 }, height: { ideal: 1440 } }, audio: false })
      .then((s) => {
        if (cancelled) return s.getTracks().forEach((t) => t.stop())
        stream = s
        const t = s.getVideoTracks()[0]
        track.current = t ?? null
        setTorchOk(!!(t?.getCapabilities?.() as { torch?: boolean } | undefined)?.torch)
        const st = t?.getSettings()
        log(`camera stream ${st?.width}x${st?.height} facing=${st?.facingMode ?? '?'}`)
        if (video.current) { video.current.srcObject = s; void video.current.play() }
      })
      .catch((e: Error) => { log(`camera error ${e.name}: ${e.message}`); setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser site settings and try again.' : `Camera unavailable: ${e.message}`) })
    return () => { cancelled = true; stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  // Track the viewfinder and video size so the outline lines up with the picture.
  useEffect(() => {
    const el = view.current, v = video.current
    if (!el) return
    const measure = () => { const r = el.getBoundingClientRect(); setSize({ w: r.width, h: r.height, vw: v?.videoWidth ?? 0, vh: v?.videoHeight ?? 0 }) }
    measure()
    const ro = new ResizeObserver(measure); ro.observe(el)
    v?.addEventListener('loadedmetadata', measure)
    return () => { ro.disconnect(); v?.removeEventListener('loadedmetadata', measure) }
  }, [])

  // Auto Detect loop: look for a card on every new camera frame (as fast as the phone allows), capture once it holds still.
  useEffect(() => {
    if (!auto || mode === 'many' || error) { setDet(null); setHold(0); return }
    const v = video.current
    if (!v) return
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d', { willReadFrequently: true })!
    let prev: Detection | null = null, stableSince = 0, unstable = 0, lost = 0, armed = true, idleSince = performance.now(), lastRun = 0
    let stopped = false, timer = 0, vfc = 0

    const tick = () => {
      if (stopped) return
      const now = performance.now()
      if (v.videoWidth && now - lastRun >= MIN_GAP_MS) {
        lastRun = now
        const k = ANALYSE_WIDTH / v.videoWidth
        c.width = ANALYSE_WIDTH; c.height = Math.max(1, Math.round(v.videoHeight * k))
        ctx.drawImage(v, 0, 0, c.width, c.height)
        const d = detectCard(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
        if (!d) {
          prev = null; stableSince = 0; unstable = 0
          if (++lost >= 5) armed = true                                     // the card left the frame: ready for the next one
          if (now - idleSince > 3500) setStruggling(true)
          setDet(null); setHold(0)
        } else {
          lost = 0; idleSince = now; setStruggling(false)
          if (prev && isStable(prev, d, c.width)) { unstable = 0; if (!stableSince) stableSince = now }
          else if (++unstable > 1) { stableSince = 0; unstable = 0 }        // a hand-held phone jitters: one wobbly frame is forgiven
          prev = d
          const progress = stableSince ? Math.min(1, (now - stableSince) / HOLD_MS) : 0
          const up = 1 / k
          const scale = ([x, y]: Pt): Pt => [x * up, y * up]
          const vd: VideoDet = { ...d, cx: d.cx * up, cy: d.cy * up, w: d.w * up, h: d.h * up, corners: d.corners.map(scale), quad: d.quad.map(scale) as Quad, fw: v.videoWidth, fh: v.videoHeight, progress }
          setDet(vd); setHold(progress)
          if (armed && progress >= 1) { armed = false; stableSince = 0; shootRef.current(vd) }
        }
      }
      schedule()
    }
    const schedule = () => {
      if (stopped) return
      if ('requestVideoFrameCallback' in v) vfc = (v as HTMLVideoElement & { requestVideoFrameCallback: (cb: () => void) => number }).requestVideoFrameCallback(tick)
      else timer = window.setTimeout(tick, MIN_GAP_MS)
    }
    schedule()
    return () => { stopped = true; clearTimeout(timer); if (vfc && 'cancelVideoFrameCallback' in v) (v as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback(vfc) }
  }, [auto, mode, error])

  const finish = (files: File[]) => {
    onCard(files)
    setCount((n) => n + 1)
    setLast(files[0] ?? null)
    navigator.vibrate?.(30)
    if (single) onClose()
  }
  const flushFront = () => { if (front.current) { finish([front.current]); front.current = null; setHasFront(false) } }

  const shoot = (d?: VideoDet) => {
    const v = video.current
    log(`shutter, video=${v?.videoWidth}x${v?.videoHeight} detected=${!!(d ?? detRef.current)}`)
    if (!v?.videoWidth) { setError('Camera not ready yet. Wait a second and try again.'); return }
    const c = document.createElement('canvas')
    const ctx = c.getContext('2d')!
    const found = mode !== 'many' && auto ? (d ?? detRef.current) : null
    const cap = mode === 'many' ? 2560 : 1800
    if (found) {
      // Flatten the card using its four corners: fixes tilt AND perspective. Work from a capped-size copy of the frame.
      const k = Math.min(1, 2200 / Math.max(v.videoWidth, v.videoHeight))
      const fw = Math.round(v.videoWidth * k), fh = Math.round(v.videoHeight * k)
      const src = document.createElement('canvas'); src.width = fw; src.height = fh
      const sctx = src.getContext('2d', { willReadFrequently: true })!
      sctx.drawImage(v, 0, 0, fw, fh)
      const q = growQuad(found.quad.map(([x, y]) => [x * k, y * k] as Pt) as Quad, PAD * 2)
      const size = quadSize(q)
      const s = Math.min(1, cap / Math.max(size.w, size.h))
      c.width = Math.max(1, Math.round(size.w * s)); c.height = Math.max(1, Math.round(size.h * s))
      const flat = warpQuad(sctx.getImageData(0, 0, fw, fh).data, fw, fh, q, c.width, c.height)
      ctx.putImageData(new ImageData(flat, c.width, c.height), 0, 0)
    } else {
      const box = view.current?.getBoundingClientRect()
      const r = box && box.width && box.height
        ? cropRect({ w: box.width, h: box.height }, { w: v.videoWidth, h: v.videoHeight }, mode === 'many' ? undefined : CARD_GUIDE)
        : { x: 0, y: 0, w: v.videoWidth, h: v.videoHeight }
      const s = Math.min(1, cap / Math.max(r.w, r.h))
      c.width = Math.max(1, Math.round(r.w * s)); c.height = Math.max(1, Math.round(r.h * s))
      ctx.drawImage(v, r.x, r.y, r.w, r.h, 0, 0, c.width, c.height)
    }
    c.toBlob((b) => {
      log(`captured ${c.width}x${c.height}, blob=${b ? b.size : 'null'}`)
      if (!b) return
      const file = new File([b], `card-${Date.now()}.jpg`, { type: 'image/jpeg' })
      if (sidedOnly || !sided) return finish([file])
      if (front.current) { finish([front.current, file]); front.current = null; setHasFront(false) } else { front.current = file; setHasFront(true); setLast(file) }
    }, 'image/jpeg', 0.92)
  }
  shootRef.current = shoot

  const pickMode = (m: Mode) => { flushFront(); setMode(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } }
  const toggleAuto = () => { const n = !auto; setAuto(n); try { localStorage.setItem(AUTO_KEY, n ? '1' : '0') } catch { /* ignore */ } }
  const toggleTorch = async () => {
    const n = !torch
    try { await track.current?.applyConstraints({ advanced: [{ torch: n } as MediaTrackConstraintSet] }); setTorch(n) } catch { /* torch not available */ }
  }
  const close = () => { log('camera closed'); flushFront(); onClose() }

  // Map a video-pixel point onto the viewfinder (the video is drawn with object-fit: cover).
  const toView = ([x, y]: [number, number]) => {
    const s = Math.max(size.w / size.vw, size.h / size.vh)
    return `${(size.w - size.vw * s) / 2 + x * s},${(size.h - size.vh * s) / 2 + y * s}`
  }
  const canOutline = det && size.vw > 0 && auto && mode !== 'many'
  const status = hasFront ? 'Now the back' : sidedOnly ? 'Back side' : det ? (hold >= 1 ? 'Got it' : 'Hold steady') : mode === 'many' ? 'Lay cards flat, then tap' : count ? 'Scan next card' : auto ? 'Point at a card' : 'Fit the card in the frame'

  return (
    <div className="camera">
      <div className="viewfinder" ref={view}>
        {error ? <div className="err">{error}</div> : <video ref={video} playsInline muted />}

        {!error && mode !== 'many' && !canOutline && (
          <div className={`guide${auto ? ' faint' : ''}`} style={{ width: `${CARD_GUIDE.widthFrac * 100}%`, aspectRatio: CARD_GUIDE.aspect }} />
        )}
        {canOutline && (
          <svg className="outline" width={size.w} height={size.h} aria-hidden="true">
            <polygon points={det.quad.map(toView).join(' ')} className={hold >= 0.5 ? 'lock' : ''} />
          </svg>
        )}

        <div className="cam-top">
          <button className="round dark" onClick={close} aria-label="Close"><Icon name="x" size={22} /></button>
          <div className="cam-mid">
            {!sidedOnly && !single && (
              <div className="seg" role="tablist">
                {MODES.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => pickMode(m.id)}>{m.label}</button>)}
              </div>
            )}
            <span className="pillbar">{status}</span>
            {eventLabel && <span className="pillbar sub">{eventLabel}</span>}
          </div>
          {count > 0 && !single ? <button className="round accent" onClick={close} aria-label={`Done, ${count} scanned`}><Icon name="check" size={22} /></button> : <span className="round ghost" />}
        </div>

        {hasFront && <button className="skip" onClick={flushFront}>Skip back</button>}

        {struggling && auto && mode !== 'many' && count === 0 && (
          <div className="tips" onClick={() => setStruggling(false)}>
            <strong>Having trouble?</strong>
            <span>• Use a plain, higher-contrast background</span>
            <span>• Turn off Auto Detect and use the frame</span>
          </div>
        )}

        <div className="cam-bottom">
          <div className="toggles">
            {torchOk && (
              <label className="toggle"><button className={`round dark${torch ? ' on' : ''}`} onClick={() => void toggleTorch()} aria-pressed={torch} aria-label="Flash"><Icon name={torch ? 'bolt' : 'boltoff'} size={22} /></button><span>Flash</span></label>
            )}
            {mode !== 'many' && (
              <label className="toggle"><button className={`round dark${auto ? ' on' : ''}`} onClick={toggleAuto} aria-pressed={auto} aria-label="Auto Detect"><Icon name="frame" size={22} /></button><span>Auto Detect</span></label>
            )}
          </div>
          <div className="shutter-row">
            <div className="thumb-slot">
              {lastUrl && (
                <button className="last" onClick={() => { flushFront(); onOpenLast?.(); onClose() }} aria-label={`Open last scan (${count} scanned)`}>
                  <img src={lastUrl} alt="" />{count > 0 && <b>{count}</b>}
                </button>
              )}
            </div>
            <button className="shutter" onClick={() => shoot()} disabled={!!error} aria-label="Take photo" />
            <div className="thumb-slot right">
              {onGallery && !single && (
                <label className="toggle gallery"><span className="round dark"><Icon name="image" size={22} /></span><span>Gallery</span>
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => { if (e.target.files) { onGallery(e.target.files); close() } e.target.value = '' }} />
                </label>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
