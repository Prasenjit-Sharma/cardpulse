// The multi-person review screen, mounted alone for the store screenshots: in the app it only opens straight after a
// real scan, which a headless browser cannot do. Same styles and fonts as the app (src/main.tsx).
import { createRoot } from 'react-dom/client'
import ScanResult from '/src/components/ScanResult.tsx'
import '@fontsource-variable/inter/wght.css'
import '/src/styles.css'
import { GROUP_PEOPLE } from './seed'

const card = {
  id: 'sample-group', createdAt: Date.now(), status: 'done' as const, reviewed: false, eventId: 'ev-plast',
  extracted: structuredClone(GROUP_PEOPLE), corrected: structuredClone(GROUP_PEOPLE),
}
const events = [{ id: 'ev-plast', name: 'India Plast 2026', createdAt: Date.now() }]
const noop = () => {}
createRoot(document.getElementById('root')!).render(
  <div className="app"><main><div className="view"><ScanResult card={card} events={events} onBack={noop} onKeep={noop} onEdit={noop} /></div></main></div>,
)
