import { useEffect, useRef } from 'react'

/**
 * Android back button / swipe should close the top screen (sheet, contact, camera), not leave the app.
 *
 * Design: while ANY overlay is open there is exactly one extra history entry (a sentinel). Overlays live in a stack.
 *  - Back pressed: close the newest overlay; if more remain, put the sentinel back.
 *  - Closed from the UI: when the last one closes, remove the sentinel, on the next tick, so "one screen closes as
 *    another opens" never does a back and a push in the same instant (which corrupts history).
 */
interface Entry { close: () => void | boolean }
const stack: Entry[] = []
let sentinel = false
let ignore = 0
let timer = 0
let listening = false

function listen() {
  if (listening) return
  listening = true
  window.addEventListener('popstate', () => {
    if (ignore > 0) { ignore--; return }          // that was us removing the sentinel
    sentinel = false                              // the browser just consumed it
    const top = stack.pop()
    if (!top) return
    if (top.close() === false) stack.push(top)      // the screen refused to close: it stays on top of the stack
    if (stack.length > 0) { history.pushState({ cardpulse: 1 }, ''); sentinel = true }
  })
}

function register(entry: Entry) {
  listen()
  stack.push(entry)
  clearTimeout(timer)
  if (!sentinel) { history.pushState({ cardpulse: 1 }, ''); sentinel = true }
}

function unregister(entry: Entry) {
  const i = stack.indexOf(entry)
  if (i < 0) return                                // already removed by the back button
  stack.splice(i, 1)
  if (stack.length === 0 && sentinel) {
    clearTimeout(timer)
    timer = window.setTimeout(() => {
      if (stack.length === 0 && sentinel) { sentinel = false; ignore++; history.back() }
    }, 0)
  }
}

export function useBackClose(active: boolean, onClose: () => void | boolean) {
  const closeRef = useRef(onClose)
  closeRef.current = onClose
  useEffect(() => {
    if (!active) return
    const entry: Entry = { close: () => closeRef.current() }
    register(entry)
    return () => unregister(entry)
  }, [active])
}
