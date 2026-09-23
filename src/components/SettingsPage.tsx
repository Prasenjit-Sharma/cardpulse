import { useEffect, useState } from 'react'
import { ACCENTS, accentById } from '../lib/accents'
import { lastBackupAt } from '../lib/backup'
import { buildFeedback, sendFeedback, type Diagnostics } from '../lib/feedback'
import { clearLog, readLog, subscribe } from '../lib/debug'
import { DEFAULT_MODEL, listModels, serverMode } from '../lib/gemini'
import type { Settings, Theme } from '../lib/db'
import type { CardRecord } from '../lib/types'
import { DEFAULT_NAME_FORMAT, NAME_FORMATS, type NameFormat } from '../lib/naming'
import type { SyncControl } from '../lib/useSync'
import AccountSection from './AccountSection'
import Check from './Check'
import { confirmAsk } from './Dialog'
import Icon from './Icon'
import Picker, { type PickOption } from './Picker'
import Logo from './Logo'
import Sheet from './Sheet'
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

export default function SettingsPage({ cards, settings, install, sync, onChange, onWipe, onBackup, onRestore, onBack }: {
  cards: CardRecord[]
  sync: SyncControl
  settings: Settings
  install: Install
  onChange: (s: Settings) => void
  onWipe: () => void
  onBackup: () => Promise<string>
  onRestore: (f: File) => Promise<string>
  onBack: () => void
}) {
  const [lines, setLines] = useState(readLog)
  useEffect(() => subscribe(() => setLines(readLog())), [])
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyData, setBusyData] = useState(false)
  const [last, setLast] = useState(lastBackupAt)
  const [sheet, setSheet] = useState<'feedback' | 'diagnostics' | null>(null)

  const runData = async (job: () => Promise<string>) => {
    setBusyData(true); setDataMsg(null)
    try { setDataMsg({ ok: true, text: await job() }); setLast(lastBackupAt()) } catch (e) { setDataMsg({ ok: false, text: e instanceof Error ? e.message : 'That did not work. Try again.' }) }
    setBusyData(false)
  }
  const wipe = async () => {
    const ok = await confirmAsk({
      title: 'Delete all data?',
      message: sync.enabled
        ? 'Every card and contact on this phone, and on your other synced phones, is deleted. This cannot be undone.'
        : 'Every card and contact on this phone is deleted. This cannot be undone.',
      confirmLabel: 'Delete all', danger: true,
    })
    if (ok) onWipe()
  }
  const accent = accentById(settings.accent)
  const lastLabel = last ? `Last backup ${new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet'

  return (
    <>
      <header className="page-head"><div className="head-left"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Settings</h1></div></header>

      <AccountSection sync={sync} />

      <SettingGroup title="General" footer="Your phone's call screen shows only a contact's name, so putting the company in the name makes it show on incoming calls.">
        <PickRow icon="phone" label="Name on your phone" value={settings.nameFormat ?? DEFAULT_NAME_FORMAT} options={NAMES} onChange={(v) => onChange({ ...settings, nameFormat: v })} />
        <PickRow icon="image" label="Keep card photos" value={settings.keepPhotos} options={PHOTOS} onChange={(v) => onChange({ ...settings, keepPhotos: v })} />
        {install.mode && (
          <SettingRow icon="download" label="Install app" hint={install.mode === 'ios' ? 'Tap Share, then Add to Home Screen' : 'Add CardPulse to your home screen'}
            onClick={install.mode === 'native' ? install.install : undefined} />
        )}
      </SettingGroup>

      <SettingGroup title="Display">
        <PickRow icon="sliders" label="Theme" value={settings.theme ?? 'system'} options={THEMES} onChange={(v) => onChange({ ...settings, theme: v })} />
        <div className="setting-row accent-row-wrap">
          <span className="accent-dot" aria-hidden="true" />
          <span className="grow"><strong>Accent colour</strong><small>{accent.name}</small></span>
          <div className="accent-row" role="radiogroup" aria-label="Accent colour">
            {ACCENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={accent.id === a.id} aria-label={`${a.name}, ${a.suits}`} title={a.name}
                className="accent-sw" style={{ ['--sw' as string]: a.hex, ['--sw-l' as string]: a.lite }} onClick={() => onChange({ ...settings, accent: a.id })} />
            ))}
          </div>
        </div>
      </SettingGroup>

      <SettingGroup title="Your data" footer={sync.enabled
        ? 'Contacts are on this phone and synced to your account. A backup file is the copy only you hold.'
        : "Contacts are stored only on this phone. Clearing the app's data removes them, so keep a backup."}>
        <SettingRow icon="download" label="Back up all contacts" hint={lastLabel} disabled={busyData} onClick={() => void runData(onBackup)} />
        <label className="setting-row">
          <Icon name="upload" size={20} /><span className="grow"><strong>Restore from a backup</strong><small>Adds what is missing; never overwrites</small></span><Icon name="chevron" size={16} />
          <input type="file" accept=".zip,application/zip" hidden disabled={busyData} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runData(() => onRestore(f)) }} />
        </label>
        <SettingRow icon="trash" label="Delete all data" danger onClick={() => void wipe()} />
      </SettingGroup>
      {dataMsg && <p className={dataMsg.ok ? 'hint ok setting-msg' : 'hint bad setting-msg'} role="status">{dataMsg.text}</p>}

      <SettingGroup title="Help & support">
        <SettingRow icon="chat" label="Send feedback" hint="Something wrong, or an idea?" onClick={() => setSheet('feedback')} />
        <SettingRow icon="globe" label="Privacy policy" href={`${import.meta.env.BASE_URL}privacy.html`} />
        <SettingRow icon="file" label="Diagnostics" hint="The app's recent log, for fixing problems" onClick={() => setSheet('diagnostics')} />
      </SettingGroup>

      {!serverMode && <DeveloperKey settings={settings} onChange={onChange} />}

      <footer className="about"><Logo size={24} /><span>CardPulse v{__APP_VERSION__}</span></footer>

      <FeedbackSheet open={sheet === 'feedback'} onClose={() => setSheet(null)} cards={cards} settings={settings} lines={lines} />
      <Sheet open={sheet === 'diagnostics'} onClose={() => setSheet(null)} title="Diagnostics">
        <div className="sheet-body">
          <pre className="diag-log">{lines.join('\n') || '(empty)'}</pre>
          <button className="outline wide" onClick={clearLog}>Clear the log</button>
        </div>
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
      <h3 className="group">Developer</h3>
      <section className="card">
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
