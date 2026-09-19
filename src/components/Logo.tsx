/** Brand mark: a business card carrying a pulse line. Matches the app icon. */
export default function Logo({ size = 28 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 32 32" aria-hidden="true">
      <defs>
        <linearGradient id="lg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#1A8296" /><stop offset="1" stopColor="#0B6273" /></linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="url(#lg)" />
      <rect x="5.5" y="8" width="21" height="16" rx="2.4" fill="#fff" />
      <path d="M8.5 16.2h4l1.8-4.4 3 8.6 2-4.2h3.7" fill="none" stroke="#0B6273" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  )
}
