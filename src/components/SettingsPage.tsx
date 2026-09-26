import { useEffect, useState } from 'react'
import { lastBackupAt } from '../lib/backup'
import { buildFeedback, sendFeedback, type Diagnostics } from '../lib/feedback'
import { clearLog, readLog, subscribe } from '../lib/debug'
import { DEFAULT_MODEL, listModels, serverMode } from '../lib/gemini'
import type { Settings, Theme } from '../lib/db'
import { overall, scoreCard, sumTallies } from '../lib/score'
import type { CardRecord, EventRec } from '../lib/types'
import { download } from '../lib/actions'
import { currentNameFormat } from '../lib/db'
import { buildCsv, buildVcf } from '../lib/export'
import { useSession } from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import { useBackClose } from '../lib/useBackClose'
import { DEFAULT_NAME_FORMAT, NAME_FORMATS, type NameFormat } from '../lib/naming'
import type { SyncControl } from '../lib/useSync'
import AccountSection, { statusLine } from './AccountSection'
import Check from './Check'
import { confirmAsk } from './Dialog'
import Icon from './Icon'
import Picker, { type PickOption } from './Picker'
import Logo from './Logo'
import Sheet, { SheetItem } from './Sheet'
import { SettingGroup, SettingRow } from './SettingRow'

const MODELS_KEY = 'cardpulse.models'

interface Install { mode: 'native' | 'ios' | null; install: () => void }

const THEMES: PickOption<Theme>[] = [{ value: 'system', label: 'Match my phone' }, { value: 'light', label: 'Light' }, { value: 'dark', label: 'Dark' }]
const PHOTOS: PickOption<Settings['keepPhotos']>[] = [
  { value: 'full', label: 'Full photo', hint: 'A card can be re-read or adjusted later' },
  { value: 'thumb', label: 'Small thumbnail', hint: 'Saves space; the card cannot be re-read' },
  { value: 'none', label: "Don't keep", hint: 'Saves the most space at exhibitions' },
]
const NAMES: PickOption<NameFormat>[] = NAME_FORMATS.map((f) => ({ value: f.id, label: f.label, hint: `Calls show “${f.example('Abhishek Jain', 'Vivacity Woven Sack')}”` }))

/** A row that opens the app's own option sheet; the row itself is the trigger. */
function PickRow<T extends string>({ icon, label, value, options, onChange }: { icon: Parameters<typeof Icon>[0]['name']; label: string; value: T; options: PickOption<T>[]; onChange: (v: T) => void }) {
  return (
    <Picker className="setting-row" title={label} value={value} options={options} onChange={onChange}>
      <Icon name={icon} size={20} />
      <span className="grow"><strong>{label}</strong></span>
      <span className="setting-value">{options.find((o) => o.value === value)?.label}</span>
      <Icon name="chevron" size={16} />
    </Picker>
  )
}

type Sub = 'account' | 'prefs' | 'help'

/**
 * Settings is a hub, not one long list: who you are and what this phone holds at the top, the tools you reach for as four
 * keys, and the rest (preferences, account, help) each on a page of its own, so nothing is more than one tap deep.
 */
export default function SettingsPage({ cards, events, settings, install, sync, onChange, onWipe, onBackup, onRestore, onAccuracy, onInsights, onBack }: {
  cards: CardRecord[]
  events: EventRec[]
  sync: SyncControl
  settings: Settings
  install: Install
  onChange: (s: Settings) => void
  onWipe: () => void
  onBackup: () => Promise<string>
  onRestore: (f: File) => Promise<string>
  onAccuracy: () => void
  onInsights: () => void
  onBack: () => void
}) {
  const [lines, setLines] = useState(readLog)
  useEffect(() => subscribe(() => setLines(readLog())), [])
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyData, setBusyData] = useState(false)
  const [last, setLast] = useState(lastBackupAt)
  const [sheet, setSheet] = useState<'feedback' | 'diagnostics' | 'export' | null>(null)
  const [sub, setSubState] = useState<Sub | null>(null)
  const setSub = (v: Sub | null) => { setSubState(v); setDataMsg(null); window.scrollTo(0, 0) }
  useBackClose(!!sub, () => setSub(null))
  const session = useSession()

  const runData = async (job: () => Promise<string>) => {
    setBusyData(true); setDataMsg(null)
    try { setDataMsg({ ok: true, text: await job() }); setLast(lastBackupAt()) } catch (e) { setDataMsg({ ok: false, text: e instanceof Error ? e.message : 'That did not work. Try again.' }) }
    setBusyData(false)
  }
  const wipe = async () => {
    const ok = await confirmAsk({
      title: 'Delete all data?',
      message: sync.enabled
        ? 'Every scanned card, contact and event on this phone, and on your other synced phones, is deleted. Your own digital cards and settings stay. This cannot be undone.'
        : 'Every scanned card, contact and event on this phone is deleted. Your own digital cards and settings stay. This cannot be undone.',
      confirmLabel: 'Delete all', danger: true,
    })
    if (ok) onWipe()
  }
  const done = cards.filter((c) => c.status === 'done')
  const people = done.reduce((n, c) => n + (c.corrected?.length ?? 0), 0)
  const eventName = (id?: string) => events.find((e) => e.id === id)?.name ?? ''
  const lastLabel = last ? `Last saved ${new Date(last).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })}` : 'Not saved yet'
  // only cards the user has opened count: an unopened card has not been checked, so it says nothing about accuracy
  const acc = overall(sumTallies(cards.filter((c) => c.opened).map(scoreCard).filter((x): x is NonNullable<typeof x> => !!x)))
  const name = (session?.user.user_metadata as { full_name?: string } | undefined)?.full_name || session?.user.email || ''
  const stamp = new Date().toISOString().slice(0, 10)

  const msg = dataMsg && <p className={dataMsg.ok ? 'hint ok setting-msg' : 'hint bad setting-msg'} role="status">{dataMsg.text}</p>
  const head = (title: string, back: () => void) => (
    <header className="bar-top settings-head">
      <button className="icon-btn" onClick={back} aria-label="Back"><Icon name="back" /></button>
      <h1 className="grow">{title}</h1>
    </header>
  )

  if (sub === 'account') return <>{head('Account', () => setSub(null))}<AccountSection sync={sync} /></>

  if (sub === 'prefs') return (
    <>
      {head('Preferences', () => setSub(null))}
      <SettingGroup title="Saving contacts" footer="How contacts are named when you save them to your phone. The call screen shows only the name, so adding the company makes it show on incoming calls.">
        <PickRow icon="phone" label="Saved as" value={settings.nameFormat ?? DEFAULT_NAME_FORMAT} options={NAMES} onChange={(v) => onChange({ ...settings, nameFormat: v })} />
      </SettingGroup>
      <SettingGroup title="Display">
        <PickRow icon="moon" label="Theme" value={settings.theme ?? 'system'} options={THEMES} onChange={(v) => onChange({ ...settings, theme: v })} />
      </SettingGroup>
      <SettingGroup title="This phone" footer={sync.enabled ? 'Deleting here deletes on your synced phones too.' : "Contacts live only on this phone until you sync or export them."}>
        <PickRow icon="image" label="Keep card photos" value={settings.keepPhotos} options={PHOTOS} onChange={(v) => onChange({ ...settings, keepPhotos: v })} />
        {install.mode && (
          <SettingRow icon="download" label="Install app" hint={install.mode === 'ios' ? 'Tap Share, then Add to Home Screen' : 'Add CardPulse to your home screen'}
            onClick={install.mode === 'native' ? install.install : undefined} />
        )}
        <SettingRow icon="trash" label="Delete all data" danger onClick={() => void wipe()} />
      </SettingGroup>
      {!serverMode && <DeveloperKey settings={settings} onChange={onChange} />}
    </>
  )

  if (sub === 'help') return (
    <>
      {head('Help & support', () => setSub(null))}
      <SettingGroup title="Talk to us">
        <SettingRow icon="chat" label="Send feedback" hint="Something wrong, or an idea?" onClick={() => setSheet('feedback')} />
      </SettingGroup>
      <SettingGroup title="About">
        <SettingRow icon="globe" label="Privacy policy" href={`${import.meta.env.BASE_URL}privacy.html`} />
        <SettingRow icon="file" label="Diagnostics" hint="The app's recent log, for fixing problems" onClick={() => setSheet('diagnostics')} />
      </SettingGroup>
      <FeedbackSheet open={sheet === 'feedback'} onClose={() => setSheet(null)} cards={cards} settings={settings} lines={lines} />
      <Sheet open={sheet === 'diagnostics'} onClose={() => setSheet(null)} title="Diagnostics">
        <div className="sheet-body">
          <pre className="diag-log">{lines.join('\n') || '(empty)'}</pre>
          <button className="outline wide" onClick={clearLog}>Clear the log</button>
        </div>
      </Sheet>
    </>
  )

  return (
    <>
      {head('Settings', onBack)}

      {/* who you are and what this phone holds: the one indigo-washed block on the page */}
      <section className="acct full-bleed" aria-label="Account and this phone">
        {cloudEnabled && (
          <button className="acct-who" onClick={() => setSub('account')}>
            <span className="acct-avatar" aria-hidden="true">{session ? (name.trim()[0] ?? '?').toUpperCase() : <Icon name="user" size={20} />}</span>
            <span className="grow">
              <strong>{session ? name : 'Sign in with Google'}</strong>
              <small>{session ? statusLine(sync.status, sync.enabled) : 'Your card link, stall leads and sync'}</small>
            </span>
            <Icon name="chevron" size={16} />
          </button>
        )}
        <div className="acct-figs" role="group" aria-label="This phone">
          <div><span>Contacts</span><b className="num">{people}</b></div>
          <button onClick={onAccuracy} aria-label={`Accuracy ${acc == null ? 'not measured yet' : `${Math.round(acc * 100)}%`}. Open the accuracy report`}>
            <span>Accuracy</span><b className="num">{acc == null ? '–' : `${Math.round(acc * 100)}%`}</b>
          </button>
          <div><span>Sync</span><b>{sync.enabled ? 'On' : 'Off'}</b></div>
        </div>
      </section>

      <h3 className="group band">Tools</h3>
      <div className="tools full-bleed" role="group" aria-label="Tools">
        <button onClick={() => setSheet('export')} disabled={busyData}><span className="tool-well"><Icon name="upload" size={20} /></span>Export</button>
        <label className={busyData ? 'off' : ''}>
          <span className="tool-well"><Icon name="download" size={20} /></span>Restore
          <input type="file" accept=".zip,application/zip" hidden disabled={busyData} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runData(() => onRestore(f)) }} />
        </label>
        <button onClick={onAccuracy}><span className="tool-well"><Icon name="chart" size={20} /></span>Accuracy</button>
        <button onClick={onInsights}><span className="tool-well"><Icon name="spark" size={20} /></span>Insights</button>
      </div>
      {msg}

      <h3 className="group band">More</h3>
      <section className="setting-group">
        <SettingRow icon="sliders" label="Preferences" hint="Contact names, card photos, theme" onClick={() => setSub('prefs')} />
        {cloudEnabled && <SettingRow icon="cloud" label="Account and sync" hint={session ? session.user.email : 'Not signed in'} onClick={() => setSub('account')} />}
        <SettingRow icon="chat" label="Help & support" hint="Feedback, privacy, diagnostics" onClick={() => setSub('help')} />
      </section>

      <footer className="about"><Logo size={24} /><span>CardPulse v{__APP_VERSION__}</span></footer>

      <Sheet open={sheet === 'export'} onClose={() => setSheet(null)} title="Export">
        <SheetItem icon="file" label="Spreadsheet (CSV)" hint={`All ${people} contacts, for Excel or Google Sheets`} disabled={!done.length}
          onClick={() => { setSheet(null); download(`cardpulse-contacts-${stamp}.csv`, buildCsv(done, eventName), 'text/csv') }} />
        <SheetItem icon="users" label="Contacts file (vCard)" hint="Import into Google Contacts, Outlook or iCloud to add them all at once" disabled={!done.length}
          onClick={() => { setSheet(null); download(`cardpulse-contacts-${stamp}.vcf`, buildVcf(done, eventName, currentNameFormat()), 'text/vcard') }} />
        <SheetItem icon="download" label="Backup file" hint={`Contacts, photos and events, to restore on any phone. ${lastLabel}`}
          onClick={() => { setSheet(null); void runData(onBackup) }} />
        <p className="hint sheet-note">{sync.enabled
          ? 'Sync already keeps your phones up to date. An export is a copy as of now that you keep yourself.'
          : 'Your contacts are only on this phone. A backup file keeps them safe if the phone is lost or reset.'}</p>
      </Sheet>
    </>
  )
}

function FeedbackSheet({ open, onClose, cards, settings, lines }: { open: boolean; onClose: () => void; cards: CardRecord[]; settings: Settings; lines: string[] }) {
  const [text, setText] = useState('')
  const [diag, setDiag] = useState(true)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const diagnostics = (): Diagnostics => ({
    version: __APP_VERSION__, userAgent: navigator.userAgent, online: navigator.onLine, screen: `${screen.width}x${screen.height}`,
    installed: window.matchMedia('(display-mode: standalone)').matches,
    cards: { total: cards.length, failed: cards.filter((c) => c.status === 'error').length, waiting: cards.filter((c) => c.status === 'pending' && c.waiting).length },
    settings: { keepPhotos: settings.keepPhotos, theme: settings.theme ?? 'system', ownKey: !!settings.useOwnKey },
    failures: [...new Set(cards.filter((c) => c.status === 'error' && c.error).map((c) => c.error!))].slice(0, 5),
    recentLog: lines.slice(-12),
  })
  const send = async () => {
    try {
      const how = await sendFeedback(buildFeedback(text, diag ? diagnostics() : undefined))
      setMsg({ ok: true, text: how === 'copied' ? 'Copied. Paste it into an email or WhatsApp to send it to us.' : 'Thank you. That helps.' })
      if (how !== 'copied') setText('')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setMsg({ ok: false, text: 'Could not send it. Try again.' })
    }
  }
  return (
    <Sheet open={open} onClose={onClose} title="Send feedback">
      <div className="sheet-body">
        <textarea rows={4} value={text} onChange={(e) => setText(e.target.value)} placeholder="Tell us what happened" aria-label="Your feedback" />
        <Check checked={diag} onChange={setDiag}>Include app details to help us fix it <small>No contacts, photos or keys</small></Check>
        <button className="cta wide" disabled={!text.trim()} onClick={() => void send()}>Send feedback</button>
        {msg && <p className={msg.ok ? 'hint ok' : 'hint bad'} role="status">{msg.text}</p>}
      </div>
    </Sheet>
  )
}

/** Only in a build with no CardPulse reading service (local development): read cards with your own Gemini key. */
function DeveloperKey({ settings, onChange }: { settings: Settings; onChange: (s: Settings) => void }) {
  const [key, setKey] = useState(settings.apiKey)
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [models, setModels] = useState<string[]>(() => {
    try { const m = JSON.parse(localStorage.getItem(MODELS_KEY) ?? '[]') as string[]; if (m.length) return m } catch { /* ignore */ }
    return settings.model ? [settings.model] : []
  })
  const connect = async () => {
    setBusy(true); setMsg(null)
    try {
      const list = await listModels(key.trim())
      const flash = list.filter((m) => /flash/.test(m) && !/(image|tts|live|audio|thinking|lite|preview|exp)/.test(m))
      const pick = list.includes(settings.model) ? settings.model : list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL : flash[flash.length - 1] ?? list[0]
      setModels(list)
      try { localStorage.setItem(MODELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
      onChange({ ...settings, apiKey: key.trim(), model: pick })
      setMsg({ ok: true, text: `Connected. ${list.length} models available.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not connect' })
    } finally { setBusy(false) }
  }
  return (
    <>
      <h3 className="group band">Developer</h3>
      <section className="dev-panel">
        <p className="hint" style={{ marginTop: 0 }}>This build has no reading service, so cards are read with your own Gemini key. It stays on this device and is sent only to Google.</p>
        <input type="password" aria-label="Gemini API key" autoComplete="off" placeholder="Gemini key (starts with AIza)" value={key} onChange={(e) => setKey(e.target.value)} />
        <button className="cta wide" onClick={() => void connect()} disabled={!key.trim() || busy}>{busy ? 'Checking…' : 'Save and connect'}</button>
        {msg && <p className={`inline-msg${msg.ok ? ' ok' : ' bad'}`}>{msg.text}</p>}
        {models.length > 0 && (
          <Picker className="pick wide" title="Model" value={settings.model} onChange={(v) => onChange({ ...settings, model: v })} options={models.map((m) => ({ value: m, label: m }))} />
        )}
      </section>
    </>
  )
}
