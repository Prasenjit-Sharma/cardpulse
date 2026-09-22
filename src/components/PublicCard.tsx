import { useEffect, useMemo, useState } from 'react'
import { applyAccent } from '../lib/accents'
import { buildCardVcf } from '../lib/cardvcf'
import { cardFileName } from '../lib/cardshare'
import { fetchPublicCard, type PublicCardData } from '../lib/cloudcards'
import { submitLead } from '../lib/leads'
import { emptyCard, type FontId, type MyCard, type TemplateId } from '../lib/mycards'
import { withTimeout } from '../lib/withTimeout'
import CardCanvas from './CardCanvas'
import Icon from './Icon'
import Logo from './Logo'

/** Everything except the photo — ready instantly, so the page (and the lead form) never waits on a network image. */
function cardWithoutPhoto(d: PublicCardData): MyCard {
  return {
    ...emptyCard(d.accent), name: d.name, title: d.title, company: d.company, phones: d.phones, emails: d.emails,
    website: d.website, address: d.address, social: d.social, template: d.template as TemplateId, accent: d.accent, font: d.font as FontId,
  }
}

/** The photo, fetched separately. On a stalled connection this gives up after 8s rather than blocking anything. */
async function fetchPhoto(url: string): Promise<Blob | undefined> {
  return withTimeout(fetch(url).then((r) => (r.ok ? r.blob() : undefined)).catch(() => undefined), 8000, undefined)
}

/** The page a visitor lands on after scanning a stall QR. No login, no app install. */
export default function PublicCard({ slug }: { slug: string }) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const eventId = params.get('event'), eventName = params.get('eventName')
  const [card, setCard] = useState<MyCard | 'notfound' | null>(null)
  const [cardId, setCardId] = useState('')
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState(''), [company, setCompany] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    let live = true
    void (async () => {
      const d = await fetchPublicCard(slug)
      if (!live) return
      if (!d) { setCard('notfound'); return }
      setCardId(d.id)
      applyAccent(d.accent)
      setCard(cardWithoutPhoto(d))
      if (d.photo_url) {
        const photo = await fetchPhoto(d.photo_url)
        if (live && photo) setCard((c) => (c && c !== 'notfound' ? { ...c, photo } : c))
      }
    })()
    return () => { live = false }
  }, [slug])

  const saveContact = () => {
    if (!card || card === 'notfound') return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buildCardVcf(card).text], { type: 'text/vcard' }))
    a.download = cardFileName(card, 'vcf')
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const send = async () => {
    setError('')
    if (!name.trim()) { setError('Add your name.'); return }
    setSending(true)
    try { await submitLead(cardId, eventId, eventName, { name, phone, email, company }); setSent(true) }
    catch { setError('Could not send. Try again.') }
    finally { setSending(false) }
  }

  if (card === null) return <div className="public-card-page"><p className="hint">Loading…</p></div>
  if (card === 'notfound') return <div className="public-card-page"><p className="hint">This card link is no longer available.</p></div>

  return (
    <div className="public-card-page">
      <CardCanvas card={card} />
      <button className="outline wide public-btn" onClick={saveContact}><Icon name="download" size={18} /> Save contact</button>
      {card.address && (
        <a className="outline wide public-btn" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`} target="_blank" rel="noreferrer">
          <Icon name="pin" size={18} /> Open address
        </a>
      )}

      {sent ? (
        <p className="hint ok">Thanks — they'll be in touch.</p>
      ) : (
        <div className="lead-form">
          <h3 className="section">Share your details</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" inputMode="tel" aria-label="Your phone" maxLength={20} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" inputMode="email" aria-label="Your email" maxLength={120} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" aria-label="Your company" maxLength={80} />
          {error && <p className="hint bad" role="alert">{error}</p>}
          <button className="cta wide public-btn" disabled={sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      )}

      <footer className="about public-card-foot"><Logo size={20} /><span>Made with CardPulse</span></footer>
    </div>
  )
}
