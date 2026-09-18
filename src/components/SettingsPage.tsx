import { useEffect, useState } from 'react'
import { clearLog, readLog, subscribe } from '../lib/debug'
import Icon from './Icon'
import { DEFAULT_MODEL, listModels } from '../lib/gemini'
import type { Settings } from '../lib/db'

const MODELS_KEY = 'cardpulse.models'

export default function SettingsPage({ settings, onChange, onWipe, onOpenAccuracy }: {
  settings: Settings
  onChange: (s: Settings) => void
  onWipe: () => void
  onOpenAccuracy: () => void
}) {
  const [lines, setLines] = useState(readLog)
  useEffect(() => subscribe(() => setLines(readLog())), [])
  const [key, setKey] = useState(settings.apiKey)
  const [models, setModels] = useState<string[]>(() => {
    try { const m = JSON.parse(localStorage.getItem(MODELS_KEY) ?? '[]') as string[]; if (m.length) return m } catch { /* ignore */ }
    return settings.model ? [settings.model] : []
  })
  const [msg, setMsg] = useState('')
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
    setBusy(true); setMsg('')
    try {
      const list = await listModels(key.trim())
      const flash = list.filter((m) => /flash/.test(m) && !/(image|tts|live|audio|thinking|lite|preview|exp)/.test(m))
      const pick = list.includes(settings.model) ? settings.model
        : list.includes(DEFAULT_MODEL) ? DEFAULT_MODEL
        : flash[flash.length - 1] ?? list[0]
      setModels(list)
      try { localStorage.setItem(MODELS_KEY, JSON.stringify(list)) } catch { /* ignore */ }
      onChange({ ...settings, apiKey: key.trim(), model: pick })
      setMsg(`Connected — ${list.length} models available.`)
    } catch (e) {
      setMsg(e instanceof Error ? e.message : 'Could not connect')
    } finally { setBusy(false) }
  }

  return (
    <>
      <h1>Settings</h1>
      <button className="menu-row" onClick={onOpenAccuracy}><Icon name="chart" /><span className="grow"><b>Accuracy lab</b><small>Measure how well cards are read</small></span><Icon name="back" size={16} /></button>
      <label>
        <span>Gemini API key</span>
        <input type="password" autoComplete="off" placeholder="AIza…" value={key} onChange={(e) => setKey(e.target.value)} />
      </label>
      <p className="hint">
        Free key from <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">aistudio.google.com/apikey</a>.
        It is stored only in this browser and sent only to Google. Card images are sent to Gemini for reading —
        on the free tier Google may use them to improve its products, so test with sample cards, not sensitive ones.
      </p>
      <button className="primary" onClick={connect} disabled={!key.trim() || busy}>{busy ? 'Checking…' : 'Save & connect'}</button>
      {msg && <p className="note">{msg}</p>}

      {models.length > 0 && (
        <label>
          <span>Model</span>
          <select value={settings.model} onChange={(e) => onChange({ ...settings, model: e.target.value })}>
            {models.map((m) => <option key={m}>{m}</option>)}
          </select>
        </label>
      )}

      <label>
        <span>After a card is read, keep its photo…</span>
        <select value={settings.keepPhotos} onChange={(e) => onChange({ ...settings, keepPhotos: e.target.value as Settings['keepPhotos'] })}>
          <option value="full">Full photo (best for accuracy checks)</option>
          <option value="thumb">Small thumbnail only</option>
          <option value="none">Don't keep photos</option>
        </select>
      </label>
      <p className="hint">Saves phone storage at exhibitions. Without the full photo a card can't be re-read or have a back side added.</p>

      <h3>Data</h3>
      <p className="hint">Cards and images live only in this browser (IndexedDB).</p>
      <button className="bad" onClick={() => confirm('Delete ALL cards from this browser?') && onWipe()}>Delete all cards</button>

      <details className="debug">
        <summary>Debug log</summary>
        <button className="link" onClick={clearLog}>clear</button>
        <pre>{lines.join('\n') || '(empty)'}</pre>
      </details>
    </>
  )
}
