import Icon from './Icon'

const dayLabel = (iso: string) => new Date(`${iso}T00:00`).toLocaleDateString(undefined, { weekday: 'short', day: 'numeric', month: 'short' })

/**
 * A date drawn as the app's own chip. The phone's real date field sits invisibly on top, so a tap still opens the
 * phone's own calendar, but the field itself (its font, icon and clipping) never shows.
 */
export default function DateChip({ value, onChange, min, label, autoFocus }: { value: string; onChange: (v: string) => void; min?: string; label: string; autoFocus?: boolean }) {
  return (
    <label className="datechip">
      <Icon name="calendar" size={14} /><span>{value ? dayLabel(value) : 'Pick a date'}</span>
      <input type="date" value={value} min={min} autoFocus={autoFocus} onChange={(e) => onChange(e.target.value)} aria-label={label} />
    </label>
  )
}
