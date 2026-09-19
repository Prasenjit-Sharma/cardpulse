import { useEffect, useState, type ReactNode } from 'react'
import { useBackClose } from '../lib/useBackClose'
import Icon from './Icon'

/** Material 3 modal bottom sheet: slides up over a dimmed screen, drag handle, big tap rows. Back button closes it. */
export default function Sheet({ open, onClose, title, children }: { open: boolean; onClose: () => void; title?: string; children: ReactNode }) {
  const [mounted, setMounted] = useState(open)
  const [closing, setClosing] = useState(false)
  useBackClose(open, onClose)

  useEffect(() => {
    if (open) { setMounted(true); setClosing(false); return }
    if (!mounted) return
    setClosing(true)
    const t = setTimeout(() => { setMounted(false); setClosing(false) }, 200)
    return () => clearTimeout(t)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open, onClose])

  if (!mounted) return null
  return (
    <div className={`sheet-wrap${closing ? ' out' : ''}`} role="dialog" aria-modal="true" aria-label={title}>
      <div className="scrim" onClick={onClose} />
      <div className="sheet">
        <span className="handle" />
        {title && <h3>{title}</h3>}
        <div className="sheet-list">{children}</div>
      </div>
    </div>
  )
}

export function SheetItem({ icon, label, onClick, danger, disabled }: { icon: Parameters<typeof Icon>[0]['name']; label: string; onClick: () => void; danger?: boolean; disabled?: boolean }) {
  return (
    <button className={`sheet-item${danger ? ' danger' : ''}`} onClick={onClick} disabled={disabled}>
      <Icon name={icon} size={22} /><span>{label}</span>
    </button>
  )
}
