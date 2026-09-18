import { Component, type ReactNode } from 'react'

/** Last line of defence: a friendly recovery screen instead of a blank page. */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() {
    if (!this.state.failed) return this.props.children
    return (
      <div className="fatal">
        <h1>Something went wrong</h1>
        <p>Your contacts are safe on this device. Reloading usually fixes it.</p>
        <button className="primary" onClick={() => location.reload()}>Reload CardPulse</button>
      </div>
    )
  }
}
