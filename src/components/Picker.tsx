import { useState, type ReactNode } from 'react'
import Icon from './Icon'
import Sheet, { SheetItem } from './Sheet'

export interface PickOption<T extends string> { value: T; label: string; hint?: string }

/**
 * Replaces the native <select>: the phone's own option dialog uses a different font, size and shape from the rest of
 * the app. This opens the app's own compact sheet instead, so every choice looks and behaves the same.
 * The trigger shows the current choice; `children` can replace it (e.g. an icon-only trigger).
 */
export default function Picker<T extends string>({ value, options, onChange, title, className = 'pick', label, icon, children, disabled }: {
  value: T
  options: PickOption<T>[]
  onChange: (v: T) => void
  title: string
  className?: string
  /** Text shown in the trigger instead of the chosen option's label (e.g. "Events" when nothing is chosen). */
  label?: string
  icon?: Parameters<typeof Icon>[0]['name']
  children?: ReactNode
  disabled?: boolean
}) {
  const [open, setOpen] = useState(false)
  const chosen = options.find((o) => o.value === value)
  return (
    <>
      <button type="button" className={className} onClick={() => setOpen(true)} disabled={disabled} aria-haspopup="dialog" aria-label={`${title}: ${chosen?.label ?? ''}`}>
        {children ?? (<>{icon && <Icon name={icon} size={15} />}<span className="pick-label">{label ?? chosen?.label ?? title}</span><Icon name="chevron" size={14} /></>)}
      </button>
      <Sheet open={open} onClose={() => setOpen(false)} title={title}>
        {options.map((o) => (
          <SheetItem key={o.value} label={o.label} hint={o.hint} checked={o.value === value} onClick={() => { setOpen(false); onChange(o.value) }} />
        ))}
      </Sheet>
    </>
  )
}
