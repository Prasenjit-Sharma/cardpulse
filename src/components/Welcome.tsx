import { useEffect, useRef, useState, type PointerEvent } from 'react'
import { MARK } from '../lib/brandMark'
import { lastAction, swipeStep, TOUR, type TourArt, type TourVariant } from '../lib/onboarding'
import { useBackClose } from '../lib/useBackClose'
import './welcome.css'

/**
 * The welcome tour: four screens, an indigo stage with the picture over the words on the page ground. Swipe or Next
 * moves on, Back steps back (and skips from the first screen), Skip leaves at any point. Shown once (onboarding.ts).
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
  const onDown = (e: PointerEvent) => { down.current = { x: e.clientX, t: e.timeStamp } }
  const onUp = (e: PointerEvent) => {
    if (!down.current) return
    const step = swipeStep(e.clientX - down.current.x, e.timeStamp - down.current.t)
    down.current = null
    if (step) go(step)
  }

  return (
    <div className="welcome" role="dialog" aria-modal="true" aria-label="Welcome to Pulse" onPointerDown={onDown} onPointerUp={onUp} onPointerCancel={() => { down.current = null }}>
      <div className="welcome-stage">
        {!last && <button className="welcome-skip" onClick={() => onDone('close')}>Skip</button>}
        <Art key={i} art={s.art} />
      </div>
      <section key={i} className={`welcome-body ${dir}`} aria-roledescription="slide" aria-label={`${i + 1} of ${TOUR.length}`}>
        <h2 ref={title} tabIndex={-1}>{s.title(variant)}</h2>
        <p>{s.text}</p>
      </section>
      <div className="welcome-foot">
        <div className="welcome-dots" aria-hidden="true">{TOUR.map((_, n) => <i key={n} className={n === i ? 'on' : ''} />)}</div>
        {!last ? (
          <button className="cta" onClick={() => go(1)}>Next</button>
        ) : (
          <>
            <button className="cta" onClick={() => onDone(variant === 'new' ? 'scan' : 'close')}>{lastAction(variant)}</button>
            {variant === 'new' && <button className="link welcome-alt" onClick={() => onDone('close')}>Look around first</button>}
          </>
        )}
      </div>
    </div>
  )
}

/** Each screen's picture, drawn in code so it is sharp at any size and costs nothing to load. */
function Art({ art }: { art: TourArt }) {
  if (art === 'mark') return (
    <svg className="welcome-art wa-mark" viewBox="0 0 32 32" aria-hidden="true">
      <rect width="32" height="32" rx={MARK.rx} fill="rgba(255,255,255,.14)" />
      <path d={MARK.frame} fill="none" stroke="#fff" strokeWidth={MARK.frameW} strokeLinecap="round" />
      <path className="wa-draw" pathLength={1} d={MARK.beat} fill="none" stroke={MARK.teal} strokeWidth={MARK.beatW} strokeLinecap="round" strokeLinejoin="round" />
      {MARK.dots.map(([cx, cy], n) => <circle key={n} className="wa-pop" style={{ animationDelay: `${500 + n * 120}ms` }} cx={cx} cy={cy} r={MARK.dotR} fill="#fff" />)}
    </svg>
  )
  if (art === 'cards') return (
    <svg className="welcome-art" viewBox="0 0 240 180" aria-hidden="true">
      {[[22, 30, -6], [124, 24, 4], [34, 100, 3], [128, 104, -3]].map(([x, y, r], n) => (
        <g key={n} className="wa-drop" style={{ animationDelay: `${n * 90}ms` }} transform={`rotate(${r} ${x + 44} ${y + 26})`}>
          <rect x={x} y={y} width="88" height="52" rx="5" fill="#fff" />
          <rect x={x + 9} y={y + 10} width="44" height="6" rx="2" fill="#C9C6EA" />
          <rect x={x + 9} y={y + 24} width="62" height="4" rx="2" fill="#E2E0F3" />
          <rect x={x + 9} y={y + 33} width="50" height="4" rx="2" fill="#E2E0F3" />
        </g>
      ))}
      <path className="wa-lock" d="M8 34V14a6 6 0 0 1 6-6h20M206 8h20a6 6 0 0 1 6 6v20M232 146v20a6 6 0 0 1-6 6h-20M34 172H14a6 6 0 0 1-6-6v-20" fill="none" stroke={MARK.teal} strokeWidth="4" strokeLinecap="round" />
      <g className="wa-pop" style={{ animationDelay: '800ms' }}><rect x="160" y="156" width="74" height="22" rx="11" fill={MARK.teal} /><text x="197" y="171" textAnchor="middle" fontSize="11" fontWeight="700" fill="#0B0E10">4 people</text></g>
    </svg>
  )
  if (art === 'event') return (
    <svg className="welcome-art" viewBox="0 0 240 180" aria-hidden="true">
      <g className="wa-drop">
        <rect x="14" y="56" width="212" height="68" rx="10" fill="#fff" />
        <rect x="28" y="72" width="34" height="16" rx="8" fill={MARK.teal} /><text x="45" y="84" textAnchor="middle" fontSize="9" fontWeight="700" fill="#0B0E10">LIVE</text>
        <rect x="28" y="96" width="110" height="7" rx="3" fill="#C9C6EA" /><rect x="72" y="76" width="70" height="8" rx="3" fill="#15142A" opacity=".85" />
        <text className="wa-count" x="206" y="98" textAnchor="end" fontSize="26" fontWeight="750" fill="#3B2FC9">128</text>
        <text x="206" y="112" textAnchor="end" fontSize="9" fontWeight="650" fill="#13773F">+24 today</text>
      </g>
      {[0, 1, 2].map((n) => <rect key={n} className="wa-pop" style={{ animationDelay: `${400 + n * 140}ms` }} x={44 + n * 56} y="138" width="44" height="26" rx="4" fill="rgba(255,255,255,.85)" />)}
    </svg>
  )
  return (
    <svg className="welcome-art" viewBox="0 0 240 180" aria-hidden="true">
      <g className="wa-drop">
        <rect x="14" y="30" width="212" height="64" rx="10" fill="#fff" />
        <circle cx="44" cy="62" r="16" fill="#E2E0F3" /><text x="44" y="67" textAnchor="middle" fontSize="13" fontWeight="700" fill="#3B2FC9">RS</text>
        <rect x="70" y="50" width="96" height="9" rx="3" fill="#15142A" opacity=".85" /><rect x="70" y="66" width="120" height="6" rx="3" fill="#C9C6EA" />
      </g>
      {[['Call', '#fff', '#3B2FC9'], ['WhatsApp', 'rgba(255,255,255,.9)', '#15142A'], ['Brief', MARK.teal, '#0B0E10']].map(([label, bg, ink], n) => (
        <g key={label} className="wa-pop" style={{ animationDelay: `${300 + n * 140}ms` }}>
          <rect x={14 + n * 72} y="112" width="64" height="32" rx="16" fill={bg} />
          <text x={46 + n * 72} y="132" textAnchor="middle" fontSize="11" fontWeight="700" fill={ink}>{label}</text>
        </g>
      ))}
    </svg>
  )
}
