/** The brand illustration: a small stack of paper cards, the top one carrying a pulse line. */
export default function CardStack({ width = 132 }: { width?: number }) {
  return (
    <svg className="card-stack" width={width} height={width * 0.73} viewBox="0 0 132 96" aria-hidden="true">
      <g transform="rotate(-10 62 52)"><rect x="14" y="22" width="84" height="54" rx="7" fill="#E9E4D6" /></g>
      <g transform="rotate(5 68 48)"><rect x="26" y="14" width="84" height="54" rx="7" fill="#F2EEE3" /></g>
      <g>
        <rect x="24" y="24" width="84" height="54" rx="7" fill="#FBF9F3" stroke="rgba(20,23,42,.08)" />
        <circle cx="41" cy="41" r="6" fill="#C9CEFF" />
        <rect x="52" y="37" width="34" height="4" rx="2" fill="#1A1C29" opacity=".78" />
        <rect x="52" y="45" width="24" height="3" rx="1.5" fill="#1A1C29" opacity=".3" />
        <path d="M32 62h14l4-9 6 17 5-11h15" fill="none" stroke="#4657F0" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
      </g>
    </svg>
  )
}
