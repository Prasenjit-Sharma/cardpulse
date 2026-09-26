import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { deleteCard, getCard, listCards, loadSettings, putCard, readerReady, saveSettings, type Settings } from './lib/db'
import { log } from './lib/debug'
import { extractCard, serverMode } from './lib/gemini'
import { fitForBatch, prepareImage } from './lib/image'
import { prepareCardImage } from './lib/cardImage'
import type { CardRecord, Contact, EventRec } from './lib/types'
import { loadActiveEvent, loadEvents, saveActiveEvent, saveEvents } from './lib/events'
import { wipeContactData } from './lib/wipe'
import { useSession } from './lib/auth'
import { fetchCardStats, flushUnpublish, queueUnpublish, type CardStats } from './lib/cloudaccount'
import { leadCardId } from './lib/synccore'
import { useSync } from './lib/useSync'
import { findDuplicates } from './lib/dupes'
import { backupDue, backupFileName, backupNudgeUntil, buildBackup, lastBackupAt, markBackedUp, mergeEvents, parseBackup, planRestore, saveBackupFile, snoozeBackupNudge } from './lib/backup'
import { classifyFailure } from './lib/errors'
import { applyPulledLeads, markLeadsPulled, pullNewLeads } from './lib/leads'
import { useOnline } from './lib/useOnline'
import MyCards from './components/MyCards'
import CardEditor from './components/CardEditor'
import CardShare from './components/CardShare'
import StallMode from './components/StallMode'
import QrScanner from './components/QrScanner'
import QrResult from './components/QrResult'
import { eventState, openingEvent, showEvent } from './lib/eventname'
import { localISO } from './lib/followups'
import { getNative, onNotice, statusBarIcons } from './lib/platform'
import { deleteMyCard, emptyCard, listMyCards, MAX_CARDS, planCardRestore, putMyCard, type MyCard } from './lib/mycards'
import Companies from './components/Companies'
import Home from './components/Home'
import Contacts, { type Flt } from './components/Contacts'
import Exhibition from './components/Exhibition'
import Insights from './components/Insights'
import ScanResult from './components/ScanResult'
import ContactDetail from './components/ContactDetail'
import Report from './components/Report'
import SettingsPage from './components/SettingsPage'
import Camera from './components/Camera'
import Icon from './components/Icon'
import Toast, { type ToastData } from './components/Toast'
import { confirmAsk, DialogHost } from './components/Dialog'
import EventSheet, { type EventDraft } from './components/EventSheet'
import { useInstall } from './lib/useInstall'
import { useBackClose } from './lib/useBackClose'

type Tab = 'home' | 'companies' | 'mycard' | 'contacts' | 'exhibition' | 'insights' | 'settings' | 'accuracy'
const TABS: Tab[] = ['home', 'companies', 'mycard', 'contacts', 'exhibition', 'insights', 'settings', 'accuracy']
const CONCURRENCY = 2
/** A read that failed for a passing reason (busy reader, weak signal) is tried again by itself this many times. */
const MAX_ATTEMPTS = 3
const RETRY_DELAY_MS = 30_000
// Photos read per Gemini call. 1 = every card is read on its own (the setting in use).
// Batching is built, tested and deployed: set this to 2-6 and single photos are read together, with Gemini numbering
// which photo each person came from. Measured on six real cards: 26% fewer input tokens, about 18% cheaper, half the
// time, 27 of 27 people correctly attributed. Left at 1 by decision because the saving was judged too small.
const BATCH_MAX = 1

export default function App() {
  // The browser can reload the page while the camera app is open; keep the user where they were.
  const [tab, setTabState] = useState<Tab>(() => { const t = sessionStorage.getItem('tab') as Tab; return TABS.includes(t) ? t : 'home' })
  const setTab = (t: Tab) => { setTabState(t); try { sessionStorage.setItem('tab', t) } catch { /* ignore */ } }
  const [cards, setCards] = useState<CardRecord[]>([])
  const [open, setOpen] = useState<{ id: string; idx: number; review?: boolean; whenDone?: boolean } | null>(null)
  const [settings, setSettings] = useState<Settings>(loadSettings)
  const [banner, setBanner] = useState('')
  const [events, setEvents] = useState<EventRec[]>(loadEvents)
  // an event that has ended stops taking scans; one that is live today starts taking them
  const [activeEvent, setActiveEventState] = useState(() => {
    const a = loadActiveEvent()
    const id = openingEvent(loadEvents(), a, localISO())
    if (id !== a) saveActiveEvent(id)
    return id
  })
  const activeEventRef = useRef(activeEvent)
  activeEventRef.current = activeEvent
  const setActiveEvent = (id: string) => { setActiveEventState(id); saveActiveEvent(id) }
  const [eventSheet, setEventSheet] = useState<{ id?: string } | null>(null)
  /** A new event takes the scans at once unless its dates say it has not started (or is already over). */
  const saveEvent = (d: EventDraft, id?: string) => {
    if (id) {
      const next = events.map((e) => (e.id === id ? { ...e, ...d } : e))
      setEvents(next); saveEvents(next)
    } else {
      const ev: EventRec = { id: crypto.randomUUID(), createdAt: Date.now(), ...d }
      const next = [ev, ...events]
      setEvents(next); saveEvents(next)
      const state = eventState(ev, localISO())
      if (state === 'live' || state === 'undated') setActiveEvent(ev.id)
    }
    setEventSheet(null)
  }
  const dupes = useMemo(() => findDuplicates(cards), [cards])
  const [backTab, setBackTab] = useState<Tab>('home')
  const [contactsFilter, setContactsFilter] = useState<Flt | undefined>()
  const [contactsCompany, setContactsCompany] = useState('')
  const [myCards, setMyCards] = useState<MyCard[]>([])
  const [editingCard, setEditingCard] = useState<string | null>(null)      // a card id, or 'new'
  const [sharingCard, setSharingCard] = useState<string | null>(null)
  const [stallCard, setStallCard] = useState<string | null>(null)
  const newCard = useMemo(() => (editingCard === 'new' ? emptyCard(settings.accent) : null), [editingCard])   // eslint-disable-line react-hooks/exhaustive-deps
  const editorCard = editingCard === 'new' ? newCard : myCards.find((c) => c.id === editingCard)
  const refreshMyCards = useCallback(async () => setMyCards(await listMyCards()), [])
  useEffect(() => { void refreshMyCards() }, [refreshMyCards])
  // A card that is open in the editor, share sheet or stall screen and then disappears (deleted, or replaced by a restore) closes them.
  useEffect(() => {
    const gone = (id: string | null) => !!id && id !== 'new' && !myCards.some((c) => c.id === id)
    if (gone(editingCard)) setEditingCard(null)
    if (gone(sharingCard)) setSharingCard(null)
    if (gone(stallCard)) setStallCard(null)
  }, [myCards, editingCard, sharingCard, stallCard])
  const [camOpen, setCamOpen] = useState(false)
  const [qrOpen, setQrOpen] = useState(false)
  // Android app: the status bar sits over the page top, so its icons follow the screen under them
  const deepTop = !open && !editingCard && (tab === 'home' || tab === 'contacts' || tab === 'exhibition' || tab === 'mycard')
  const darkTheme = settings.theme === 'dark' || (settings.theme !== 'light' && typeof matchMedia !== 'undefined' && matchMedia('(prefers-color-scheme: dark)').matches)
  useEffect(() => { void getNative()?.setStatusBar(statusBarIcons({ deepTop, dark: darkTheme, camera: camOpen || qrOpen, stall: !!stallCard })) }, [deepTop, darkTheme, camOpen, qrOpen, stallCard])
  // failures the user should hear about (a file that could not be saved, a sign-in that did not finish) show as the banner
  useEffect(() => onNotice(setBanner), [])
  const [qrText, setQrText] = useState('')
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

  /** Drops the photo number; what the card says beyond the fixed fields becomes the contact's note, which the user may edit. */
  const stripImage = (c: Contact & { image?: number; extras?: string }): Contact => {
    const { image: _image, extras, ...rest } = c
    return extras ? { ...rest, note: extras } : rest
  }

  /**
   * Read one job: the cards in it share a SINGLE Gemini call. One card (or a front+back pair) is read as itself; several
   * single photos go as a batch and Gemini says which photo each person came from.
   */
  const enqueueRef = useRef<(ids: string[]) => Promise<void>>(async () => {})
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
        ...fresh, image, back, thumbOnly: keepPhotos === 'thumb', status: 'done', error: undefined, waiting: undefined, attempts: undefined, model: stats.model,
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
      const failure = classifyFailure(e)
      const later: string[] = []
      for (const c of cards) {
        const cur = (await getCard(c.id)) ?? c
        const online = navigator.onLine
        const attempts = (cur.attempts ?? 0) + (online ? 1 : 0)          // being offline is not the card's fault
        if (failure.transient && attempts < MAX_ATTEMPTS) {
          await putCard({ ...cur, status: 'pending', error: undefined, attempts, waiting: online ? 'retry' : 'offline' })
          if (online) later.push(c.id)
        } else await putCard({ ...cur, status: 'error', error: failure.message, waiting: undefined })
      }
      if (later.length) setTimeout(() => void enqueueRef.current(later), RETRY_DELAY_MS)
    }
    await refresh()
  }, [refresh, notifyAdded])

  const pump = useCallback(() => {
    while (active.current < CONCURRENCY && queue.current.length) {
      const job = queue.current.shift()!
      active.current++
      void runJob(job).finally(() => { job.forEach((id) => inFlight.current.delete(id)); active.current--; pump() })
    }
  }, [runJob])

  /** Ids that are queued or being read, so a card can never be read twice at once. */
  const inFlight = useRef(new Set<string>())

  /**
   * Group cards into jobs: single photos are read together (up to BATCH_MAX per call); a front+back card is read on its own.
   * With no connection the photos simply stay saved and marked as waiting; they are picked up when signal returns.
   */
  const enqueue = useCallback(async (ids: string[]) => {
    const fresh = ids.filter((id) => !inFlight.current.has(id))
    if (!fresh.length) return
    const recs = await Promise.all(fresh.map((id) => getCard(id)))
    if (!navigator.onLine) {
      await Promise.all(recs.filter((c): c is CardRecord => !!c).map((c) => putCard({ ...c, status: 'pending', waiting: 'offline' })))
      await refresh()
      return
    }
    const singles: string[] = [], jobs: string[][] = []
    recs.forEach((c, i) => { if (!c) return; if (c.back) jobs.push([fresh[i]!]); else singles.push(fresh[i]!) })
    for (let i = 0; i < singles.length; i += BATCH_MAX) jobs.push(singles.slice(i, i + BATCH_MAX))
    for (const j of jobs) j.forEach((id) => inFlight.current.add(id))
    queue.current.push(...jobs)
    pump()
  }, [pump, refresh])
  enqueueRef.current = enqueue

  /** Anything saved but not yet read (the app was closed mid-read, or there was no signal) goes back in the queue. */
  const resumePending = useCallback(async () => {
    const waiting = (await listCards()).filter((c) => (c.status === 'pending' || c.status === 'running') && !inFlight.current.has(c.id))
    if (waiting.length) void enqueue(waiting.map((c) => c.id))
  }, [enqueue])
  const online = useOnline()
  useEffect(() => { if (online) void resumePending() }, [online, resumePending])

  const pullingLeads = useRef(false)
  const pullLeads = useCallback(async () => {
    if (pullingLeads.current) return                 // one pull at a time, so a lead is never written (or announced) twice
    pullingLeads.current = true
    try { await pullLeadsOnce() } finally { pullingLeads.current = false }
  }, [events, refresh])   // eslint-disable-line react-hooks/exhaustive-deps
  const pullLeadsOnce = async () => {
    const found = await pullNewLeads(events)
    if (!found.length) return
    // Only mark a lead pulled once its local contact is actually saved, so a failed write is retried next time
    // instead of the lead being lost. The contact's id comes from the lead, so a lead that is already here (another
    // phone pulled it and it synced, or the server delete did not land) is never written twice or over an edit.
    let added = 0
    const succeeded = await applyPulledLeads(found, async (contact, eventId, leadId) => {
      const id = leadCardId(leadId)
      if (await getCard(id)) return
      await putCard({ id, createdAt: Date.now(), status: 'done', reviewed: false, extracted: [contact], corrected: [contact], eventId })
      added++
    })
    if (!succeeded.length) return
    await markLeadsPulled(succeeded)
    if (!added) return
    await refresh()
    setToast({ id: Date.now(), title: `${added} new ${added === 1 ? 'lead' : 'leads'} from your stall`, sub: 'Ready to call, message or save' })
  }
  const session = useSession()
  const userId = session?.user.id
  // New leads come in whenever the app is online (and on sign-in). A deleted digital card's link is taken down only
  // after that, so leads still waiting on it are received first.
  useEffect(() => { if (online) void pullLeads().finally(() => { if (userId) void flushUnpublish(userId) }) }, [online, pullLeads, userId])
  // Changes from another phone: reload every list. An active event that was deleted elsewhere is let go.
  const reloadAll = useCallback(() => {
    void refresh(); void refreshMyCards()
    const evs = loadEvents()
    setEvents(evs)
    if (activeEventRef.current && !evs.some((e) => e.id === activeEventRef.current)) setActiveEvent('')
  }, [refresh, refreshMyCards])   // eslint-disable-line react-hooks/exhaustive-deps
  const sync = useSync(userId, online, reloadAll)
  const [cardStats, setCardStats] = useState<Map<string, CardStats>>()
  useEffect(() => {
    if (tab !== 'mycard' || !userId || !online) return
    let live = true
    void fetchCardStats().then((m) => { if (live) setCardStats(m) })
    return () => { live = false }
  }, [tab, userId, online])

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
  useBackClose(tab !== 'home' && !open && !camOpen, () => setTab(tab === 'accuracy' || tab === 'insights' ? backTab : 'home'))
  const openCard = open ? cards.find((c) => c.id === open.id) : undefined
  const eventLabel = events.find((e) => e.id === activeEvent)?.name ?? ''

  const removeEvent = async (id: string) => {
    if (!await confirmAsk({ title: 'Delete this event?', message: 'Its contacts are kept, just no longer grouped under it.', confirmLabel: 'Delete', danger: true })) return
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
  const goto = (t: Tab, from?: Tab) => { if (from) setBackTab(from); setOpen(null); setTab(t) }
  const gotoTab = (t: Tab) => { setContactsFilter(undefined); setContactsCompany(''); goto(t) }
  /** Open Contacts pre-filtered from Home or Companies. The list spans every event, so the event tab resets to All. */
  const openContacts = (f?: Flt, company = '') => { setActiveEvent(''); setContactsFilter(f); setContactsCompany(company); goto('contacts') }
  const scanHere = (id: string) => {
    setActiveEvent(id)
    try { localStorage.setItem('cardpulse.captureMode', 'many') } catch { /* ignore */ }
    scan()
  }
  const togglePriority = async (cardId: string, idx: number) => {
    const c = await getCard(cardId)
    const p = c?.corrected?.[idx]
    if (!c || !p) return
    await putCard({ ...c, corrected: c.corrected!.map((x, i) => (i === idx ? { ...x, priority: !x.priority } : x)) })
    await refresh()
  }
  const [backupTick, setBackupTick] = useState(0)
  const nudgeBackup = useMemo(() => backupDue(cards.length, lastBackupAt(), backupNudgeUntil()), [cards.length, backupTick])   // eslint-disable-line react-hooks/exhaustive-deps
  const backupNow = async (): Promise<string> => {
    const all = await listCards()
    try { await saveBackupFile(await buildBackup(all, events, Date.now(), await listMyCards()), backupFileName()) } catch (e) { if ((e as Error)?.name === 'AbortError') return 'Export cancelled.'; throw e }
    markBackedUp(); setBackupTick((n) => n + 1)
    return `Exported ${all.length} ${all.length === 1 ? 'card' : 'cards'}.`
  }
  const restoreFrom = async (file: File): Promise<string> => {
    const parsed = await parseBackup(file)
    const plan = planRestore((await listCards()).map((c) => c.id), parsed.cards)
    for (const c of plan.add) await putCard(c)
    const merged = mergeEvents(events, parsed.events)
    setEvents(merged); saveEvents(merged)
    const mine = planCardRestore((await listMyCards()).map((c) => c.id), parsed.myCards)
    for (const c of mine.add) await putMyCard(c)
    await Promise.all([refresh(), refreshMyCards()])
    const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`
    const skipped = plan.skipped + mine.skipped
    return `Restored ${n(plan.add.length, 'card', 'cards')}${mine.add.length ? ` and ${n(mine.add.length, 'digital card', 'digital cards')}` : ''}${skipped ? `. ${skipped} ${skipped === 1 ? 'was' : 'were'} already here` : ''}.`
  }
  const retryFailed = () => enqueue(cards.filter((c) => c.status === 'error').map((c) => c.id))
  // Settings, Accuracy, Insights and Companies open from Home, so Home stays lit under them.
  const navActive: Tab = tab === 'accuracy' || tab === 'insights' || tab === 'settings' || tab === 'companies' ? 'home' : tab

  return (
    <div className="app">
      <main>
        {!online && <div className="offline-bar" role="status">You are offline. Cards you scan are saved and will be read when you are back online.</div>}
        {banner && <div className="banner">{banner}</div>}
        <div className="view" key={openCard ? `o-${open?.id}-${open?.review ? 'r' : 'd'}` : tab}>
        {editorCard ? (
          <CardEditor key={editorCard.id} card={editorCard} isNew={editingCard === 'new'}
            onSave={async (c) => { await putMyCard(c); await refreshMyCards(); setEditingCard(null); setTab('mycard') }}
            onDelete={async (id) => {
              await deleteMyCard(id); queueUnpublish(id); await refreshMyCards(); setEditingCard(null)
              if (userId && navigator.onLine) void pullLeads().finally(() => flushUnpublish(userId))
            }}
            onClose={() => setEditingCard(null)} />
        ) : openCard && open?.review ? (
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
        ) : tab === 'home' ? (
          <Home cards={cards} events={events} dupes={dupes} ready={readerReady(settings)} needsKey={!serverMode || !!settings.useOwnKey} install={install} backupNudge={nudgeBackup}
            onBackup={() => void backupNow().then((m) => setBanner(m), () => setBanner('The export could not be saved. Try again.'))} onSnoozeBackup={() => { snoozeBackupNudge(); setBackupTick((n) => n + 1) }}
            onOpenContact={(id, idx) => setOpen({ id, idx })} onTogglePriority={(id, idx) => void togglePriority(id, idx)} onContacts={() => openContacts()} onCompanies={() => goto('companies')} onStarred={() => openContacts('priority')}
            onAttention={() => openContacts('attention')} onInsights={() => goto('insights', 'home')} onSetup={() => goto('settings', 'home')} onSettings={() => goto('settings', 'home')}
            onViewEvent={(id) => { setContactsFilter(undefined); setContactsCompany(''); setActiveEvent(id); goto('contacts') }} onEvents={() => gotoTab('exhibition')} onScan={scan} onMyCard={() => gotoTab('mycard')} />
        ) : tab === 'mycard' ? (
          <MyCards cards={myCards} stats={cardStats} onAdd={() => myCards.length < MAX_CARDS && setEditingCard('new')} onEdit={setEditingCard} onShare={setSharingCard} onStall={setStallCard} />
        ) : tab === 'companies' ? (
          <Companies cards={cards} onBack={() => setTab('home')} onOpenCompany={(name) => openContacts(undefined, name)} />
        ) : tab === 'contacts' ? (
          <Contacts onScan={scan} cards={cards} events={events} activeEvent={activeEvent} onSelectEvent={setActiveEvent} dupes={dupes} initialFilter={contactsFilter} initialCompany={contactsCompany} onTogglePriority={(id, idx) => void togglePriority(id, idx)}
            onOpen={(id, idx) => setOpen({ id, idx })} onRetryFailed={retryFailed} onUpload={(f) => void addFiles(f)} onMoveToEvent={moveToEvent} onDeleteContacts={deleteContacts} />
        ) : tab === 'exhibition' ? (
          <Exhibition cards={cards} events={events} activeEvent={activeEvent} onNew={() => setEventSheet({})} onEdit={(id) => setEventSheet({ id })} onDelete={removeEvent}
            onScanHere={scanHere} onView={(id) => { setActiveEvent(id); goto('contacts') }}
            onOpenContact={(id, idx) => setOpen({ id, idx })} onTogglePriority={(id, idx) => void togglePriority(id, idx)} />
        ) : tab === 'insights' ? (
          <Insights cards={cards} onBack={() => setTab(backTab)} onContacts={() => goto('contacts')} onAccuracy={() => goto('accuracy', 'insights')} onOpen={(id, idx) => setOpen({ id, idx })} />
        ) : tab === 'accuracy' ? (
          <Report cards={cards} events={events} dupes={dupes} onBack={() => setTab(backTab)} />
        ) : (
          <SettingsPage
            cards={cards}
            events={events}
            settings={settings}
            install={install}
            sync={sync}
            onChange={(s) => { setSettings(s); saveSettings(s) }}
            onWipe={async () => {
              await wipeContactData({ cardIds: () => cards.map((c) => c.id), deleteCard, saveEvents: (list) => { setEvents(list); saveEvents(list) }, setActiveEvent })
              await refresh()
            }}
            onBackup={backupNow} onRestore={restoreFrom} onAccuracy={() => goto('accuracy', 'settings')} onInsights={() => goto('insights', 'settings')}
            onBack={() => setTab('home')}
          />
        )}
        </div>
      </main>
      {sharingCard && myCards.find((c) => c.id === sharingCard) && (
        <CardShare card={myCards.find((c) => c.id === sharingCard)!} onClose={() => setSharingCard(null)} onStall={() => setStallCard(sharingCard)} />
      )}
      {stallCard && myCards.find((c) => c.id === stallCard) && (
        <StallMode card={myCards.find((c) => c.id === stallCard)!} events={events} initialEventId={activeEvent || undefined} onClose={() => setStallCard(null)} />
      )}
      {camOpen && <Camera eventLabel={eventLabel} onQr={() => { setCamOpen(false); setQrOpen(true) }} onSubmit={(cards) => { void addBatch(cards); goto('contacts') }} onGallery={(fs) => { void addFiles(fs) }} onClose={() => setCamOpen(false)} />}
      {qrOpen && (
        <QrScanner paused={!!qrText} eventLabel={eventLabel ? showEvent(eventLabel) : ''} onFound={setQrText} onClose={() => { setQrOpen(false); setQrText('') }}
          onPhotoMode={(m) => { try { localStorage.setItem('cardpulse.captureMode', m) } catch { /* ignore */ } setQrOpen(false); setQrText(''); setCamOpen(true) }} />
      )}
      {qrOpen && qrText && (
        <QrResult raw={qrText} myCard={myCards[0]} onAgain={() => setQrText('')} onClose={() => { setQrText(''); setQrOpen(false) }}
          onShowMyQr={() => { setQrText(''); setQrOpen(false); if (myCards[0]) setStallCard(myCards[0].id) }}
          onSave={async (contact) => {
            await putCard({ id: crypto.randomUUID(), createdAt: Date.now(), status: 'done', reviewed: true, source: 'qr', extracted: [contact], corrected: [structuredClone(contact)], eventId: activeEventRef.current || undefined })
            await refresh()
          }} />
      )}
      <input ref={fallbackInput} type="file" accept="image/*" capture="environment" hidden onChange={(e) => { if (e.target.files) void addFiles(e.target.files); e.target.value = '' }} />
      <Toast toast={toast} onDone={() => setToast(null)} />
      <EventSheet open={!!eventSheet} event={events.find((e) => e.id === eventSheet?.id)} onSave={(d) => saveEvent(d, eventSheet?.id)} onClose={() => setEventSheet(null)} />
      <DialogHost />
      {!openCard && !editorCard && (
        <nav>
          <NavBtn id="home" label="Home" icon="home" active={navActive} go={gotoTab} />
          <NavBtn id="contacts" label="Contacts" icon="users" active={navActive} go={gotoTab} />
          <button className="scan-key" onClick={scan} aria-label="Scan a card"><span className="ind"><Icon name="camera" size={20} /></span><span>Scan</span></button>
          <NavBtn id="exhibition" label="Events" icon="booth" active={navActive} go={gotoTab} />
          <NavBtn id="mycard" label="My Card" icon="card" active={navActive} go={gotoTab} />
        </nav>
      )}
    </div>
  )
}

function NavBtn({ id, label, icon, active, go }: { id: Tab; label: string; icon: 'home' | 'users' | 'card' | 'booth'; active: Tab; go: (t: Tab) => void }) {
  return (
    <button className={active === id ? 'on' : ''} onClick={() => go(id)} aria-current={active === id ? 'page' : undefined}>
      <span className="ind"><Icon name={icon} size={22} /></span>
      <span>{label}</span>
    </button>
  )
}
