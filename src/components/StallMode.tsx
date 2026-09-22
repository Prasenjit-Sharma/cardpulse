import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../lib/auth'
import { cardQr } from '../lib/cardqr'
import { publicCardUrl, publishCard } from '../lib/cloudcards'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'
import { useBackClose } from '../lib/useBackClose'
import { cloudEnabled } from '../lib/supabase'
import type { EventRec } from '../lib/types'
import { useOnline } from '../lib/useOnline'
import { useWakeLock } from '../lib/wakelock'
import Icon from './Icon'
import Picker from './Picker'

type Mode = 'share' | 'leads'

/**
 * The QR as big as the screen allows, nothing else competing, screen kept awake. "Just share" is the offline vCard
 * QR (works with zero signal on either phone); "Collect leads" publishes the card and encodes a link instead, so the
 * visitor's own phone can leave their details — that needs a signal on the visitor's side to load the page. Which
 * event a lead is filed under is chosen here, independent of whatever event the rest of the app is scanning into.
 */
export default function StallMode({ card, events, initialEventId, onClose }: { card: MyCard; events: EventRec[]; initialEventId?: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useBackClose(true, onClose)
  const { supported } = useWakeLock(true)
  const session = useSession()
  const online = useOnline()
  const [mode, setMode] = useState<Mode>('share')
  const [eventChoice, setEventChoice] = useState(initialEventId ?? '')
  const [slug, setSlug] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const canCollect = cloudEnabled && !!session
  const eventName = events.find((e) => e.id === eventChoice)?.name
  const linkUrl = slug ? publicCardUrl(slug, eventChoice || undefined, eventName) : null

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
  }, [card, mode, linkUrl])

  const showQr = mode === 'share' || (mode === 'leads' && !!linkUrl)

  return createPortal(
    <div className="stall" role="dialog" aria-modal="true" aria-label="QR code for your contact card">
      <button className="icon-btn ghost stall-close" onClick={onClose} aria-label="Close"><Icon name="x" size={24} /></button>

      {cloudEnabled && (
        <div className="seg stall-seg" role="group" aria-label="Stall mode">
          <button aria-pressed={mode === 'share'} onClick={() => setMode('share')}>Just share</button>
          <button aria-pressed={mode === 'leads'} onClick={() => setMode('leads')} disabled={!canCollect}>Collect leads</button>
        </div>
      )}
      {mode === 'leads' && !canCollect && <p className="stall-hint">Sign in from Settings to collect leads.</p>}
      {mode === 'leads' && canCollect && events.length > 0 && (
        <Picker className="stall-event" title="Filing leads under" value={eventChoice} onChange={setEventChoice}
          options={[{ value: '', label: 'No event' }, ...events.map((e) => ({ value: e.id, label: e.name }))]} />
      )}
      {mode === 'leads' && canCollect && publishing && <p className="stall-hint">Setting up…</p>}
      {mode === 'leads' && canCollect && publishError && <p className="stall-hint">{publishError}</p>}

      <p className="stall-cap">{mode === 'leads' && linkUrl ? 'Scan to view my card and share yours' : 'Scan to save my contact'}</p>
      {showQr && <canvas ref={canvas} className="stall-qr" role="img" aria-label={`Contact card QR for ${card.name}`} />}
      <strong className="stall-name">{card.name}</strong>
      {card.company && <span className="stall-co">{card.company}</span>}
      {!supported && <p className="stall-hint">Raise your screen timeout so the code stays on.</p>}
    </div>,
    document.body,
  )
}
