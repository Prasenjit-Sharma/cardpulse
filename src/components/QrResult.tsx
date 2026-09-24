import { useEffect, useMemo, useState } from 'react'
import { fetchPublicCard } from '../lib/cloudcards'
import { submitLead } from '../lib/leads'
import { noteShare } from '../lib/sharelog'
import type { MyCard } from '../lib/mycards'
import { parseQr } from '../lib/qrcontact'
import { cloudEnabled } from '../lib/supabase'
import { emptyContact, type Contact } from '../lib/types'
import Check from './Check'
import Icon from './Icon'
import Sheet from './Sheet'

type State =
  | { step: 'loading' }
  | { step: 'preview'; contact: Contact; cardId?: string; eventId?: string; eventName?: string }
  | { step: 'saved'; name: string; sentBack: boolean }
  | { step: 'link'; url: string }
  | { step: 'text'; text: string }
  | { step: 'error'; message: string }

/**
 * What a scanned QR turned out to be, and the one next step: save the contact (and, for another CardPulse user's
 * card link, send them yours back in the same tap), open a link, or copy text.
 */
export default function QrResult({ raw, myCard, onSave, onShowMyQr, onAgain, onClose }: {
  raw: string
  /** The user's own card, if they have made one: offered back to the person whose card was scanned. */
  myCard?: MyCard
  onSave: (c: Contact) => Promise<void>
  onShowMyQr: () => void
  onAgain: () => void
  onClose: () => void
}) {
  const parsed = useMemo(() => parseQr(raw), [raw])
  const [state, setState] = useState<State>({ step: 'loading' })
  const [sendBack, setSendBack] = useState(!!myCard)
  const [busy, setBusy] = useState(false)

  useEffect(() => {
    let live = true
    if (parsed.kind === 'contact') setState({ step: 'preview', contact: parsed.contact })
    else if (parsed.kind === 'link') setState({ step: 'link', url: parsed.url })
    else if (parsed.kind === 'text') setState({ step: 'text', text: parsed.text })
    else if (!cloudEnabled || !navigator.onLine) setState({ step: 'error', message: 'This is a CardPulse card link. Connect to the internet to open it.' })
    else void fetchPublicCard(parsed.slug).then((d) => {
      if (!live) return
      if (!d) { setState({ step: 'error', message: 'This card link is no longer available.' }); return }
      setState({
        step: 'preview', cardId: d.id, eventId: parsed.eventId, eventName: parsed.eventName,
        contact: { ...emptyContact(), name: d.name, title: d.title, company: d.company, phones: d.phones, emails: d.emails, website: d.website, address: d.address, social: d.social },
      })
    })
    return () => { live = false }
  }, [parsed])

  const save = async () => {
    if (state.step !== 'preview') return
    setBusy(true)
    let sentBack = false
    try {
      await onSave(state.contact)
      // Their card is a CardPulse link: leave your own details with them, exactly as a visitor at their stall would.
      if (state.cardId && sendBack && myCard) {
        try {
          await submitLead(state.cardId, state.eventId ?? null, state.eventName ?? null, { name: myCard.name, phone: myCard.phones[0] ?? '', email: myCard.emails[0] ?? '', company: myCard.company })
          sentBack = true
          noteShare(myCard.id, 'exchange')
        } catch { /* their card is saved either way; sending ours back is a bonus */ }
      }
      setState({ step: 'saved', name: state.contact.name || state.contact.company || 'Contact', sentBack })
    } catch { setState({ step: 'error', message: 'The contact could not be saved. Try again.' }) }
    setBusy(false)
  }

  const c = state.step === 'preview' ? state.contact : null
  return (
    <Sheet open onClose={onClose} title={state.step === 'saved' ? 'Saved' : c ? 'Contact from a QR code' : 'QR code'}>
      <div className="sheet-body qr-result">
        {state.step === 'loading' && <p className="hint">Opening their card…</p>}

        {c && (
          <>
            <div className="qr-person">
              <span className="avatar qr-avatar" aria-hidden="true">{(c.name || c.company || '?').trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join('').toUpperCase()}</span>
              <div className="grow">
                <strong>{c.name || c.company || 'No name'}</strong>
                {(c.title || (c.name && c.company)) && <small>{[c.title, c.name ? c.company : ''].filter(Boolean).join(' · ')}</small>}
              </div>
            </div>
            <ul className="qr-fields">
              {c.phones.map((p) => <li key={p}><Icon name="phone" size={16} />{p}</li>)}
              {c.emails.map((e) => <li key={e}><Icon name="mail" size={16} />{e}</li>)}
              {c.website && <li><Icon name="globe" size={16} />{c.website}</li>}
              {c.address && <li><Icon name="pin" size={16} />{c.address}</li>}
            </ul>
            {state.step === 'preview' && state.cardId && myCard && (
              <Check checked={sendBack} onChange={setSendBack}>Send them my card too <small>{myCard.name}{myCard.phones[0] ? ` · ${myCard.phones[0]}` : ''}</small></Check>
            )}
            <button className="cta wide" disabled={busy} onClick={() => void save()}><Icon name="download" size={18} /> {busy ? 'Saving…' : 'Save contact'}</button>
            <button className="outline wide" onClick={onAgain}>Scan another</button>
          </>
        )}

        {state.step === 'saved' && (
          <>
            <p className="qr-done"><span className="toast-check"><Icon name="check" size={16} /></span>{state.name} is in your contacts{state.sentBack ? ', and your card was sent to them.' : '.'}</p>
            {myCard && !state.sentBack && <button className="cta wide" onClick={onShowMyQr}><Icon name="frame" size={18} /> Let them scan my card</button>}
            <button className={myCard && !state.sentBack ? 'outline wide' : 'cta wide'} onClick={onAgain}>Scan another</button>
            <button className="outline wide" onClick={onClose}>Done</button>
          </>
        )}

        {state.step === 'link' && (
          <>
            <p className="qr-raw">{state.url}</p>
            <p className="hint">This QR code is a link, not a contact.</p>
            <button className="cta wide" onClick={() => window.open(state.url, '_blank', 'noopener')}><Icon name="globe" size={18} /> Open link</button>
            <button className="outline wide" onClick={onAgain}>Scan another</button>
          </>
        )}

        {state.step === 'text' && (
          <>
            <p className="qr-raw">{state.text}</p>
            <button className="cta wide" onClick={() => void navigator.clipboard?.writeText(state.text)}><Icon name="note" size={18} /> Copy text</button>
            <button className="outline wide" onClick={onAgain}>Scan another</button>
          </>
        )}

        {state.step === 'error' && (
          <>
            <p className="hint bad">{state.message}</p>
            <button className="cta wide" onClick={onAgain}>Scan another</button>
          </>
        )}
      </div>
    </Sheet>
  )
}
