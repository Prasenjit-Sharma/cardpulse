import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/debug'
import { startAppAuth } from './lib/auth'
import { native } from './lib/native'
import { isApp, setNative } from './lib/platform'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import PublicCard from './components/PublicCard'
import '@fontsource-variable/inter/wght.css'
import './styles.css'

// Inside the app the files are already on the phone: no service worker, and native abilities are handed to platform.ts.
if (isApp) { setNative(native); startAppAuth() }
else registerSW({ immediate: true })
const cardSlug = new URLSearchParams(location.search).get('card')
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary>{cardSlug ? <PublicCard slug={cardSlug} /> : <App />}</ErrorBoundary></StrictMode>,
)
