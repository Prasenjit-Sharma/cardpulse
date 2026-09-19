import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteCard, getCard, listCards, loadSettings, putCard, readerReady, saveSettings, type Settings } from './lib/db'
import { log } from './lib/debug'
import { extractCard, serverMode } from './lib/gemini'
import { fitForBatch, prepareImage } from './lib/image'
import { prepareCardImage } from './lib/cardImage'
import type { CardRecord, Contact, EventRec } from './lib/types'
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
import { useBackClose } from './lib/useBackClose'

type Tab = 'scan' | 'contacts' | 'exhibition' | 'insights' | 'settings' | 'accuracy'
const TABS: Tab[] = ['scan', 'contacts', 'exhibition', 'insights', 'settings', 'accuracy']
const CONCURRENCY = 2
// Photos read per Gemini call. 1 = every card is read on its own (the setting in use).
// Batching is built, tested and deployed: set this to 2-6 and single photos are read together, with Gemini numbering
// which photo each person came from. Measured on six real cards: 26% fewer input tokens, about 18% cheaper, half the
// time, 27 of 27 people correctly attributed. Left at 1 by decision because the saving was judged too small.
const BATCH_MAX = 1

export default function App() {
  // The browser can reload the page while the camera app is open; keep the user where they were.
  const [tab, setTabState] = useState<Tab>(() => { const t = sessionStorage.getItem('tab') as Tab; return TABS.includes(t) ? t : 'scan' })
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem('tab', t) } catch { /* ignore */ } }
  const [cards, setCards] = useState<CardRecord[]>([])
  const [open, setOpen] = useState<{ id: string; idx: number; review?: boolean; whenDone?: boolean } | null>(null)
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
  /** Each job is the card ids read together in ONE Gemini call. */
  const queue = useRef<string[][]>([])
  const active = useRef(0)
  const settingsRef = useRef(settings)
  settingsRef.current = settings

  const refresh = useCallback(async () => { const l = await listCards(); log(`refresh: ${l.length} cards`); setCards(l) }, [])
  useEffect(() => { void refresh() }, [refresh])

  /** The "peak" moment: a quiet confirmation that adds up across a batch instead of spamming. */
  const notifyAdded = useCallback((n: number, cardId: string, many = false) => {
    if (!n) return
    const t = toastAt.current
    t.count = Date.now() - t.at < 6000 ? t.count + n : n
    t.at = Date.now()
    setToast({
      id: t.at, title: `${t.count} contact${t.count === 1 ? '' : 's'} added`, sub: 'Ready to call, message or save',
      action: { label: 'View', run: () => (many ? (setOpen(null), setTab('contacts')) : setOpen({ id: cardId, idx: 0, review: n > 1 })) },
    })
  }, [])

  const stripImage = (c: Contact & { image?: number }): Contact => { const { image: _image, ...rest } = c; return rest }

  /**
   * Read one job: the cards in it share a SINGLE Gemini call. One card (or a front+back pair) is read as itself; several
   * single photos go as a batch and Gemini says which photo each person came from.
   */
  const runJob = useCallback(async (ids: string[]): Promise<void> => {
    const { apiKey, model, keepPhotos, useOwnKey } = settingsRef.current
    const found = (await Promise.all(ids.map((id) => getCard(id)))).filter((c): c is CardRecord => !!c)
    const cards: CardRecord[] = []
    for (const c of found) {
      if (!c.image || c.thumbOnly) await putCard({ ...c, status: 'error', error: 'The full photo was not kept, so this card cannot be re-read.' })
      else cards.push(c)
    }
    if (!cards.length) return refresh()
    await Promise.all(cards.map((c) => putCard({ ...c, status: 'running', error: undefined })))
    await refresh()

    /** Store a card's contacts, applying the photo-retention setting. */
    const finish = async (card: CardRecord, contacts: Contact[], stats: { model: string; latencyMs: number; tokensIn?: number; tokensOut?: number; languages: string[]; notes: string; batchSize: number }) => {
      const fresh = (await getCard(card.id)) ?? card
      let image: Blob | undefined = fresh.image
      let back: Blob | undefined = fresh.back
      if (keepPhotos === 'thumb') { image = await prepareImage(card.image!, 320, 0.7).catch(() => fresh.image); back = undefined }
      else if (keepPhotos === 'none') { image = undefined; back = undefined }
      await putCard({
        ...fresh, image, back, thumbOnly: keepPhotos === 'thumb', status: 'done', error: undefined, model: stats.model,
        latencyMs: stats.latencyMs, tokensIn: stats.tokensIn, tokensOut: stats.tokensOut, batchSize: stats.batchSize,
        languages: stats.languages, aiNotes: stats.notes,
        extracted: contacts, corrected: structuredClone(contacts), reviewed: false,
      })
    }

    try {
      const opts = { apiKey, model, useOwnKey: !!useOwnKey }
      if (cards.length === 1) {
        const c = cards[0]!
        const r = await extractCard(c.back ? [c.image!, c.back] : [c.image!], opts)
        const contacts = r.contacts.map(stripImage)
        await finish(c, contacts, { model: r.model ?? model, latencyMs: r.latencyMs, tokensIn: r.tokensIn, tokensOut: r.tokensOut, languages: r.languages, notes: r.notes, batchSize: 1 })
        notifyAdded(contacts.length, c.id)
      } else {
        const n = cards.length
        const blobs = await Promise.all(cards.map((c) => fitForBatch(c.image!, n)))
        log(`batch of ${n}: ${blobs.map((b) => Math.round(b.size / 1024) + 'KB').join(' ')} in one call`)
        const r = await extractCard(blobs, opts, 'batch')
        // Which card does each person belong to? Gemini numbers the photos. If any person has no valid number we
        // cannot attribute them safely, so read those cards one by one instead of guessing.
        const valid = r.contacts.every((c) => Number.isInteger(c.image) && c.image! >= 1 && c.image! <= n)
        if (!valid) {
          log('batch: a contact had no valid photo number, reading the cards individually')
          for (const c of cards) await runJob([c.id])
          return
        }
        const per = (i: number) => r.contacts.filter((c) => c.image === i + 1).map(stripImage)
        let total = 0, first = ''
        for (let i = 0; i < n; i++) {
          const contacts = per(i)
          total += contacts.length
          if (contacts.length && !first) first = cards[i]!.id
          await finish(cards[i]!, contacts, {
            model: r.model ?? model, latencyMs: Math.round(r.latencyMs / n),
            tokensIn: r.tokensIn == null ? undefined : Math.round(r.tokensIn / n), tokensOut: r.tokensOut == null ? undefined : Math.round(r.tokensOut / n),
            languages: r.languages, notes: r.notes, batchSize: n,
          })
        }
        notifyAdded(total, first, true)
      }
    } catch (e) {
      log(`extract failed: ${e instanceof Error ? e.message : e}`)
      const message = e instanceof Error ? e.message : String(e)
      for (const c of cards) await putCard({ ...((await getCard(c.id)) ?? c), status: 'error', error: message })
    }
    await refresh()
  }, [refresh, notifyAdded])

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const job = queue.current.shift()!
      active.current++
      void runJob(job).finally(() => { active.current--; pump() })
    }
  }, [runJob])

  /** Group cards into jobs: single photos are read together (up to 6 per call); a front+back card is read on its own. */
  const enqueue = useCallback(async (ids: string[]) => {
    const recs = await Promise.all(ids.map((id) => getCard(id)))
    const singles: string[] = [], jobs: string[][] = []
    recs.forEach((c, i) => { if (!c) return; if (c.back) jobs.push([ids[i]!]); else singles.push(ids[i]!) })
    for (let i = 0; i < singles.length; i += BATCH_MAX) jobs.push(singles.slice(i, i + BATCH_MAX))
    queue.current.push(...jobs)
    pump()
  }, [pump])

  const addGroups = useCallback(async (groups: File[][], prepared: boolean) => {
    const { apiKey, model } = settingsRef.current
    log(`addGroups n=${groups.length} prepared=${prepared} key=${!!apiKey} model=${model || 'none'}`)
    if (!readerReady(settingsRef.current)) { setBanner('Add your Gemini API key in Settings first.'); setTab('settings'); return }
    setBanner('Saving photos…')
    const ids: string[] = []
    for (const group of groups) {
      const f = group[0]!
      try {
        const image = prepared ? f : await prepareCardImage(f)
        const id = crypto.randomUUID()
        log(`image ready ${image.size}B, saving`)
        const back = group[1] ? (prepared ? group[1] : await prepareCardImage(group[1])) : undefined
        await putCard({ id, createdAt: Date.now(), image, back, status: 'pending', reviewed: false, eventId: activeEventRef.current || undefined })
        ids.push(id)
      } catch (e) {
        log(`FAILED ${e instanceof Error ? e.name + ': ' + e.message : e}`)
        setBanner(`Could not read ${f.name || 'an image'}: ${e instanceof Error ? `${e.name}: ${e.message}` : String(e)}`)
      }
    }
    await refresh()
    if (ids.length) { setBanner(''); void enqueue(ids) }
  }, [enqueue, refresh])

  /** Photos from the gallery: each is a card. Read together, six to a call. */
  const addFiles = useCallback((files: FileList | File[], prepared = false, oneCard = false) => {
    const list = Array.from(files)
    return addGroups(oneCard ? [list] : list.map((f) => [f]), prepared)
  }, [addGroups])

  /** The photos gathered in the camera tray. Reading starts here, once, for the whole tray. */
  const addBatch = useCallback((cards: File[][]) => addGroups(cards, true), [addGroups])

  const hasLiveCamera = !!navigator.mediaDevices?.getUserMedia
  const scan = () => { if (hasLiveCamera) setCamOpen(true); else fallbackInput.current?.click() }
  useEffect(() => {
    const params = new URLSearchParams(location.search)
    if (params.get('action') !== 'scan') return
    history.replaceState(null, '', location.pathname)
    scan()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  useEffect(() => { if (open) setToast(null) }, [open])   // an old "contact added" toast has no business over a contact screen
  // A card opened before it finished reading: when it lands, show the review screen if it turned out to be several people.
  useEffect(() => {
    if (!open?.whenDone) return
    const c = cards.find((x) => x.id === open.id)
    if (c?.status === 'done') setOpen({ id: c.id, idx: 0, review: (c.corrected?.length ?? 0) > 1 })
  }, [cards, open])
  // Android back: close the camera, then the open contact/review, then go back to the Scan tab, before ever leaving the app.
  useBackClose(!!open, () => setOpen(null))
  useBackClose(tab !== 'scan' && !open && !camOpen, () => setTab(tab === 'accuracy' || tab === 'insights' ? backTab : 'scan'))
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
        <div className="view" key={openCard ? `o-${open?.id}-${open?.review ? 'r' : 'd'}` : tab}>
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
        </div>
      </main>
      {camOpen && <Camera eventLabel={eventLabel} onSubmit={(cards) => { void addBatch(cards); goto('contacts') }} onGallery={(fs) => { void addFiles(fs) }} onClose={() => setCamOpen(false)} />}
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
    <button className={active === id ? 'on' : ''} onClick={() => go(id)} aria-current={active === id ? 'page' : undefined}>
      <span className="ind"><Icon name={icon} size={22} /></span>
      <span>{label}</span>
    </button>
  )
}
