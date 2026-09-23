import type { ReactNode } from 'react'
import Icon from './Icon'

/** The app's checkbox: the same square check the contact list uses for selection, never the browser's own box. */
export default function Check({ checked, onChange, children, disabled }: { checked: boolean; onChange: (v: boolean) => void; children: ReactNode; disabled?: boolean }) {
  return (
    <button type="button" role="checkbox" aria-checked={checked} className="check-row" disabled={disabled} onClick={() => onChange(!checked)}>
      <span className={`check-dot${checked ? ' on' : ''}`} aria-hidden="true">{checked && <Icon name="check" size={14} />}</span>
      <span className="grow">{children}</span>
    </button>
  )
}
