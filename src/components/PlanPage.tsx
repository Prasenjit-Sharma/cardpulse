import { useState } from 'react'
import { ALLOWANCE, EXTRA_BRIEFS, PACKS, PASS, PLANS, TRIAL_BRIEFS, rupees, type Tier } from '../../shared/plans'
import { briefLine, isLow, type Balance } from '../lib/balance'
import { signInWithGoogle } from '../lib/auth'
import Icon from './Icon'
import Sheet from './Sheet'
import './plan.css'

const TIER_NAME: Record<Tier, string> = { free: 'Free', plus: 'Plus', pro: 'Pro' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const perCard = (price: number, cards: number) => `₹${(price / cards).toFixed(2)} a card`

/**
 * Plan & cards: what the account has left, held like a position (figures in the page top, then the plan's rows), and
 * what can be added, priced like a watchlist. Payments open with the Play Store release; until then a row explains that.
 */
export default function PlanPage({ balance, signedIn, onBack }: { balance: Balance | null; signedIn: boolean; onBack: () => void }) {
  const [item, setItem] = useState<{ name: string; gives: string; price: string } | null>(null)
  const tier: Tier = balance?.tier ?? 'free'
  const b = balance
  const monthLeft = b ? Math.max(b.cards.month.allowance - b.cards.month.used, 0) : null
  const briefs = b ? briefLine(b) : ''

  return (
    <>
      <div className="page-top">
        <header className="page-head">
          <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Plan & cards</h1></div>
        </header>
        <div className="figgrid" style={{ ['--cols' as string]: 3 }} role="group" aria-label="What you have left">
          <div className={b && isLow(b) ? 'low' : ''}><span>Cards left</span><b className="num">{b ? b.cards.left : '–'}</b>{b && isLow(b) && <small>{b.cards.left ? 'Running low' : 'None left'}</small>}</div>
          <div><span>This month</span><b className="num">{b ? `${b.cards.month.used}/${b.cards.month.allowance}` : '–'}</b>{b && <small>New on {day(b.periodEnd)}</small>}</div>
          <div><span>Briefs left</span><b className="num">{b ? b.briefs.left : '–'}</b>{b && <small>{tier === 'pro' ? 'This month' : b.briefs.trial ? 'Trial' : 'Part of Pro'}</small>}</div>
        </div>
      </div>

      {!signedIn ? (
        <div className="plain-list">
          <div className="index-row static plan-signin">
            <span className="tool-well"><Icon name="cloud" size={18} /></span>
            <span className="grow"><strong>Sign in to read cards</strong><span className="muted wrap">You get {ALLOWANCE.free.cards} cards free each month, and {TRIAL_BRIEFS} Pulse Briefs to try.</span></span>
          </div>
          <div className="plan-cta"><button className="cta" onClick={() => void signInWithGoogle()}>Sign in with Google</button></div>
        </div>
      ) : !b ? (
        <>
          <h3 className="group band">Your plan</h3>
          <div className="plain-list">
            <div className="index-row static">
              <span className="grow"><strong>Plan not loaded yet</strong><span className="muted wrap">Shown when you are online</span></span>
              <span className="fig"><b className="num">–</b><small>cards left</small></span>
            </div>
          </div>
        </>
      ) : (
        <>
          <h3 className="group band">Your plan<span className="band-count">{TIER_NAME[tier]}</span></h3>
          <div className="plain-list">
            <div className="index-row static">
              <span className="grow"><strong>{tier === 'free' ? 'Free' : `${TIER_NAME[tier]} plan`}</strong>
                <span className="muted">{tier === 'free' ? `${ALLOWANCE.free.cards} cards each month` : `${ALLOWANCE[tier].cards} cards${ALLOWANCE[tier].briefs ? ` and ${ALLOWANCE[tier].briefs} briefs` : ''} a month, renews ${b ? day(b.periodEnd) : ''}`}</span></span>
              <span className="fig"><b className="num">{monthLeft ?? '–'}</b><small>left this month</small></span>
            </div>
            {b?.cards.pass && (
              <div className="index-row static">
                <span className="grow"><strong>Exhibition pass</strong><span className="muted">Ends {day(b.cards.pass.endsAt)}</span></span>
                <span className="fig"><b className="num">{Math.max(b.cards.pass.allowance - b.cards.pass.used, 0)}</b><small>left</small></span>
              </div>
            )}
            <div className="index-row static">
              <span className="grow"><strong>Pack cards</strong><span className="muted">Never expire. Used after the month's cards</span></span>
              <span className="fig"><b className="num">{b?.cards.pack ?? '–'}</b><small>cards</small></span>
            </div>
            <div className="index-row static">
              <span className="grow"><strong>Pulse Briefs</strong><span className="muted">{briefs || (tier === 'pro' ? 'None left this month' : 'Part of Pro')}</span></span>
              <span className="fig"><b className="num">{b?.briefs.left ?? '–'}</b><small>left</small></span>
            </div>
          </div>
        </>
      )}

      <h3 className="group band">Plans</h3>
      <div className="plain-list">
        {PLANS.map((p) => (
          <button key={p.tier} className="index-row" onClick={() => setItem({ name: p.name, gives: p.gives, price: `${rupees(p.monthly)} a month, or ${rupees(p.yearly)} a year` })}>
            <span className="grow"><strong>{p.name}{b && tier === p.tier && <em className="plan-tag">Current</em>}</strong><span className="muted wrap">{p.gives}, or {rupees(p.yearly)} a year</span></span>
            <span className="fig"><b className="num">{rupees(p.monthly)}</b><small>a month</small></span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
      </div>

      <h3 className="group band">Card packs<span className="band-count">Never expire</span></h3>
      <div className="plain-list">
        {PACKS.map((p) => (
          <button key={p.id} className="index-row" onClick={() => setItem({ name: `${p.cards} cards`, gives: `${p.cards} cards that never expire, used after the month's cards`, price: rupees(p.price) })}>
            <span className="grow"><strong>{p.cards} cards</strong><span className="muted">One-off</span></span>
            <span className="fig"><b className="num">{rupees(p.price)}</b><small>{perCard(p.price, p.cards)}</small></span>
            <Icon name="chevron" size={18} />
          </button>
        ))}
        {tier === 'pro' && (
          <button className="index-row" onClick={() => setItem({ name: `${EXTRA_BRIEFS.briefs} extra briefs`, gives: `${EXTRA_BRIEFS.briefs} Pulse Briefs that never expire, used after the month's ${ALLOWANCE.pro.briefs}`, price: rupees(EXTRA_BRIEFS.price) })}>
            <span className="grow"><strong>{EXTRA_BRIEFS.briefs} extra briefs</strong><span className="muted">For Pro, after the month's {ALLOWANCE.pro.briefs}</span></span>
            <span className="fig"><b className="num">{rupees(EXTRA_BRIEFS.price)}</b><small>never expire</small></span>
            <Icon name="chevron" size={18} />
          </button>
        )}
      </div>

      <h3 className="group band">At an exhibition</h3>
      <div className="plain-list">
        <button className="index-row" onClick={() => setItem({ name: 'Exhibition pass', gives: `Up to ${PASS.cards.toLocaleString('en-IN')} cards over ${PASS.days} days, from the day it starts`, price: rupees(PASS.price) })}>
          <span className="tool-well"><Icon name="calendar" size={18} /></span>
          <span className="grow"><strong>Exhibition pass</strong><span className="muted">Up to {PASS.cards.toLocaleString('en-IN')} cards over {PASS.days} days</span></span>
          <span className="fig"><b className="num">{rupees(PASS.price)}</b><small>{PASS.days} days</small></span>
          <Icon name="chevron" size={18} />
        </button>
      </div>

      <p className="plan-foot">Each contact read uses one card; a card that could not be read uses none. Export, your digital card and QR exchange are always free.</p>

      <Sheet open={!!item} onClose={() => setItem(null)} title={item?.name}>
        <div className="consent">
          <p>{item?.gives}. <b>{item?.price}</b>.</p>
          <p>Payments open with the Play Store release. Until then nothing can be bought here; your free cards still arrive each month.</p>
          <div className="consent-actions single"><button className="outline" onClick={() => setItem(null)}>OK</button></div>
        </div>
      </Sheet>
    </>
  )
}
