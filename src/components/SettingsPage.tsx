import { useEffect, useState } from 'react'
import { ACCENTS, accentById } from '../lib/accents'
import { lastBackupAt } from '../lib/backup'
import { buildFeedback, sendFeedback, type Diagnostics } from '../lib/feedback'
import { clearLog, readLog, subscribe } from '../lib/debug'
import { DEFAULT_MODEL, listModels, serverMode } from '../lib/gemini'
import type { Settings, Theme } from '../lib/db'
import type { CardRecord } from '../lib/types'
import { DEFAULT_NAME_FORMAT, displayName, NAME_FORMATS, type NameFormat } from '../lib/naming'
import Icon from './Icon'
import Picker from './Picker'
import Logo from './Logo'

const MODELS_KEY = 'cardpulse.models'

interface Install { mode: 'native' | 'ios' | null; install: () => void }

export default function SettingsPage({ cards, settings, install, onChange, onWipe, onBackup, onRestore, onOpenAccuracy, onOpenInsights, onBack }: {
  cards: CardRecord[]
  settings: Settings
  install: Install
  onChange: (s: Settings) => void
  onWipe: () => void
  onBackup: () => Promise<string>
  onRestore: (f: File) => Promise<string>
  onOpenAccuracy: () => void
  onOpenInsights: () => void
  onBack: () => void
}) {
  const [lines, setLines] = useState(readLog)
  useEffect(() => subscribe(() => setLines(readLog())), [])
  const [key, setKey] = useState(settings.apiKey)
  const [models, setModels] = useState<string[]>(() => {
    try { const m = JSON.parse(localStorage.getItem(MODELS_KEY) ?? '[]') as string[]; if (m.length) return m } catch { /* ignore */ }
    return settings.model ? [settings.model] : []
  })
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [dataMsg, setDataMsg] = useState<{ ok: boolean; text: string } | null>(null)
  const [busyData, setBusyData] = useState(false)
  const [last, setLast] = useState(lastBackupAt)
  const [fbText, setFbText] = useState('')
  const [fbDiag, setFbDiag] = useState(true)
  const [fbMsg, setFbMsg] = useState<{ ok: boolean; text: string } | null>(null)
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
      const how = await sendFeedback(buildFeedback(fbText, fbDiag ? diagnostics() : undefined))
      setFbMsg({ ok: true, text: how === 'copied' ? 'Copied. Paste it into an email or WhatsApp to send it to us.' : 'Thank you. That helps.' })
      if (how !== 'copied') setFbText('')
    } catch (e) {
      if ((e as Error)?.name !== 'AbortError') setFbMsg({ ok: false, text: 'Could not send it. Try again.' })
    }
  }
  const runData = async (job: () => Promise<string>) => {
    setBusyData(true); setDataMsg(null)
    try { setDataMsg({ ok: true, text: await job() }); setLast(lastBackupAt()) } catch (e) { setDataMsg({ ok: false, text: e instanceof Error ? e.message : 'That did not work. Try again.' }) }
    setBusyData(false)
  }
  const [busy, setBusy] = useState(false)

  // Refresh the model list whenever Settings opens, so the dropdown always offers everything the key can use.
  useEffect(() => {
    if (!settings.apiKey) return
    listModels(settings.apiKey).then((l) => {
      setModels(l)
      try { localStorage.setItem(MODELS_KEY, JSON.stringify(l)) } catch { /* ignore */ }
    }).catch(() => { /* offline or bad key: keep the cached list */ })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const connect = async () => {
    setBusy(true); setMsg(null)
    try {
      const list = await listModels(key.trim())
      const flash = list.filter((m) => /flash/.test(m) && !/(image|tts|live|audio|thinking|lite|preview|exp)/.test(m))
      const pick = list.includes(settings.model) ? settings.model
        : list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL
        : flash[flash.length - 1] ?? list[0]
      setModels(list)
      try { localStorage.setItem(MODELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
      onChange({ ...settings, apiKey: key.trim(), model: pick })
      setMsg({ ok: true, text: `Connected. ${list.length} models available.` })
    } catch (e) {
      setMsg({ ok: false, text: e instanceof Error ? e.message : 'Could not connect' })
    } finally { setBusy(false) }
  }

  const own = !serverMode || !!settings.useOwnKey
  const connected = !!settings.apiKey && !!settings.model

  return (
    <>
      <header className="page-head"><div className="head-left"><button className="icon-btn" onClick={onBack} aria-label="Back"><Icon name="back" /></button><h1>Settings</h1></div></header>

      {serverMode && (
        <section className="card">
          <div className="row-top"><strong>Card reading</strong><span className="status ok">Ready</span></div>
          <p className="hint" style={{ margin: 0 }}>Cards are read by the CardPulse service. There is nothing to set up. Photos are sent to it only when you scan, and are not stored there.</p>
          <label className="check">
            <input type="checkbox" checked={!!settings.useOwnKey} onChange={(e) => onChange({ ...settings, useOwnKey: e.target.checked })} />
            Developer: use my own Gemini key instead
          </label>
        </section>
      )}

      {own && (
        <>
      <h3 className="group">Gemini key</h3>
      <section className="card">
        <div className="row-top">
          <strong>API key</strong>
          <span className={`status${connected ? ' ok' : ''}`}>{connected ? 'Connected' : 'Not connected'}</span>
        </div>
        <label>
          <span className="sr">Gemini API key</span>
          <input type="password" aria-label="Gemini API key" autoComplete="off" placeholder="Paste your key (starts with AIza)" value={key} onChange={(e) => setKey(e.target.value)} />
        </label>
        <p className="hint">
          Get a free key at <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
          It stays on this device and is sent only to Google. Card photos are sent to Gemini to be read; on the free tier Google may use them to improve its products.
        </p>
        <button className="primary wide" onClick={connect} disabled={!key.trim() || busy}>{busy ? 'Checking…' : 'Save and connect'}</button>
        {msg && <p className={`inline-msg${msg.ok ? ' ok' : ' bad'}`}>{msg.text}</p>}
        {models.length > 0 && (
          <label>
            <span>Model</span>
            <Picker className="pick wide" title="Model" value={settings.model} onChange={(v) => onChange({ ...settings, model: v })} options={models.map((m) => ({ value: m, label: m }))} />
          </label>
        )}
      </section>

        </>
      )}

      <h3 className="group">Caller ID</h3>
      <section className="card">
        <p className="hint" style={{ marginTop: 0 }}>Your phone's call screen shows only a contact's <b>name</b>, not their company. Choose how CardPulse names people when you save them to your phone.</p>
        <div className="radio-list" role="radiogroup" aria-label="How to name contacts on your phone">
          {NAME_FORMATS.map((f) => {
            const on = (settings.nameFormat ?? DEFAULT_NAME_FORMAT) === f.id
            return (
              <button key={f.id} role="radio" aria-checked={on} className={`radio${on ? ' on' : ''}`} onClick={() => onChange({ ...settings, nameFormat: f.id as NameFormat })}>
                <span className="dot" /><span className="grow"><strong>{f.label}</strong><small>{f.example('Abhishek Jain', 'Vivacity Woven Sack')}</small></span>
              </button>
            )
          })}
        </div>
        <div className="call-preview" aria-hidden="true">
          <span className="call-ico"><Icon name="phone" size={18} /></span>
          <div><small>Incoming call</small><strong>{displayName({ name: 'Abhishek Jain', company: 'Vivacity Woven Sack' }, settings.nameFormat ?? DEFAULT_NAME_FORMAT)}</strong></div>
        </div>
        <div className="soon-row"><Icon name="spark" size={18} /><span className="grow"><strong>Pop-up on incoming calls</strong><small>Company, where you met and your notes, over the call screen.</small></span><span className="status">Android app</span></div>
        <div className="soon-row"><Icon name="building" size={18} /><span className="grow"><strong>Company label on iPhone</strong><small>Shown by iOS on the incoming call.</small></span><span className="status">iPhone app</span></div>
      </section>

      <h3 className="group">Appearance</h3>
      <section className="card">
        <label>
          <span>Theme</span>
          <Picker className="pick wide" title="Theme" value={settings.theme ?? 'system'} onChange={(v) => onChange({ ...settings, theme: v as Theme })} options={[{ value: 'system', label: 'Match my phone' }, { value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }]} />
        </label>
        <div className="accent-pick" role="radiogroup" aria-label="Accent colour">
          <span className="accent-label">Accent colour <b>{accentById(settings.accent).name}</b></span>
          <div className="accent-row">
            {ACCENTS.map((a) => (
              <button key={a.id} role="radio" aria-checked={accentById(settings.accent).id === a.id} aria-label={`${a.name}, ${a.suits}`} title={`${a.name}: ${a.suits}`}
                className="accent-sw" style={{ ['--sw' as string]: a.hex, ['--sw-l' as string]: a.lite }} onClick={() => onChange({ ...settings, accent: a.id })} />
            ))}
          </div>
        </div>
      </section>

      <h3 className="group">Photos</h3>
      <section className="card">
        <label>
          <span>After a card is read, keep its photo</span>
          <Picker className="pick wide" title="Keep photos" value={settings.keepPhotos} onChange={(v) => onChange({ ...settings, keepPhotos: v as Settings['keepPhotos'] })} options={[{ value: 'full', label: 'Full photo' }, { value: 'thumb', label: 'Small thumbnail only' }, { value: 'none', label: "Don't keep photos" }]} />
        </label>
        <p className="hint">Saves storage at exhibitions. Without the full photo a card can't be re-read or have a back side added.</p>
      </section>

      <h3 className="group">App</h3>
      <section className="card flush">
        {install.mode && (
          <button className="menu-item" onClick={install.mode === 'native' ? install.install : undefined}>
            <Icon name="download" /><span className="grow"><strong>Install app</strong><small>{install.mode === 'ios' ? 'Tap Share, then Add to Home Screen' : 'Add CardPulse to your home screen'}</small></span>
          </button>
        )}
        <button className="menu-item" onClick={onOpenInsights}>
          <Icon name="spark" /><span className="grow"><strong>Insights</strong><small>Follow-ups, companies and priorities</small></span><Icon name="back" size={16} />
        </button>
        <button className="menu-item" onClick={onOpenAccuracy}>
          <Icon name="chart" /><span className="grow"><strong>Accuracy</strong><small>How well cards are read</small></span><Icon name="back" size={16} />
        </button>
        <a className="menu-item" href={`${import.meta.env.BASE_URL}privacy.html`} target="_blank" rel="noreferrer">
          <Icon name="globe" /><span className="grow"><strong>Privacy policy</strong><small>How your data is handled</small></span><Icon name="back" size={16} />
        </a>
      </section>

      <h3 className="group">Your data</h3>
      <section className="card">
        <p className="hint">Contacts and photos are stored only on this phone. Clearing the app's data removes them, so keep a backup.</p>
        <button className="cta small wide" disabled={busyData} onClick={() => void runData(onBackup)}><Icon name="download" size={18} /> Back up all contacts</button>
        <p className="hint">{last ? `Last backup: ${new Date(last).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })}` : 'No backup yet.'} Saves a file with every contact and card photo. Send it to Drive or WhatsApp to keep it safe.</p>
        <label className="outline wide restore">
          <Icon name="upload" size={18} /> Restore from a backup
          <input type="file" accept=".zip,application/zip" hidden disabled={busyData} onChange={(e) => { const f = e.target.files?.[0]; e.target.value = ''; if (f) void runData(() => onRestore(f)) }} />
        </label>
        {dataMsg && <p className={dataMsg.ok ? 'hint ok' : 'hint bad'} role="status">{dataMsg.text}</p>}
        <button className="danger wide" onClick={() => confirm('Delete ALL cards and contacts from this device? This cannot be undone.') && onWipe()}>Delete all data</button>
      </section>

      <h3 className="group">Help</h3>
      <section className="card">
        <label className="fb-label" htmlFor="fb">Something wrong, or an idea?</label>
        <textarea id="fb" rows={3} value={fbText} onChange={(e) => setFbText(e.target.value)} placeholder="Tell us what happened" />
        <label className="check"><input type="checkbox" checked={fbDiag} onChange={(e) => setFbDiag(e.target.checked)} /> Include app details to help us fix it (no contacts, photos or keys)</label>
        <button className="cta small wide" disabled={!fbText.trim()} onClick={() => void send()}>Send feedback</button>
        {fbMsg && <p className={fbMsg.ok ? 'hint ok' : 'hint bad'} role="status">{fbMsg.text}</p>}
      </section>

      <details className="debug">
        <summary>Diagnostics</summary>
        <button className="link" onClick={clearLog}>clear</button>
        <pre>{lines.join('\n') || '(empty)'}</pre>
      </details>

      <footer className="about"><Logo size={24} /><span>CardPulse v{__APP_VERSION__}</span></footer>
    </>
  )
}
