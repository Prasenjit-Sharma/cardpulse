import Icon from './Icon'

export type PhotoMode = 'single' | 'sided' | 'many'
export type ScanMode = PhotoMode | 'qr'

export const PHOTO_MODES: PhotoMode[] = ['single', 'sided', 'many']
const RAIL: { id: ScanMode; label: string; icon: 'card' | 'sided' | 'group' | 'qr' }[] = [
  { id: 'single', label: 'Card', icon: 'card' },
  { id: 'sided', label: '2-sided', icon: 'sided' },
  { id: 'many', label: 'Group', icon: 'group' },
  { id: 'qr', label: 'QR', icon: 'qr' },
]

/**
 * The scan-mode switch, held just above the shutter where the thumb already is. Only the chosen mode shows its name;
 * the rest are icons, so four modes fit a narrow phone without crowding anything.
 */
export default function ModeRail({ mode, onPick, qr = true }: { mode: ScanMode; onPick: (m: ScanMode) => void; qr?: boolean }) {
  return (
    <div className="mode-rail" role="radiogroup" aria-label="Scan mode">
      {RAIL.filter((m) => qr || m.id !== 'qr').map((m) => (
        <button key={m.id} role="radio" aria-checked={mode === m.id} aria-label={m.label} className={mode === m.id ? 'on' : ''}
          onClick={() => { if (mode !== m.id) onPick(m.id) }}>
          <Icon name={m.icon} size={18} />
          <span aria-hidden="true">{m.label}</span>
        </button>
      ))}
    </div>
  )
}
