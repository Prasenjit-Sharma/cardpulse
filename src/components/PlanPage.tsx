import { useState } from 'react'
import { ALLOWANCE, DAILY, EXTRA_BRIEFS, isUnlimited, PACKS, PASS, PLANS, TRIAL_BRIEFS, rupees, type PaidTier, type Tier } from '../../shared/plans'
import type { Balance } from '../lib/balance'
import { signInWithGoogle, useSession } from '../lib/auth'
import { refreshBalance, useBalanceError } from '../lib/useBalance'
import Icon from './Icon'
import Sheet from './Sheet'
import './plan.css'

const TIER_NAME: Record<Tier, string> = { free: 'Free', starter: 'Starter', plus: 'Plus', pro: 'Pro', unlimited: 'Unlimited' }
const day = (iso: string) => new Date(iso).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })
const yearSaving = (p: { monthly: number; yearly: number }) => p.monthly * 12 - p.yearly
const BEST_SAVING = Math.max(...PLANS.map(yearSaving))
/** What each plan gives, in the product's own words; every line is true today. */
const GIVES: Record<PaidTier, string[]> = {
  starter: [`${ALLOWANCE.starter.cards} cards read every month`, `${ALLOWANCE.starter.briefs} Pulse Briefs a month`, 'Lead capture and brochures at your stall', 'Export, digital card and QR exchange'],
  plus: [`${ALLOWANCE.plus.cards} cards read every month`, `${ALLOWANCE.plus.briefs} Pulse Briefs a month`, 'Everything in Starter'],
  pro: [`${ALLOWANCE.pro.cards} cards read every month`, `${ALLOWANCE.pro.briefs} Pulse Briefs a month: who they are and what their company does, with sources`, 'Everything in Plus'],
  unlimited: [`Unlimited cards (fair use: ${DAILY.unlimitedReads} a day)`, `${ALLOWANCE.unlimited.briefs} Pulse Briefs a month`, 'Everything in Pro'],
}
const TAG: Partial<Record<PaidTier, string>> = { unlimited: 'Best for exhibitors', pro: 'Most Briefs' }

type Item = { name: string; gives: string; price: string }

/** One live figure on the hero card: what is left of an allowance, as a figure and a bar. */
function Meter({ label, left, of, word }: { label: string; left: number; of: number; word: string }) {
  const share = of > 0 ? Math.min(left / of, 1) : 0
  return (
    <div className="pl-meter">
      <div className="pl-meter-top"><span>{label}</span><b className="num">{left}<small> of {of}</small></b></div>
      <div className="pl-bar" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={of} aria-valuenow={left} aria-valuetext={`${left} of ${of} ${word}`}>
        <i style={{ ['--share' as string]: share }} />
      </div>
      <small className="pl-meter-word">{word}</small>
    </div>
  )
}

/** The plan you hold: name, when it refills, and what is left, on the page's one deep indigo surface. */
function Holding({ balance, signedIn }: { balance: Balance | null; signedIn: boolean }) {
  const userId = useSession()?.user.id
  const error = useBalanceError()
  const [trying, setTrying] = useState(false)
  const retry = async () => { if (!userId) return; setTrying(true); await refreshBalance(userId).finally(() => setTrying(false)) }
  if (!signedIn) {
    return (
      <section className="pl-hero" aria-label="Your plan">
        <span className="pl-kicker-line">Free with an account</span>
        <h2>{ALLOWANCE.free.cards} cards a month</h2>
        <p>Sign in to start reading cards, with {TRIAL_BRIEFS} Pulse Briefs to try. QR codes and your digital card work without it.</p>
        <button className="pl-hero-cta" onClick={() => void signInWithGoogle()}>Sign in with Google</button>
      </section>
    )
  }
  if (!balance) {
    return (
      <section className="pl-hero" aria-label="Your plan">
        <span className="pl-kicker-line">Your plan</span>
        <h2>{error ? 'Could not load' : 'Not loaded yet'}</h2>
        <p>{error ? `The server said: ${error}` : 'Your plan and what is left show here when you are online.'}</p>
        <button className="pl-hero-cta" onClick={() => void retry()} disabled={trying || !userId}>{trying ? 'Trying…' : 'Try again'}</button>
      </section>
    )
  }
  const b = balance
  const monthLeft = Math.max(b.cards.month.allowance - b.cards.month.used, 0)
  const briefMonthLeft = Math.max(b.briefs.month.allowance - b.briefs.month.used, 0)
  return (
    <section className="pl-hero" aria-label="Your plan">
      <div className="pl-hero-head">
        <span className="pl-kicker-line">Your plan</span>
        <span className="pl-renew">{b.tier === 'free' ? `New cards on ${day(b.periodEnd)}` : `Renews ${day(b.periodEnd)}`}</span>
      </div>
      <h2>{TIER_NAME[b.tier]}</h2>
      <div className="pl-meters">
        {isUnlimited(b.tier)
          ? <div className="pl-meter pl-meter-off"><div className="pl-meter-top"><span>Cards</span><b>Unlimited</b></div><small className="pl-meter-word">fair use {DAILY.unlimitedReads} a day</small></div>
          : <Meter label="Cards" left={monthLeft} of={b.cards.month.allowance} word="left this month" />}
        {b.tier !== 'free'
          ? <Meter label="Pulse Briefs" left={briefMonthLeft} of={b.briefs.month.allowance} word="left this month" />
          : b.briefs.trial > 0
            ? <Meter label="Pulse Briefs" left={b.briefs.trial} of={TRIAL_BRIEFS} word="trial briefs" />
            : <div className="pl-meter pl-meter-off"><div className="pl-meter-top"><span>Pulse Briefs</span><b>Any plan</b></div><small className="pl-meter-word">With any plan</small></div>}
      </div>
      {(b.cards.pack > 0 || b.cards.pass || b.briefs.extra > 0) && (
        <ul className="pl-extras">
          {b.cards.pass && <li><Icon name="booth" size={14} /><span className="num">{Math.max(b.cards.pass.allowance - b.cards.pass.used, 0)}</span> pass cards, ends {day(b.cards.pass.endsAt)}</li>}
          {b.cards.pack > 0 && <li><Icon name="card" size={14} /><span className="num">{b.cards.pack}</span> pack cards, never expire</li>}
          {b.briefs.extra > 0 && <li><Icon name="spark" size={14} /><span className="num">{b.briefs.extra}</span> extra briefs</li>}
        </ul>
      )}
    </section>
  )
}

/**
 * Plan & cards: the user's own plan held at the top, then the next step sold as promotion cards (Plus and Pro with a
 * Monthly / Yearly switch, card packs, the Exhibition pass). The one promotional page in a flat app. Payments open with
 * the Play Store release; until then choosing anything explains that.
 */
export default function PlanPage({ balance, signedIn, onBack }: { balance: Balance | null; signedIn: boolean; onBack: () => void }) {
  const [item, setItem] = useState<Item | null>(null)
  const [yearly, setYearly] = useState(false)
  const tier: Tier | null = balance?.tier ?? null
  const cheapest = Math.min(...PACKS.map((p) => p.price / p.cards))

  return (
    <div className="pl-page">
      <div className="page-top">
        <header className="page-head">
          <div className="head-left"><button className="icon-btn ghost" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Plan & cards</h1></div>
        </header>
      </div>

      <Holding balance={balance} signedIn={signedIn} />

      <div className="pl-switch-row">
        <h3>Plans</h3>
        <div className="pl-switch" role="radiogroup" aria-label="Billing">
          <button role="radio" aria-checked={!yearly} className={!yearly ? 'on' : ''} onClick={() => setYearly(false)}>Monthly</button>
          <button role="radio" aria-checked={yearly} className={yearly ? 'on' : ''} onClick={() => setYearly(true)}>Yearly<em>Save up to {rupees(BEST_SAVING)}</em></button>
        </div>
      </div>

      <div className="pl-plans">
        {[...PLANS].reverse().map((p) => {
          const current = tier === p.tier
          const price = yearly ? p.yearly : p.monthly
          return (
            <article key={p.tier} className={`pl-plan pl-${p.tier}`} aria-label={`${p.name} plan`}>
              <div className="pl-plan-head">
                <h4>{p.name}</h4>
                {TAG[p.tier] && <span className="pl-tag">{TAG[p.tier]}</span>}
                {current && <span className="pl-tag pl-tag-current">Your plan</span>}
              </div>
              <div className="pl-price" key={`${p.tier}-${yearly}`}>
                <b className="num">{rupees(price)}</b><span>{yearly ? 'a year' : 'a month'}</span>
              </div>
              <p className="pl-price-note">
                {yearly ? <>That is {rupees(Math.round(p.yearly / 12))} a month. <strong>You save {rupees(yearSaving(p))}</strong></> : <>Or {rupees(p.yearly)} a year, saving {rupees(yearSaving(p))}</>}
              </p>
              <ul className="pl-gives">
                {GIVES[p.tier].map((g) => <li key={g}><Icon name="check" size={16} />{g}</li>)}
              </ul>
              <button className="pl-choose" disabled={current}
                onClick={() => setItem({ name: `${p.name}, ${yearly ? 'yearly' : 'monthly'}`, gives: p.gives, price: `${rupees(price)} ${yearly ? 'a year' : 'a month'}` })}>
                {current ? 'Your current plan' : `Choose ${p.name}`}
              </button>
            </article>
          )
        })}
        <p className="pl-free-line">Free stays free: {ALLOWANCE.free.cards} cards every month, with export, your digital card and QR exchange.</p>
      </div>

      <h3 className="pl-section">Card packs<span>Never expire</span></h3>
      <div className="pl-packs">
        {PACKS.map((p) => {
          const per = p.price / p.cards
          return (
            <button key={p.id} className="pl-pack" onClick={() => setItem({ name: `${p.cards} card pack`, gives: `${p.cards} cards that never expire, used after the month's cards`, price: rupees(p.price) })}>
              {per === cheapest && <span className="pl-pack-flag">Best per card</span>}
              <b className="num">{p.cards}</b>
              <span className="pl-pack-unit">cards</span>
              <span className="pl-pack-price num">{rupees(p.price)}</span>
              <small className="num">₹{per.toFixed(2)} a card</small>
            </button>
          )
        })}
      </div>

      {tier && tier !== 'free' && (
        <button className="pl-wide" onClick={() => setItem({ name: `${EXTRA_BRIEFS.briefs} extra briefs`, gives: `${EXTRA_BRIEFS.briefs} Pulse Briefs that never expire, used after the month's ${ALLOWANCE[tier].briefs}`, price: rupees(EXTRA_BRIEFS.price) })}>
          <span className="pl-wide-icon"><Icon name="spark" size={20} /></span>
          <span className="pl-wide-text"><strong>{EXTRA_BRIEFS.briefs} extra Pulse Briefs</strong><small>For a busy month, after your {ALLOWANCE[tier].briefs}. Never expire</small></span>
          <b className="num">{rupees(EXTRA_BRIEFS.price)}</b>
        </button>
      )}

      <h3 className="pl-section">At an exhibition</h3>
      <button className="pl-pass" onClick={() => setItem({ name: 'Exhibition pass', gives: `Up to ${PASS.cards.toLocaleString('en-IN')} cards over ${PASS.days} days, from the day it starts, with lead capture and brochures`, price: rupees(PASS.price) })}>
        <span className="pl-pass-stub" aria-hidden="true"><Icon name="booth" size={22} /><span>{PASS.days}<small>days</small></span></span>
        <span className="pl-pass-body">
          <strong>Exhibition pass</strong>
          <span>Up to <b className="num">{PASS.cards.toLocaleString('en-IN')}</b> cards over {PASS.days} days, with lead capture and brochures. One account, every phone at the stall.</span>
          <span className="pl-pass-price num">{rupees(PASS.price)}<small> once</small></span>
        </span>
      </button>

      <p className="pl-foot">Each contact read uses one card; a card that could not be read uses none. Lead capture and brochures come with any plan or the Exhibition pass. Export, your digital card and QR exchange are always free.</p>

      <Sheet open={!!item} onClose={() => setItem(null)} title={item?.name}>
        <div className="consent">
          <p>{item?.gives}. <b>{item?.price}</b>.</p>
          <p>Payments open with the Play Store release. Until then nothing can be bought here; your free cards still arrive each month.</p>
          <div className="consent-actions single"><button className="outline" onClick={() => setItem(null)}>OK</button></div>
        </div>
      </Sheet>
    </div>
  )
}
