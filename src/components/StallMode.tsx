import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../lib/auth'
import { cardQr } from '../lib/cardqr'
import { publicCardUrl, publishCard } from '../lib/cloudcards'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'
import { defaultCaption } from '../lib/stallcaption'
import { useBackClose } from '../lib/useBackClose'
import { cloudEnabled } from '../lib/supabase'
import { noteShare } from '../lib/sharelog'
import type { EventRec } from '../lib/types'
import { useOnline } from '../lib/useOnline'
import { useWakeLock } from '../lib/wakelock'
import { useObjectUrl } from '../lib/useObjectUrl'
import { photoKindOf, type PhotoKind } from '../lib/cardphoto'
import Icon from './Icon'
import Picker from './Picker'
import Sheet from './Sheet'
import { showEvent } from '../lib/eventname'

type Mode = 'share' | 'leads'
type Step = 'setup' | 'show'

/**
 * Setup is a compact bottom sheet — mode, event and caption, all optional to change, same as every other sheet in
 * the app. Only "Show QR" opens the full-screen view: the QR as big as the screen allows, nothing else competing,
 * screen kept awake. "Just share" is the offline vCard QR (works with zero signal on either phone); "Collect leads"
 * publishes the card and encodes a link instead, so the visitor's own phone can leave their details.
 */
export default function StallMode({ card, events, initialEventId, onClose }: { card: MyCard; events: EventRec[]; initialEventId?: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  const [step, setStep] = useState<Step>('setup')
  const photoUrl = useObjectUrl(card.photo)
  const [picKind, setPicKind] = useState<PhotoKind>('face')
  useBackClose(step === 'show', () => { setStep('setup'); return false })
  useEffect(() => { if (step === 'show') noteShare(card.id, 'qr') }, [step, card.id])
  const { supported } = useWakeLock(step === 'show')
  const session = useSession()
  const online = useOnline()
  const [mode, setMode] = useState<Mode>('share')
  const [eventChoice, setEventChoice] = useState(initialEventId ?? '')
  const [caption, setCaption] = useState(defaultCaption('share'))
  const [captionTouched, setCaptionTouched] = useState(false)
  const [slug, setSlug] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const canCollect = cloudEnabled && !!session
  const eventName = events.find((e) => e.id === eventChoice)?.name
  const linkUrl = slug ? publicCardUrl(slug, eventChoice || undefined, eventName) : null

  const chooseMode = (m: Mode) => {
    setMode(m)
    if (!captionTouched) setCaption(defaultCaption(m))                // follow the mode's own default until the user types their own
  }

  // Publishing starts as soon as "Collect leads" is chosen, so the QR is usually ready by the time setup is done.
  useEffect(() => {
    if (mode !== 'leads' || !canCollect || slug || publishing) return
    if (!online) { setPublishError('Needs internet to set up.'); return }
    setPublishing(true); setPublishError('')
    void publishCard(card, session!.user.id)
      .then((r) => setSlug(r.slug))
      .catch(() => setPublishError('Could not set this up. Try again.'))
      .finally(() => setPublishing(false))
  }, [mode, canCollect, slug, publishing, online, card, session])

  useEffect(() => {
    if (step !== 'show') return
    const el = canvas.current
    if (!el) return
    const showingLink = mode === 'leads' && !!linkUrl
    if (mode === 'leads' && !showingLink) return                       // nothing to draw yet (publishing, or blocked)
    const m = showingLink ? qrMatrix(linkUrl!) : cardQr(card).matrix
    const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 800
    el.width = px; el.height = px
    const ctx = el.getContext('2d')!
    const quiet = 4, cell = px / (m.length + 2 * quiet)
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px)
    ctx.fillStyle = '#16191D'
    m.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell)) }))
  }, [card, mode, linkUrl, step])

  const showQr = mode === 'share' || (mode === 'leads' && !!linkUrl)
  const readyToShow = mode === 'share' || (canCollect && (slug || publishError))

  if (step === 'setup') {
    return (
      <Sheet open onClose={onClose} title="Show QR">
        <div className="log-form">
          {cloudEnabled && (
            <div className="seg stall-seg" role="group" aria-label="Stall mode">
              <button aria-pressed={mode === 'share'} onClick={() => chooseMode('share')}>Just share</button>
              <button aria-pressed={mode === 'leads'} onClick={() => chooseMode('leads')} disabled={!canCollect}>Collect leads</button>
            </div>
          )}
          {mode === 'leads' && !canCollect && <p className="hint">Sign in from Settings to collect leads.</p>}

          <div className="log-field">
            <span className="log-label">Event</span>
            <Picker className="pick wide" title="Event" value={eventChoice} onChange={setEventChoice}
              options={[{ value: '', label: 'No event' }, ...events.map((e) => ({ value: e.id, label: showEvent(e.name) }))]} />
          </div>

          <div className="log-field">
            <span className="log-label">Caption</span>
            <input value={caption} onChange={(e) => { setCaption(e.target.value); setCaptionTouched(true) }} maxLength={60} aria-label="Caption shown above the QR" />
          </div>

          {mode === 'leads' && canCollect && publishError && <p className="hint bad">{publishError}</p>}
          <button className="cta wide" disabled={!readyToShow} onClick={() => setStep('show')}>
            {mode === 'leads' && publishing ? 'Setting up…' : 'Show QR'}
          </button>
        </div>
      </Sheet>
    )
  }

  return createPortal(
    <div className="stall" role="dialog" aria-modal="true" aria-label="QR code for your contact card">
      <button className="icon-btn ghost stall-close" onClick={() => setStep('setup')} aria-label="Back to setup"><Icon name="back" size={22} /></button>
      {eventName && <span className="stall-event-tag">{showEvent(eventName)}</span>}
      <p className="stall-cap">{caption}</p>
      {showQr && <canvas ref={canvas} className="stall-qr" role="img" aria-label={`Contact card QR for ${card.name}`} />}
      {photoUrl && <img className={`stall-pic ${picKind}`} src={photoUrl} alt="" onLoad={(e) => { const im = e.currentTarget; setPicKind(photoKindOf(im, im.naturalWidth, im.naturalHeight)) }} />}
      <strong className="stall-name">{card.name}</strong>
      {card.company && <span className="stall-co">{card.company}</span>}
      {!supported && <p className="stall-hint">Raise your screen timeout so the code stays on.</p>}
    </div>,
    document.body,
  )
}
