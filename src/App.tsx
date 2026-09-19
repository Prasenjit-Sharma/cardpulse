import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteCard, getCard, listCards, loadSettings, putCard, readerReady, saveSettings, type Settings } from './lib/db'
import { log } from './lib/debug'
import { extractCard, serverMode } from './lib/gemini'
import { prepareImage } from './lib/image'
import type { CardRecord, EventRec } from './lib/types'
import { loadActiveEvent, loadEvents, saveActiveEvent, saveEvents } from './lib/events'
import { findDuplicates } from './lib/dupes'
import ScanHome from './components/ScanHome'
import Contacts from './components/Contacts'
import Exhibition from './components/Exhibition'
import Insights from './components/Insights'
import ScanResult from './components/ScanResult'
import ContactDetail from './components/ContactDetail'
import Report from './components/Report'
import SettingsPage from './components/SettingsPage'
import Camera from './components/Camera'
import Icon from './components/Icon'
import Toast, { type ToastData } from './components/Toast'
import { useInstall } from './lib/useInstall'

type Tab = 'scan' | 'contacts' | 'exhibition' | 'insights' | 'settings' | 'accuracy'
const TABS: Tab[] = ['scan', 'contacts', 'exhibition', 'insights', 'settings', 'accuracy']
const CONCURRENCY = 2

export default function App() {
  // The browser can reload the page while the camera app is open; keep the user where they were.
  const [tab, setTabState] = useState<Tab>(() => { const t = sessionStorage.getItem('tab') as Tab; return TABS.includes(t) ? t : 'scan' })
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem('tab', t) } catch { /* ignore */ } }
  const [cards, setCards] = useState<CardRecord[]>([])
  const [open, setOpen] = useState<{ id: string; idx: number; review?: boolean } | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [banner, setBanner] = useState('')
  const [events, setEvents] = useState<EventRec[]>(loadEvents)
  const [activeEvent, setActiveEventState] = useState(() => {
    const a = loadActiveEvent()
    return loadEvents().some((e) => e.id === a) ? a : ''
  })
  const activeEventRef = useRef(activeEvent)
  activeEventRef.current = activeEvent
  const setActiveEvent = (id: string) => { setActiveEventState(id); saveActiveEvent(id) }
  const newEvent = (name: string) => {
    const ev: EventRec = { id: crypto.randomUUID(), name, createdAt: Date.now() }
    const next = [ev, ...events]
    setEvents(next); saveEvents(next); setActiveEvent(ev.id)
  }
  const dupes = useMemo(() => findDuplicates(cards), [cards])
  const [backTab, setBackTab] = useState<Tab>('scan')
  const [camOpen, setCamOpen] = useState(false)
  const [toast, setToast] = useState<ToastData | null>(null)
  const toastAt = useRef({ at: 0, count: 0 })
  const install = useInstall()
  useEffect(() => {
    const t = settings.theme ?? 'system'
    if (t === 'system') document.documentElement.removeAttribute('data-theme'); else document.documentElement.dataset.theme = t
  }, [settings.theme])
  const fallbackInput = useRef<HTMLInputElement>(null)
  const queue = useRef<string[]>([])
  const active = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const refresh = useCallback(async () => { const l = await listCards(); log(`refresh: ${l.length} cards`); setCards(l) }, [])
  useEffect(() => { void refresh() }, [refresh])

  /** The "peak" moment: a quiet confirmation that adds up across a batch instead of spamming. */
  const notifyAdded = useCallback((n: number, cardId: string) => {
    if (!n) return
    const t = toastAt.current
    t.count = Date.now() - t.at < 6000 ? t.count + n : n
    t.at = Date.now()
    setToast({ id: t.at, title: `${t.count} contact${t.count === 1 ? '' : 's'} added`, sub: 'Ready to call, message or save', action: { label: 'View', run: () => setOpen({ id: cardId, idx: 0, review: n > 1 }) } })
  }, [])

  const runOne = useCallback(async (id: string) => {
    const card = await getCard(id)
    if (!card) return
    const { apiKey, model, keepPhotos, useOwnKey } = settingsRef.current
    if (!card.image || card.thumbOnly) {
      await putCard({ ...card, status: 'error', error: 'The full photo was not kept, so this card cannot be re-read.' })
      return refresh()
    }
    await putCard({ ...card, status: 'running', error: undefined })
    await refresh()
    try {
      const r = await extractCard(card.back ? [card.image, card.back] : [card.image], { apiKey, model, useOwnKey: !!useOwnKey })
      const fresh = (await getCard(id)) ?? card
      // Photo retention: shrink or drop the images now that the contacts are safely extracted.
      let image: Blob | undefined = fresh.image
      let back: Blob | undefined = fresh.back
      if (keepPhotos === 'thumb') {
        image = await prepareImage(card.image, 320, 0.7).catch(() => fresh.image)
        back = undefined
      } else if (keepPhotos === 'none') {
        image = undefined
        back = undefined
      }
      await putCard({
        ...fresh, image, back, thumbOnly: keepPhotos === 'thumb', status: 'done', error: undefined, model: r.model ?? model,
        latencyMs: r.latencyMs, tokensIn: r.tokensIn, tokensOut: r.tokensOut,
        languages: r.languages, aiNotes: r.notes,
        extracted: r.contacts, corrected: structuredClone(r.contacts), reviewed: false,
      })
      notifyAdded(r.contacts.length, id)
    } catch (e) {
      log(`extract failed: ${e instanceof Error ? e.message : e}`)
      await putCard({ ...card, status: 'error', error: e instanceof Error ? e.message : String(e) })
    }
    await refresh()
  }, [refresh, notifyAdded])

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const id = queue.current.shift()!
      active.current++
      void runOne(id).finally(() => { active.current--; pump() })
    }
  }, [runOne])

  const enqueue = useCallback((ids: string[]) => { queue.current.push(...ids); pump() }, [pump])

  const addFiles = useCallback(async (files: FileList | File[], prepared = false, oneCard = false) => {
    const { apiKey, model } = settingsRef.current
    log(`addFiles n=${Array.from(files).length} prepared=${prepared} oneCard=${oneCard} key=${!!apiKey} model=${model || 'none'}`)
    if (!readerReady(settingsRef.current)) { setBanner('Add your Gemini API key in Settings first.'); setTab('settings'); return }
    setBanner('Saving photo…')
    const ids: string[] = []
    const list = Array.from(files)
    // oneCard: the files are the front (and back) of a single card
    for (const group of oneCard ? [list] : list.map((f) => [f])) {
      const f = group[0]
      try {
        const image = prepared ? f : await prepareImage(f)
        const id = crypto.randomUUID()
        log(`image ready ${image.size}B, saving`)
        const back = group[1] ? (prepared ? group[1] : await prepareImage(group[1])) : undefined
        await putCard({ id, createdAt: Date.now(), image, back, status: 'pending', reviewed: false, eventId: activeEventRef.current || undefined })
        log('saved to IndexedDB')
        ids.push(id)
      } catch (e) {
        log(`FAILED ${e instanceof Error ? e.name + ': ' + e.message : e}`)
        setBanner(`Could not read ${f.name || 'an image'}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
      }
    }
    await refresh()
    if (ids.length) { setBanner(''); enqueue(ids) }
  }, [enqueue, refresh])

  const hasLiveCamera = !!navigator.mediaDevices?.getUserMedia
  const scan = () => { if (hasLiveCamera) setCamOpen(true); else fallbackInput.current?.click() }
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('action') !== 'scan') return
    history.replaceState(null, '', location.pathname)
    scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const openCard = open ? cards.find((c) => c.id === open.id) : undefined
  const eventLabel = events.find((e) => e.id === activeEvent)?.name ?? ''

  const renameEvent = (id: string) => {
    const n = prompt('Rename', events.find((e) => e.id === id)?.name ?? '')?.trim()
    if (!n) return
    const next = events.map((e) => (e.id === id ? { ...e, name: n } : e))
    setEvents(next); saveEvents(next)
  }
  const removeEvent = async (id: string) => {
    if (!confirm('Delete this event? Its contacts are kept, just no longer grouped.')) return
    const next = events.filter((e) => e.id !== id)
    setEvents(next); saveEvents(next)
    if (activeEvent === id) setActiveEvent('')
    await Promise.all(cards.filter((c) => c.eventId === id).map((c) => putCard({ ...c, eventId: undefined })))
    await refresh()
  }
  const moveToEvent = async (ids: string[], eventId: string) => {
    for (const id of ids) {
      const c = await getCard(id)
      if (c) await putCard({ ...c, eventId: eventId || undefined })
    }
    await refresh()
  }
  const deleteContacts = async (keys: string[]) => {
    const byCard = new Map<string, Set<number>>()
    for (const k of keys) {
      const [id, i] = k.split(':') as [string, string]
      byCard.set(id, (byCard.get(id) ?? new Set()).add(Number(i)))
    }
    for (const [id, idxs] of byCard) {
      const c = await getCard(id)
      if (!c) continue
      const rest = (c.corrected ?? []).filter((_, i) => !idxs.has(i))
      if (rest.length) await putCard({ ...c, corrected: rest, reviewed: false }); else await deleteCard(id)
    }
    await refresh()
  }
  const keepPeople = async (cardId: string, keep: number[], extras: { eventId: string; note: string }) => {
    const c = await getCard(cardId)
    if (!c) return
    const rest = (c.corrected ?? []).filter((_, i) => keep.includes(i)).map((p) => (extras.note ? { ...p, note: [p.note, extras.note].filter(Boolean).join(' ') } : p))
    if (rest.length) await putCard({ ...c, corrected: rest, reviewed: false, eventId: extras.eventId || undefined }); else await deleteCard(cardId)
    await refresh()
  }
  const newEventPrompt = () => { const n = prompt('Exhibition / event name'); if (n?.trim()) newEvent(n.trim()) }
  const goto = (t: Tab, from?: Tab) => { if (from) setBackTab(from); setOpen(null); setTab(t) }
  const scanHere = (id: string) => {
    setActiveEvent(id)
    try { localStorage.setItem('cardpulse.captureMode', 'many') } catch { /* ignore */ }
    scan()
  }
  const retryFailed = () => enqueue(cards.filter((c) => c.status === 'error').map((c) => c.id))
  const navActive: Tab = tab === 'accuracy' || tab === 'insights' ? 'settings' : tab

  return (
    <div className="app">
      <main>
        {banner && <div className="banner">{banner}</div>}
        {openCard && open?.review ? (
          <ScanResult key={`r-${openCard.id}`} card={openCard} events={events} onBack={() => setOpen(null)}
            onKeep={(keep, extras) => { void keepPeople(openCard.id, keep, extras); setOpen(null); goto('contacts') }}
            onEdit={(idx) => setOpen({ id: openCard.id, idx })} />
        ) : openCard && open ? (
          <ContactDetail
            key={openCard.id}
            card={openCard}
            index={open.idx}
            events={events}
            dupes={dupes.get(openCard.id) ?? []}
            onClose={() => setOpen(null)}
            onSave={async (c) => { await putCard(c); await refresh() }}
            onRetry={() => enqueue([openCard.id])}
            onDelete={async () => { await deleteCard(openCard.id); setOpen(null); await refresh() }}
            onMoveEvent={(eventId) => void moveToEvent([openCard.id], eventId)}
          />
        ) : tab === 'scan' ? (
          <ScanHome cards={cards} events={events} activeEvent={activeEvent} onSelectEvent={setActiveEvent} ready={readerReady(settings)} needsKey={!serverMode || !!settings.useOwnKey}
            install={install} onScan={scan} onOpen={(id, review) => setOpen({ id, idx: 0, review })} onContacts={() => goto('contacts')} onSetup={() => goto('settings', 'scan')} onRetry={(id) => enqueue([id])} />
        ) : tab === 'contacts' ? (
          <Contacts onScan={scan} cards={cards} events={events} activeEvent={activeEvent} onSelectEvent={setActiveEvent} dupes={dupes}
            onOpen={(id, idx) => setOpen({ id, idx })} onRetryFailed={retryFailed} onUpload={(f) => void addFiles(f)} onMoveToEvent={moveToEvent} onDeleteContacts={deleteContacts} />
        ) : tab === 'exhibition' ? (
          <Exhibition cards={cards} events={events} activeEvent={activeEvent} onNew={newEventPrompt} onRename={renameEvent} onDelete={removeEvent}
            onScanHere={scanHere} onView={(id) => { setActiveEvent(id); goto('contacts') }} />
        ) : tab === 'insights' ? (
          <Insights cards={cards} onBack={() => setTab(backTab)} onContacts={() => goto('contacts')} onAccuracy={() => goto('accuracy', 'insights')} onOpen={(id, idx) => setOpen({ id, idx })} />
        ) : tab === 'accuracy' ? (
          <Report cards={cards} events={events} dupes={dupes} onBack={() => setTab(backTab)} />
        ) : (
          <SettingsPage
            settings={settings}
            install={install}
            onChange={(s) => { setSettings(s); saveSettings(s) }}
            onWipe={async () => { await Promise.all(cards.map((c) => deleteCard(c.id))); await refresh() }}
            onOpenAccuracy={() => goto('accuracy', 'settings')}
            onOpenInsights={() => goto('insights', 'settings')}
            onBack={() => setTab(backTab)}
          />
        )}
      </main>
      {camOpen && <Camera eventLabel={eventLabel} onCard={(fs) => { void addFiles(fs, true, true) }} onGallery={(fs) => { void addFiles(fs) }} onClose={() => setCamOpen(false)} />}
      <input ref={fallbackInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
      <Toast toast={toast} onDone={() => setToast(null)} />
      {!openCard && (
        <nav>
          <NavBtn id="scan" label="Scan" icon="camera" active={navActive} go={goto} />
          <NavBtn id="contacts" label="Contacts" icon="users" active={navActive} go={goto} />
          <NavBtn id="exhibition" label="Events" icon="booth" active={navActive} go={goto} />
          <NavBtn id="settings" label="Settings" icon="sliders" active={navActive} go={goto} />
        </nav>
      )}
    </div>
  )
}

function NavBtn({ id, label, icon, active, go }: { id: Tab; label: string; icon: 'camera' | 'users' | 'booth' | 'sliders'; active: Tab; go: (t: Tab) => void }) {
  return (
    <button className={active === id ? 'on' : ''} onClick={() => go(id)}>
      <Icon name={icon} size={22} />
      <span>{label}</span>
    </button>
  )
}
