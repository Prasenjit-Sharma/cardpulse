import { useEffect, useRef, useState } from 'react'
import { decodeQr, decodeQrFile } from '../lib/qrdecode'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'

type PhotoMode = 'single' | 'sided' | 'many'
const PHOTO_MODES: { id: PhotoMode; label: string }[] = [{ id: 'single', label: 'Card' }, { id: 'sided', label: 'Front + back' }, { id: 'many', label: 'Many' }]
const EVERY_MS = 180

/**
 * Scans a QR code: a visiting card that carries one, or another CardPulse user's card. Reads continuously from the
 * camera and stops on the first code it finds; a photo from the gallery works too. `paused` holds it while a result is shown.
 */
export default function QrScanner({ paused, eventLabel, onFound, onPhotoMode, onClose }: {
  paused: boolean
  eventLabel?: string
  onFound: (text: string) => void
  onPhotoMode: (m: PhotoMode) => void
  onClose: () => void
}) {
  const video = useRef<HTMLVideoElement>(null)
  const [error, setError] = useState('')
  const [miss, setMiss] = useState('')
  const pausedRef = useRef(paused)
  pausedRef.current = paused
  const foundRef = useRef(onFound)
  foundRef.current = onFound
  useBackClose(true, onClose)

  useEffect(() => {
    let stream: MediaStream | null = null, live = true, timer = 0
    navigator.mediaDevices?.getUserMedia({ video: { facingMode: { ideal: 'environment' }, width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false })
      .then((s) => {
        if (!live) { s.getTracks().forEach((t) => t.stop()); return }
        stream = s
        if (video.current) { video.current.srcObject = s; void video.current.play().catch(() => {}) }
        const tick = async () => {
          if (!live) return
          const v = video.current
          if (v && !pausedRef.current && v.readyState >= 2) {
            const text = await decodeQr(v)
            if (text && live && !pausedRef.current) { navigator.vibrate?.(40); foundRef.current(text) }
          }
          timer = window.setTimeout(() => void tick(), EVERY_MS)
        }
        void tick()
      })
      .catch((e: Error) => setError(e.name === 'NotAllowedError' ? 'Camera permission was denied. Allow it in the browser settings, or pick a photo of the QR.' : 'The camera could not start. Pick a photo of the QR instead.'))
    return () => { live = false; clearTimeout(timer); stream?.getTracks().forEach((t) => t.stop()) }
  }, [])

  const fromPhoto = async (f?: File) => {
    if (!f) return
    setMiss('')
    const text = await decodeQrFile(f)
    if (text) onFound(text); else setMiss('No QR code found in that photo.')
  }

  return (
    <div className="camera qr-scan">
      <div className="viewfinder">
        {!error && <video ref={video} playsInline muted />}
        {error && <div className="err"><p>{error}</p></div>}
        <div className="qr-shade" aria-hidden="true"><div className="qr-window"><i /><i /><i /><i /></div></div>
      </div>
      <div className="cam-top">
        <button className="round dark" onClick={onClose} aria-label="Close"><Icon name="x" size={22} /></button>
        <div className="cam-mid">
          <div className="seg" role="group" aria-label="What to scan">
            {PHOTO_MODES.map((m) => <button key={m.id} onClick={() => onPhotoMode(m.id)}>{m.label}</button>)}
            <button className="on" aria-pressed="true">QR</button>
          </div>
          {eventLabel && <span className="pillbar sub">{eventLabel}</span>}
        </div>
        <span style={{ width: 44 }} />
      </div>
      <div className="cam-bottom qr-bottom">
        <p className="pillbar">{miss || 'Point at a QR code on a card, or at another CardPulse user’s card'}</p>
        <label className="toggle">
          <span className="round dark"><Icon name="image" size={20} /></span>
          <span>Photo of a QR</span>
          <input type="file" accept="image/*" hidden onChange={(e) => { void fromPhoto(e.target.files?.[0]); e.target.value = '' }} />
        </label>
      </div>
    </div>
  )
}
