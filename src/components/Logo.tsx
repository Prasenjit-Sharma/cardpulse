import { useId } from 'react'
import { MARK } from '../lib/brandMark'

/**
 * Brand mark: a scan frame around a beat whose peaks are people, the same geometry as the app icon (lib/brandMark).
 * The tile follows the accent colour. `light` is for indigo ground (the Home masthead): a translucent white tile instead
 * of the indigo one, so the mark does not vanish into its own colour.
 */
export default function Logo({ size = 28, tone = 'brand' }: { size?: number; tone?: 'brand' | 'light' }) {
  // One gradient id per logo: two logos on a screen sharing one id can lose a tile when the first unmounts
  const id = `pulse-${useId().replace(/[^a-zA-Z0-9_-]/g, '')}`
  const light = tone === 'light'
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" style={{ stopColor: 'color-mix(in srgb, var(--brand-base) 82%, white)' }} /><stop offset="1" style={{ stopColor: 'var(--brand-base)' }} /></linearGradient>
      </defs>
      <rect width="32" height="32" rx={MARK.rx} fill={light ? 'rgba(255,255,255,.16)' : `url(#${id})`} />
      <path d={MARK.frame} fill="none" stroke="#fff" strokeWidth={MARK.frameW} strokeLinecap="round" />
      <path d={MARK.beat} fill="none" stroke={MARK.teal} strokeWidth={MARK.beatW} strokeLinecap="round" strokeLinejoin="round" />
      {MARK.dots.map(([cx, cy]) => <circle key={`${cx},${cy}`} cx={cx} cy={cy} r={MARK.dotR} fill="#fff" />)}
    </svg>
  )
}
