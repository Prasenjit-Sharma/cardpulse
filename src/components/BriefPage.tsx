import { useEffect, useRef, useState } from 'react'
import { hostOf } from '../../shared/brief-core'
import { signInWithGoogle, useSession } from '../lib/auth'
import { ALLOWANCE, EXTRA_BRIEFS, PLANS, rupees } from '../../shared/plans'
import { parseBalance, setBalance } from '../lib/balance'
import { useStoredBalance } from '../lib/useBalance'
import { BriefFailure, briefText, freshBrief, hasLink, linkLabel, pendingBrief, requestBrief, runBrief, type Brief, type Section } from '../lib/brief'
import { API_URL } from '../lib/gemini'
import { shareNav } from '../lib/platform'
import { supabase } from '../lib/supabase'
import type { BriefLink } from '../../shared/brief-core'
import type { Contact } from '../lib/types'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'
import Sheet, { SheetItem } from './Sheet'
import './brief.css'

const CAPTIONS = ['Reading the card…', 'Recalling what is known…', 'Writing the brief…']
const CAPTION_AT_MS = [0, 2500, 6000]           // timed: the model does not report its steps
const TITLES: Record<Section, string> = { person: 'About the person', company: 'About the company', starters: 'Conversation starters' }

const accessToken = async () => (supabase ? (await supabase.auth.getSession().catch(() => null))?.data.session?.access_token : undefined)
const day = (t: number) => new Date(t).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })

/**
 * Pulse Brief: a short brief on the person and their company, from what Gemini knows (or a web search, when the server
 * has it on). A kept brief opens at once; a new one shows a pulse while it is made, and is saved even if the page closes.
 */
export default function BriefPage({ contact, briefKey, onSave, onAddLink, onPlans, onClose }: {
  contact: Contact
  /** The card id and person, so one search runs per contact. */
  briefKey: string
  /** Saves a finished brief to the contact. Called even after this page has closed. */
  onSave: (b: Brief) => void
  onAddLink: (l: BriefLink) => void
  /** Plan & cards, from the locked state (Pulse Brief is part of Pro, or none left this month). */
  onPlans: () => void
  onClose: () => void
}) {
  useBackClose(true, onClose)
  const userId = useSession()?.user.id
  const balance = useStoredBalance(userId)
  const brief = freshBrief(contact)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<BriefFailure | null>(null)
  const [step, setStep] = useState(0)
  const [arrived, setArrived] = useState(false)
  const [menu, setMenu] = useState(false)
  const [flash, setFlash] = useState('')
  const alive = useRef(true)
  useEffect(() => () => { alive.current = false }, [])

  const follow = (p: Promise<Brief>) => {
    setBusy(true); setError(null); setStep(0)
    p.then((b) => { onSave(b); if (alive.current) setArrived(true) })
      .catch((e) => { if (alive.current) setError(e instanceof BriefFailure ? e : new BriefFailure('failed', "Couldn't make the brief. Try again.")) })
      .finally(() => { if (alive.current) setBusy(false) })
  }
  const start = (fresh = false) => follow(runBrief(briefKey, async () => requestBrief(contact, { url: API_URL, token: await accessToken(), online: navigator.onLine, fetch: (...a) => fetch(...a), fresh, onBalance: (x) => { const nb = parseBalance(x); if (nb) setBalance(nb, userId) } })))

  // join a search already running for this contact; otherwise search when nothing is kept yet
  useEffect(() => {
    const p = pendingBrief(briefKey)
    if (p) follow(p)
    else if (!brief) start()
  }, [])   // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!busy) return
    const timers = CAPTION_AT_MS.slice(1).map((ms, i) => window.setTimeout(() => setStep(i + 1), ms))
    return () => timers.forEach(clearTimeout)
  }, [busy])
  useEffect(() => { if (!flash) return; const t = setTimeout(() => setFlash(''), 2200); return () => clearTimeout(t) }, [flash])

  const copy = async (text: string) => {
    try { await navigator.clipboard.writeText(text); setFlash('Copied.') } catch { setFlash('Could not copy.') }
  }
  const share = async (text: string) => {
    const nav = shareNav()
    if (typeof nav.share !== 'function') return copy(text)
    try { await nav.share({ title: `Pulse Brief: ${contact.name || contact.company}`, text }) }
    catch (e) { if ((e as Error)?.name !== 'AbortError') await copy(text) }
  }

  const who = contact.name || contact.company || 'Contact'
  const section = (b: Brief, s: Section, i: number) => {
    const text = s === 'starters' ? b.starters.length > 0 : !!b[s]
    if (!text) return null
    return (
      <section key={s} className={`brief-card${arrived ? ' arrive' : ''}`} style={{ ['--i' as string]: i }}>
        <h2>{TITLES[s]}</h2>
        {s === 'starters' ? <ul>{b.starters.map((x) => <li key={x}>{x}</li>)}</ul> : <p>{b[s]}</p>}
        <div className="brief-acts">
          <button className="icon-btn ghost small" onClick={() => void share(briefText(contact, b, s))} aria-label={`Share ${TITLES[s].toLowerCase()}`}><Icon name="share" size={16} /></button>
          <button className="icon-btn ghost small" onClick={() => void copy(briefText(contact, b, s))} aria-label={`Copy ${TITLES[s].toLowerCase()}`}><Icon name="copy" size={16} /></button>
        </div>
      </section>
    )
  }

  return (
    <div className="brief-page" role="dialog" aria-modal="true" aria-label={`Pulse Brief on ${who}`}>
      <header className="bar-top brief-top">
        <button className="icon-btn" onClick={onClose} aria-label="Back"><Icon name="back" /></button>
        <div className="brief-title"><strong>Pulse Brief</strong><small>{who}</small></div>
        <button className="icon-btn" onClick={() => setMenu(true)} aria-label="More options" disabled={!brief && busy}><Icon name="more" /></button>
      </header>

      {busy ? (
        <div className="brief-loading" role="status" aria-live="polite">
          <div className="brief-pulse" aria-hidden="true"><Icon name="spark" size={26} /></div>
          <p className="brief-cap" key={step}>{CAPTIONS[step]}</p>
          {[0, 1, 2].map((i) => (
            <div key={i} className="brief-card skel" aria-hidden="true">
              <span className="brief-skel w40" /><span className="brief-skel" /><span className="brief-skel" /><span className="brief-skel w70" />
            </div>
          ))}
        </div>
      ) : (
        <>
          {error && (error.code === 'pro_only' || error.code === 'no_briefs') ? (
            <div className={`brief-locked${brief ? ' small' : ''}`} role="status">
              <span className="tool-well"><Icon name="spark" size={20} /></span>
              <div className="grow">
                <strong>{error.code === 'pro_only' ? 'Pulse Brief is part of Pro' : 'No briefs left this month'}</strong>
                <p>{error.code === 'pro_only'
                  ? `Pro gives ${ALLOWANCE.pro.briefs} briefs and ${ALLOWANCE.pro.cards} cards a month, for ${rupees(PLANS.find((p) => p.tier === 'pro')!.monthly)} a month.`
                  : `Your ${ALLOWANCE.pro.briefs} come back on ${balance ? new Date(balance.periodEnd).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' }) : 'the 1st'}. Or add ${EXTRA_BRIEFS.briefs} extra for ${rupees(EXTRA_BRIEFS.price)}.`}
                  {brief ? ' This saved brief still opens.' : ' Saved briefs always open.'}</p>
                <button className="cta small" onClick={onPlans}>See plans</button>
              </div>
            </div>
          ) : error && (
            <div className={`brief-error${brief ? ' small' : ''}`} role="alert">
              <p>{error.message}</p>
              {error.code === 'sign_in' ? <button className="cta small" onClick={() => void signInWithGoogle()}>Sign in</button>
                : error.code !== 'daily_limit' && error.code !== 'offline' && <button className="outline small" onClick={() => start()}>Try again</button>}
            </div>
          )}
          {brief && (
            <>
              {(['person', 'company', 'starters'] as Section[]).map((s, i) => section(brief, s, i))}
              {brief.sources.length > 0 && (
                <p className="brief-sources">Sources: {brief.sources.slice(0, 6).map((s, i) => <span key={s.uri}>{i > 0 && ', '}<a href={s.uri} target="_blank" rel="noreferrer">{s.title}</a></span>)}</p>
              )}
              {brief.suggestions && (
                <iframe className="brief-suggest" title="Google Search suggestions" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={`<base target="_blank">${brief.suggestions}`} />
              )}
              {brief.links.length > 0 && (
                <>
                  <h3 className="group band">Add to profile</h3>
                  <div className="brief-links">
                    {brief.links.map((l) => {
                      const has = hasLink(contact, l.url)
                      return (
                        <div key={l.url} className="brief-link">
                          <Icon name="globe" size={18} />
                          <a className="grow" href={l.url} target="_blank" rel="noreferrer"><b>{linkLabel(l)}</b><small>{hostOf(l.url)}</small></a>
                          <button className={`icon-btn ghost${has ? ' done' : ''}`} disabled={has} onClick={() => { onAddLink(l); setFlash('Added to the contact.') }}
                            aria-label={has ? `${linkLabel(l)} is on the contact` : `Add ${linkLabel(l)} to the contact`}><Icon name={has ? 'check' : 'plus'} size={20} /></button>
                        </div>
                      )
                    })}
                  </div>
                </>
              )}
              <p className="brief-foot">{brief.sources.length || brief.suggestions
                ? `Found on the web on ${day(brief.at)} with Google Search. Public information; check before relying on it.`
                : `Written on ${day(brief.at)} by Gemini from what it already knows, without a web search. It can be out of date or wrong; check before relying on it.`}</p>
            </>
          )}
        </>
      )}

      <Sheet open={menu} onClose={() => setMenu(false)} title="Pulse Brief">
        {brief && <SheetItem icon="copy" label="Copy all" onClick={() => { setMenu(false); void copy(briefText(contact, brief)) }} />}
        {brief && <SheetItem icon="share" label="Share all" onClick={() => { setMenu(false); void share(briefText(contact, brief)) }} />}
        <SheetItem icon="refresh" label="Refresh" hint="A fresh brief; counts towards today's 10" disabled={busy} onClick={() => { setMenu(false); start(true) }} />
      </Sheet>
      {flash && <div className="flash brief-flash" role="status">{flash}</div>}
    </div>
  )
}
