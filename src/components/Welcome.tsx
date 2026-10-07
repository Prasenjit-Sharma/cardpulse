import { useEffect, useRef, useState, type CSSProperties, type PointerEvent } from 'react'
import '@fontsource/caveat/latin-700.css'
import { MARK } from '../lib/brandMark'
import { lastAction, splitHand, swipeStep, TOUR, type TourArt, type TourVariant } from '../lib/onboarding'
import { useBackClose } from '../lib/useBackClose'
import './welcome.css'

/** The band's lower edge, a different wave on each screen so moving on feels like the page breathing. */
const WAVES = [
  'M0 0H400V312C300 262 200 362 0 324Z',
  'M0 0H400V328C250 366 150 270 0 318Z',
  'M0 0H400V318C270 356 140 288 0 330Z',
  'M0 0H400V330C280 296 160 368 0 322Z',
  'M0 0H400V314C260 352 160 292 0 334Z',
]

/**
 * The welcome tour: five screens, each an indigo band with a scene drawn in code over a title whose key words are
 * hand-written. Swipe or Next moves on, Back (the chevron or the phone's) steps back and skips from the first screen,
 * Skip leaves at any point. Shown once (onboarding.ts).
 */
export default function Welcome({ variant, onDone }: { variant: TourVariant; onDone: (action: 'scan' | 'close') => void }) {
  const [i, setI] = useState(0)
  const [dir, setDir] = useState<'fwd' | 'back'>('fwd')
  const title = useRef<HTMLHeadingElement>(null)
  const down = useRef<{ x: number; t: number } | null>(null)
  const last = i === TOUR.length - 1
  const go = (step: number) => {
    const n = Math.max(0, Math.min(TOUR.length - 1, i + step))
    if (n !== i) { setDir(step > 0 ? 'fwd' : 'back'); setI(n) }
  }
  useBackClose(true, () => { if (i > 0) { go(-1); return false } onDone('close') })
  useEffect(() => { title.current?.focus() }, [i])

  const s = TOUR[i]
  const [before, hand, after] = splitHand(s.title(variant))
  const onDown = (e: PointerEvent) => { down.current = { x: e.clientX, t: e.timeStamp } }
  const onUp = (e: PointerEvent) => {
    if (!down.current) return
    const step = swipeStep(e.clientX - down.current.x, e.timeStamp - down.current.t)
    down.current = null
    if (step) go(step)
  }

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Pulse" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { down.current = null }}>
      <div className="wl-hero">
        <svg className="wl-band" viewBox="0 0 400 370" preserveAspectRatio="none" aria-hidden="true">
          <defs>
            <linearGradient id="wl-band" x1="0" y1="0" x2="1" y2="1">
              <stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--brand-base) 70%, white)' }} />
              <stop offset=".55" style={{ stopColor: 'var(--brand-base)' }} />
              <stop offset="1" style={{ stopColor: 'color-mix(in srgb, var(--brand-base) 72%, black)' }} />
            </linearGradient>
          </defs>
          <path className="wl-wave" d={WAVES[i]} fill="url(#wl-band)" />
        </svg>
        <span className="wl-glow teal" aria-hidden="true" />
        <span className="wl-glow violet" aria-hidden="true" />
        {i > 0 && (
          <button className="wl-back" onClick={() => go(-1)} aria-label="Back">
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M15 6l-6 6 6 6" /></svg>
          </button>
        )}
        <div key={i} className={`wl-stage ${dir}`} aria-hidden="true"><Scene art={s.art} /></div>
      </div>

      <section key={`t${i}`} className={`wl-body ${dir}`} aria-roledescription="slide" aria-label={`${i + 1} of ${TOUR.length}`}>
        <h2 ref={title} tabIndex={-1}>{before}{hand && <span className="wl-hand">{hand}</span>}{after}</h2>
        <p>{s.text}</p>
      </section>

      <div className={`wl-foot${last ? ' last' : ''}`}>
        <div className="wl-dots" aria-hidden="true">{TOUR.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        {!last ? (
          <div className="wl-row">
            <button className="wl-skip" onClick={() => onDone('close')}>Skip</button>
            <button className="wl-next" onClick={() => go(1)}>
              Next
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14M13 6l6 6-6 6" /></svg>
            </button>
          </div>
        ) : (
          <>
            <button className="wl-cta" onClick={() => onDone(variant === 'new' ? 'scan' : 'close')}>
              {variant === 'new' && <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 8h3l2-3h6l2 3h3v11H4z" /><circle cx="12" cy="13" r="3.5" /></svg>}
              {lastAction(variant)}
            </button>
            {variant === 'new' && <button className="wl-alt" onClick={() => onDone('close')}>Look around first</button>}
          </>
        )}
      </div>
    </div>
  )
}

/** A made-up person, as a chip lifting off the scene. Nothing here comes from the user's data. */
function Person({ initials, name, line, tone, style }: { initials: string; name: string; line: string; tone: string; style: CSSProperties }) {
  return (
    <div className="wl-person" style={style}>
      <i style={{ background: tone }}>{initials}</i>
      <span>{name}<small>{line}</small></span>
    </div>
  )
}

function MarkSvg({ size }: { size: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32">
      <path d={MARK.frame} fill="none" stroke="#fff" strokeWidth={MARK.frameW} strokeLinecap="round" />
      <path className="wl-draw" pathLength={1} d={MARK.beat} fill="none" stroke={MARK.teal} strokeWidth={MARK.beatW} strokeLinecap="round" strokeLinejoin="round" />
      {MARK.dots.map(([cx, cy], n) => <circle key={n} className="wl-pop" style={{ animationDelay: `${520 + n * 110}ms` }} cx={cx} cy={cy} r={MARK.dotR} fill="#fff" />)}
    </svg>
  )
}

function BizCard({ tone, style }: { tone: string; style: CSSProperties }) {
  return <div className="wl-bc" style={style}><span style={{ background: tone }} /></div>
}

/** Each screen's scene: layered surfaces in perspective, drawn in code so it is sharp at any size and costs nothing to load. */
function Scene({ art }: { art: TourArt }) {
  if (art === 'mark') return (
    <div className="wl-3d"><div className="wl-tile"><MarkSvg size={104} /></div></div>
  )
  if (art === 'cards') return (
    <>
      <div className="wl-frame"><b /><b /><b /><b /></div>
      <div className="wl-deck">
        <BizCard tone="linear-gradient(135deg,#5DD6C8,#2BAE9F)" style={{ transform: 'translateZ(0) translate(-34px,26px) rotate(-7deg)' }} />
        <BizCard tone="linear-gradient(135deg,#FFB86B,#F08A2C)" style={{ transform: 'translateZ(14px) translate(30px,18px) rotate(5deg)' }} />
        <BizCard tone="linear-gradient(135deg,#9B8CFF,#3B2FC9)" style={{ transform: 'translateZ(28px) translate(-22px,-24px) rotate(3deg)' }} />
        <BizCard tone="linear-gradient(135deg,#6FCF97,#13773F)" style={{ transform: 'translateZ(42px) translate(36px,-30px) rotate(-4deg)' }} />
      </div>
      <Person initials="RS" name="Rajesh Shah" line="ABC Polymers" tone="#3B2FC9" style={{ left: '6%', top: '64%', animationDelay: '520ms' }} />
      <Person initials="AK" name="Anita Kapoor" line="Director" tone="#13773F" style={{ right: '5%', top: '72%', animationDelay: '640ms' }} />
      <Person initials="+2" name="more people" line="from one photo" tone="#F08A2C" style={{ right: '9%', top: '22%', animationDelay: '760ms' }} />
    </>
  )
  if (art === 'event') return (
    <div className="wl-3d" style={{ transform: 'rotateX(18deg) rotateY(16deg)' }}>
      <div className="wl-panel">
        <div className="wl-row-c"><span className="wl-live">LIVE</span><b>India Plast 2026</b></div>
        <div className="wl-figs">
          <div><div className="wl-big">128</div><div className="wl-up">+24 today</div></div>
          <div className="wl-bars">{[14, 22, 18, 30, 26, 44].map((h, n) => <i key={n} style={{ height: h, background: n === 5 ? '#3B2FC9' : n > 2 ? '#C9C6EA' : '#E2E0F3', animationDelay: `${300 + n * 60}ms` }} />)}</div>
        </div>
        <div className="wl-keys"><span>2 duplicates</span><span className="dark">Export CSV</span></div>
      </div>
      <BizCard tone="linear-gradient(135deg,#5DD6C8,#2BAE9F)" style={{ position: 'absolute', width: 84, height: 50, left: -34, top: -34, transform: 'translateZ(50px) rotate(-12deg)' }} />
      <BizCard tone="linear-gradient(135deg,#FFB86B,#F08A2C)" style={{ position: 'absolute', width: 84, height: 50, right: -30, top: -46, transform: 'translateZ(70px) rotate(9deg)' }} />
    </div>
  )
  if (art === 'card') return (
    <div className="wl-3d" style={{ transform: 'rotateX(16deg) rotateY(-20deg) rotateZ(-4deg)' }}>
      <div className="wl-dcard">
        <span className="wl-sheen" />
        <b>Aarav Mehta</b><small>Founder · Mehta Exports</small>
        <div className="wl-dmeta">+91 98765 43210<br />pulse.app/aarav</div>
        <div className="wl-qr">{QR.map((on, n) => <i key={n} style={{ background: on ? '#15142A' : 'transparent' }} />)}</div>
      </div>
      <Person initials="NG" name="Neha Gupta left her details" line="at your stall · just now" tone="#13773F" style={{ left: -28, top: 118, transform: 'translateZ(60px)', animationDelay: '560ms' }} />
    </div>
  )
  return (
    <div className="wl-3d" style={{ transform: 'rotateX(18deg) rotateY(-14deg)' }}>
      <div className="wl-panel">
        <div className="wl-row-c"><i className="wl-av">RS</i><span><b>Rajesh Shah</b><small>ABC Polymers · Surat</small></span></div>
        <div className="wl-keys"><span className="brand">Call</span><span>WhatsApp</span></div>
      </div>
      <div className="wl-brief"><b>PULSE BRIEF</b><i /><i style={{ width: '70%' }} /></div>
    </div>
  )
}

/** A made-up QR pattern for the card scene (9 by 9), with its three finder corners. */
const QR = Array.from({ length: 81 }, (_, n) => {
  const x = n % 9, y = Math.floor(n / 9)
  const finder = (x < 3 && y < 3) || (x > 5 && y < 3) || (x < 3 && y > 5)
  return finder ? !(x % 6 === 1 && y % 6 === 1) : (x * 7 + y * 3 + x * y) % 3 !== 0
})
