import { useEffect, useRef, useState } from 'react'
import { CARD_GUIDE, cropRect } from '../lib/crop'
import { log } from '../lib/debug'
import { detectCard, isStable, type Detection } from '../lib/detect'
import { nextGap, smooth } from '../lib/pace'
import { useBackClose } from '../lib/useBackClose'
import { growQuad, quadSize, warpQuad, type Pt, type Quad } from '../lib/warp'
import { useObjectUrl } from '../lib/useObjectUrl'
import Icon from './Icon'
import { confirmAsk } from './Dialog'

const MODE_KEY = 'cardpulse.captureMode'
const AUTO_KEY = 'cardpulse.autoDetect'
type Mode = 'single' | 'sided' | 'many'
const MODES: { id: Mode; label: string }[] = [
  { id: 'single', label: 'Card' },
  { id: 'sided', label: 'Front + back' },
  { id: 'many', label: 'Many' },
]
const MAX_CARDS = 6         // photos held in the tray before they must be read
const HOLD_MS = 300         // how long the card must hold still before Auto Detect captures
const ANALYSE_WIDTH = 160
const MIN_GAP_MS = 55       // detect at most ~18 times a second
const PAD = 0.03            // breathing room around a detected card

/** One card in the tray: its photo(s) (front, and back when shot as front + back) waiting to be read. */
interface Shot { id: number; files: File[]; url: string }

interface VideoDet extends Detection { fw: number; fh: number; progress: number } // detection in VIDEO pixels

/**
 * Full-screen scanner. Photos are collected in a tray of up to six; nothing is sent for reading until the user taps
 * "Read N cards", so a batch costs one deliberate step, not one AI call per shutter press.
 * With Auto Detect on, the card is found, outlined and captured straightened when the phone is held still.
 * `single` (adding a back side to an existing card) skips the tray and hands the photo straight back.
 */
export default function Camera({ onCard, onSubmit, onClose, onGallery, eventLabel = '', single = false, sidedOnly = false }: {
  /** Single-photo mode only. */
  onCard?: (files: File[]) => void
  /** Tray mode: the batch of cards to read. Each card is its photo(s): [front] or [front, back]. */
  onSubmit?: (cards: File[][]) => void
  onClose: () => void
  onGallery?: (files: FileList) => void
  eventLabel?: string
  single?: boolean
  sidedOnly?: boolean
}) {
  const video = useRef<HTMLVideoElement>(null)
  const view = useRef<HTMLDivElement>(null)
  const track = useRef<MediaStreamTrack | null>(null)
  const [error, setError] = useState('')
  const [tray, setTray] = useState<Shot[]>([])
  const trayRef = useRef<Shot[]>([])
  trayRef.current = tray
  const shotId = useRef(0)
  const submitted = useRef(false)
  const [flashKey, setFlashKey] = useState(0)
  const [notice, setNotice] = useState('')
  const noticeTimer = useRef(0)
  const full = !single && tray.length >= MAX_CARDS
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
  const [frontFile, setFrontFile] = useState<File | null>(null)
  const frontUrl = useObjectUrl(frontFile ?? undefined)
  const hasFront = !!frontFile
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
    let cost: number | null = null, gap = MIN_GAP_MS                     // how long a look takes on this phone, and so how often to look
    let stopped = false, timer = 0, vfc = 0

    const tick = () => {
      if (stopped) return
      const now = performance.now()
      if (v.videoWidth && now - lastRun >= gap) {
        lastRun = now
        const k = ANALYSE_WIDTH / v.videoWidth
        c.width = ANALYSE_WIDTH; c.height = Math.max(1, Math.round(v.videoHeight * k))
        ctx.drawImage(v, 0, 0, c.width, c.height)
        const d = detectCard(ctx.getImageData(0, 0, c.width, c.height).data, c.width, c.height)
        cost = smooth(cost, performance.now() - now); gap = nextGap(cost, MIN_GAP_MS)
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
      else timer = window.setTimeout(tick, gap)
    }
    schedule()
    return () => { stopped = true; clearTimeout(timer); if (vfc && 'cancelVideoFrameCallback' in v) (v as HTMLVideoElement & { cancelVideoFrameCallback: (h: number) => void }).cancelVideoFrameCallback(vfc) }
  }, [auto, mode, error])

  const say = (msg: string) => {
    setNotice(msg)
    clearTimeout(noticeTimer.current)
    noticeTimer.current = window.setTimeout(() => setNotice(''), 1700)
  }

  /** A shot is complete: single mode hands it back at once; otherwise it drops into the tray, with unmistakable feedback. */
  const finish = (files: File[]) => {
    navigator.vibrate?.(30)
    if (single) { onCard?.(files); onClose(); return }
    if (trayRef.current.length >= MAX_CARDS) return
    const shot: Shot = { id: ++shotId.current, files, url: URL.createObjectURL(files[0]!) }
    trayRef.current = [...trayRef.current, shot]     // update at once so two quick captures can never exceed the cap
    setTray(trayRef.current)
    setFlashKey((k) => k + 1)
    const n = trayRef.current.length
    say(n >= MAX_CARDS ? `Captured ${n} of ${MAX_CARDS}. Tray full` : `Captured ${n} of ${MAX_CARDS}`)
  }
  const removeShot = (id: number) => {
    const gone = trayRef.current.find((t) => t.id === id)
    if (gone) URL.revokeObjectURL(gone.url)
    trayRef.current = trayRef.current.filter((t) => t.id !== id)
    setTray(trayRef.current)
  }
  useEffect(() => () => { trayRef.current.forEach((t) => URL.revokeObjectURL(t.url)); clearTimeout(noticeTimer.current) }, [])

  const setFront = (f: File | null) => { front.current = f; setFrontFile(f) }
  const flushFront = () => { if (front.current) { const f = front.current; setFront(null); finish([f]) } }

  /** Everything captured so far, as cards (a front still waiting for its back counts as a one-sided card). */
  const collect = (): File[][] => {
    const cards = trayRef.current.map((t) => t.files)
    if (front.current) cards.push([front.current])
    return cards
  }
  const submit = () => {
    const cards = collect()
    if (!cards.length) return
    submitted.current = true
    onSubmit?.(cards)
    onClose()
  }
  /** Closing with unread photos asks first. Also used by the Android back button, which may be told to stay. */
  const requestClose = (): boolean => {
    if (!single && !submitted.current && collect().length > 0) {
      const n = collect().length
      // The camera stays open while the question is asked; discarding then closes it.
      void confirmAsk({ title: `Discard ${n} unread ${n === 1 ? 'photo' : 'photos'}?`, confirmLabel: 'Discard', cancelLabel: 'Keep', danger: true })
        .then((ok) => { if (ok) { log('camera closed'); onClose() } })
      return false
    }
    log('camera closed')
    onClose()
    return true
  }
  useBackClose(true, requestClose)

  const shoot = (d?: VideoDet) => {
    if (!single && trayRef.current.length >= MAX_CARDS) { say('Tray full. Read these cards first'); return }
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
      if (front.current) { const f = front.current; setFront(null); finish([f, file]) } else setFront(file)
    }, 'image/jpeg', 0.92)
  }
  shootRef.current = shoot

  const pickMode = (m: Mode) => { flushFront(); setMode(m); try { localStorage.setItem(MODE_KEY, m) } catch { /* ignore */ } }
  const toggleAuto = () => { const n = !auto; setAuto(n); try { localStorage.setItem(AUTO_KEY, n ? '1' : '0') } catch { /* ignore */ } }
  const toggleTorch = async () => {
    const n = !torch
    try { await track.current?.applyConstraints({ advanced: [{ torch: n } as MediaTrackConstraintSet] }); setTorch(n) } catch { /* torch not available */ }
  }

  // Map a video-pixel point onto the viewfinder (the video is drawn with object-fit: cover).
  const toView = ([x, y]: Pt): Pt => {
    const s = Math.max(size.w / size.vw, size.h / size.vh)
    return [(size.w - size.vw * s) / 2 + x * s, (size.h - size.vh * s) / 2 + y * s]
  }
  const canOutline = !!det && size.vw > 0 && auto && mode !== 'many'

  // Everything outside the card is blurred and dimmed. The hole follows the detected card, or the guide frame when
  // nothing is detected. Both are four points so the browser can animate one into the other.
  const showVeil = !error && mode !== 'many' && size.w > 0 && size.h > 0
  const gw = size.w * CARD_GUIDE.widthFrac, gh = gw / CARD_GUIDE.aspect
  const guidePts: Pt[] = [[(size.w - gw) / 2, (size.h - gh) / 2], [(size.w + gw) / 2, (size.h - gh) / 2], [(size.w + gw) / 2, (size.h + gh) / 2], [(size.w - gw) / 2, (size.h + gh) / 2]]
  const holePts: Pt[] = canOutline && det ? det.quad.map(toView) : guidePts
  const px = (p: Pt) => `${p[0].toFixed(1)}px ${p[1].toFixed(1)}px`
  const veilClip = showVeil
    ? `polygon(evenodd, 0px 0px, ${size.w}px 0px, ${size.w}px ${size.h}px, 0px ${size.h}px, 0px 0px, ${holePts.map(px).join(', ')}, ${px(holePts[0]!)})`
    : undefined

  const n = tray.length + (hasFront ? 1 : 0)
  const derived = hasFront ? 'Now the back' : sidedOnly ? 'Back side' : full ? 'Tray full. Tap Read' : det ? (hold >= 1 ? 'Got it' : 'Hold steady') : mode === 'many' ? 'Lay cards flat, then tap' : tray.length ? `Next card · ${tray.length} of ${MAX_CARDS}` : auto ? 'Point at a card' : 'Fit the card in the frame'
  const status = notice || derived

  return (
    <div className="camera">
      <div className="viewfinder" ref={view}>
        {error ? <div className="err">{error}</div> : <video ref={video} playsInline muted />}

        {showVeil && <div className="veil" style={{ clipPath: veilClip }} aria-hidden="true" />}
        {!error && mode !== 'many' && !canOutline && (
          <div className={`guide${auto ? ' faint' : ''}`} style={{ width: `${CARD_GUIDE.widthFrac * 100}%`, aspectRatio: CARD_GUIDE.aspect }} />
        )}
        {canOutline && det && (
          <svg className="outline" width={size.w} height={size.h} aria-hidden="true">
            <polygon points={det.quad.map(toView).map((p) => p.map((v) => v.toFixed(1)).join(',')).join(' ')} className={hold >= 0.5 ? 'lock' : ''} />
          </svg>
        )}
        {flashKey > 0 && <div key={flashKey} className="shot-flash" aria-hidden="true" />}

        <div className="cam-top">
          <button className="round dark" onClick={requestClose} aria-label="Close"><Icon name="x" size={22} /></button>
          <div className="cam-mid">
            {!sidedOnly && !single && (
              <div className="seg" role="tablist">
                {MODES.map((m) => <button key={m.id} className={mode === m.id ? 'on' : ''} onClick={() => pickMode(m.id)}>{m.label}</button>)}
              </div>
            )}
            <span className={`pillbar${notice ? ' notice' : ''}`} role="status" aria-live="polite">{status}</span>
            {eventLabel && <span className="pillbar sub">{eventLabel}</span>}
          </div>
          <span className="round ghost" />
        </div>

        {hasFront && <button className="skip" onClick={flushFront}>Skip back</button>}

        <div className="cam-bottom">
          {struggling && auto && mode !== 'many' && tray.length === 0 && (
            <button className="tips" onClick={() => setStruggling(false)}>Trouble? Use a plain background, or turn off Auto detect</button>
          )}
          <div className="toggles">
            {torchOk && (
              <label className="toggle"><button className={`round dark${torch ? ' on' : ''}`} onClick={() => void toggleTorch()} aria-pressed={torch} aria-label="Flash"><Icon name={torch ? 'bolt' : 'boltoff'} size={20} /></button><span>Flash</span></label>
            )}
            {mode !== 'many' && (
              <label className="toggle"><button className={`round dark${auto ? ' on' : ''}`} onClick={toggleAuto} aria-pressed={auto} aria-label="Auto detect"><Icon name="frame" size={20} /></button><span>Auto detect</span></label>
            )}
          </div>

          {!single && (
            <div className="tray-wrap">
            <div className="tray-cap" aria-hidden="true"><span>Min 1</span><span>Max {MAX_CARDS}</span></div>
            <div className="tray" role="list" aria-label={`Captured cards, ${tray.length} of ${MAX_CARDS}`}>
              {Array.from({ length: MAX_CARDS }, (_, i) => {
                const t = tray[i]
                if (t) {
                  return (
                    <div key={t.id} className="slot filled" role="listitem">
                      <img src={t.url} alt={`Card ${i + 1}`} />
                      {t.files.length > 1 && <em>F+B</em>}
                      <button className="rm" onClick={() => removeShot(t.id)} aria-label={`Remove card ${i + 1}`}><Icon name="x" size={11} /></button>
                    </div>
                  )
                }
                if (i === tray.length && frontUrl) {
                  return <div key="pending" className="slot pending" role="listitem"><img src={frontUrl} alt="Front, waiting for the back" /><em>BACK?</em></div>
                }
                return <div key={`e${i}`} className="slot" aria-hidden="true"><i>{i + 1}</i></div>
              })}
            </div>
            </div>
          )}

          <div className="shutter-row">
            <div className="thumb-slot">
              {onGallery && !single && (
                <label className="toggle gallery"><span className="round dark"><Icon name="image" size={20} /></span><span>Gallery</span>
                  <input type="file" accept="image/*" multiple hidden onChange={(e) => {
                    const files = e.target.files
                    if (files && files.length) {
                      submitted.current = true
                      const cards = collect()
                      if (cards.length) onSubmit?.(cards)          // keep what was already captured
                      onGallery(files)
                      onClose()
                    }
                    e.target.value = ''
                  }} />
                </label>
              )}
            </div>
            <button className="shutter" onClick={() => shoot()} disabled={!!error || full} aria-label="Take photo" />
            <div className="thumb-slot right">
              {!single && n > 0 && (
                <button className="readbtn" onClick={submit}>Read {n} {n === 1 ? 'card' : 'cards'}<Icon name="chevron" size={16} /></button>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}
