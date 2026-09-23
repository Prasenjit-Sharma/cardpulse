import { useEffect, useRef, useState } from 'react'
import Sheet from './Sheet'

// The app's own confirm and prompt, in place of the browser's: those dialogs use the phone's font, shape and button
// order, look like a system warning, and cannot be themed. These are a small sheet, like every other choice in the app.

interface ConfirmOpts { title: string; message?: string; confirmLabel?: string; cancelLabel?: string; danger?: boolean }
interface PromptOpts { title: string; value?: string; placeholder?: string; confirmLabel?: string; maxLength?: number }
type Request =
  | ({ kind: 'confirm'; resolve: (ok: boolean) => void } & ConfirmOpts)
  | ({ kind: 'prompt'; resolve: (v: string | null) => void } & PromptOpts)

let show: ((r: Request) => void) | null = null

/** Resolves true when the person confirms; false when they cancel, tap outside or press back. */
export function confirmAsk(opts: ConfirmOpts): Promise<boolean> {
  return new Promise((resolve) => (show ? show({ kind: 'confirm', resolve, ...opts }) : resolve(window.confirm(opts.message ?? opts.title))))
}
/** Resolves to the trimmed text, or null when cancelled or left empty. */
export function promptAsk(opts: PromptOpts): Promise<string | null> {
  return new Promise((resolve) => (show ? show({ kind: 'prompt', resolve, ...opts }) : resolve(window.prompt(opts.title, opts.value ?? '')?.trim() || null)))
}

/** Mounted once, at the top of the app. */
export function DialogHost() {
  const [req, setReq] = useState<Request | null>(null)
  const [text, setText] = useState('')
  const input = useRef<HTMLInputElement>(null)
  useEffect(() => {
    show = (r) => { setText(r.kind === 'prompt' ? r.value ?? '' : ''); setReq(r) }
    return () => { show = null }
  }, [])
  useEffect(() => { if (req?.kind === 'prompt') setTimeout(() => input.current?.focus(), 60) }, [req])

  const close = (answer: boolean) => {
    if (!req) return
    if (req.kind === 'confirm') req.resolve(answer)
    else req.resolve(answer ? text.trim() || null : null)
    setReq(null)
  }
  const danger = req?.kind === 'confirm' && req.danger
  const canOk = req?.kind !== 'prompt' || !!text.trim()

  return (
    <Sheet open={!!req} onClose={() => close(false)} title={req?.title}>
      {req && (
        <form className="dialog" onSubmit={(e) => { e.preventDefault(); if (canOk) close(true) }}>
          {req.kind === 'confirm' && req.message && <p>{req.message}</p>}
          {req.kind === 'prompt' && (
            <input ref={input} value={text} onChange={(e) => setText(e.target.value)} placeholder={req.placeholder} aria-label={req.title} maxLength={req.maxLength ?? 80} enterKeyHint="done" />
          )}
          <div className="dialog-actions">
            <button type="button" className="outline" onClick={() => close(false)}>{(req.kind === 'confirm' && req.cancelLabel) || 'Cancel'}</button>
            <button type="submit" className={danger ? 'danger-solid' : 'cta'} disabled={!canOk}>{req.confirmLabel ?? (req.kind === 'prompt' ? 'Save' : 'OK')}</button>
          </div>
        </form>
      )}
    </Sheet>
  )
}
