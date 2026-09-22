import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/debug'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import PublicCard from './components/PublicCard'
import './styles.css'

registerSW({ immediate: true })
const cardSlug = new URLSearchParams(location.search).get('card')
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary>{cardSlug ? <PublicCard slug={cardSlug} /> : <App />}</ErrorBoundary></StrictMode>,
)
