import { useEffect } from 'react'
import Icon from './Icon'

export interface ToastData { id: number; title: string; sub?: string; action?: { label: string; run: () => void } }

/** Non-blocking confirmation that sits in the thumb zone above the tab bar. */
export default function Toast({ toast, onDone }: { toast: ToastData | null; onDone: () => void }) {
  useEffect(() => {
    if (!toast) return
    const t = setTimeout(onDone, 4500)
    return () => clearTimeout(t)
  }, [toast, onDone])
  if (!toast) return null
  return (
    <div className="toast" role="status" key={toast.id}>
      <span className="toast-check"><Icon name="check" size={18} /></span>
      <div className="grow"><strong>{toast.title}</strong>{toast.sub && <span>{toast.sub}</span>}</div>
      {toast.action && <button className="link" onClick={() => { toast.action!.run(); onDone() }}>{toast.action.label}</button>}
    </div>
  )
}
