// Run: node scripts/brief-lab.mjs [--clipboard]
// Compares Pulse Brief settings on a few real contacts: thinking level and how many Google searches the prompt allows.
// Prints tokens, searches, time and an estimated cost per run, and writes the briefs to compare quality side by side.
// Needs the Gemini key that Pulse Brief uses (the paid "Business card" project), read in this order: GEMINI_KEY, the Mac
// Keychain item "cardpulse-gemini-brief" (save it once: security add-generic-password -s cardpulse-gemini-brief -a brief -w),
// --clipboard, or pasted when asked (typing hidden). Never shipped in the app.
import { writeFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { briefPrompt, parseBriefResponse } from '../shared/brief-core.ts'
import { geminiKey } from './geminikey.mjs'
import { nudge, usageLine } from '../server/worker.ts'

// --model gemini-3.8-flash: another model; $ per million tokens, paid tier, checked 2026-10-09 (thinking is billed as output)
const PRICES = { 'gemini-3.5-flash': { in: 1.5, out: 9 }, 'gemini-3.6-flash': { in: 0.75, out: 3.75 }, 'gemini-3.8-flash': { in: 0.75, out: 3.75 }, 'gemini-3.7-flash': { in: 0.75, out: 3.75 }, 'gemini-3.6-flash': { in: 0.75, out: 3.75 } }
const MODEL = (() => { const i = process.argv.indexOf('--model'); return i > 0 ? process.argv[i + 1] : 'gemini-3.6-flash' })()
const USD_INR = 96
const PRICE = PRICES[MODEL] ?? PRICES['gemini-3.5-flash']
const SEARCH_USD = 14 / 1000            // per search after the free 5,000 a month

const CONTACTS = [
  { name: 'Bhavesh Parikh', title: '', company: 'Vrajesh Trading Corporation', address: 'Surat, Gujarat', website: '', domains: [], gstin: '' },
  { name: 'Chirag Patel', title: 'Managing Director', company: 'Dharmbhakti Polytex Pvt. Ltd.', address: 'Gujarat', website: '', domains: [], gstin: '' },
  { name: 'Anil Pagalia', title: '', company: 'Surat Wovensacks Industries LLP', address: 'Surat, Gujarat', website: '', domains: [], gstin: '' },
  { name: 'Sandip Parikh', title: 'Managing Director', company: 'Tulsi Synthetics Pvt. Ltd.', address: 'Gujarat', website: '', domains: [], gstin: '' },
]

/** At most two searches: one for the company, one for the person (LinkedIn first). Replaces the "always search" lines. */
const twoSearches = (p) => p
  .replace(/Always run Google Search before you answer[^\n]*\n/, 'Run Google Search before you answer, at most TWO searches in total; never answer from memory alone.\n')
  .replace(/Search for the company \(by name[^\n]*\n/, 'Search 1, the company: its name with the city (add the website or GSTIN when given).\n')
  .replace(/Search for this person using[^\n]*\n/, 'Search 2, the person: "<name>" "<company>" (LinkedIn results first). Do not run a third search.\n')

const VARIANTS = [
  { id: 'now', label: 'today: low thinking, 3 searches', thinking: 'low', prompt: (i) => briefPrompt(i, true) },
  { id: 'min', label: 'minimal thinking, 3 searches', thinking: 'minimal', prompt: (i) => briefPrompt(i, true) },
  { id: 'min2', label: 'minimal thinking, 2 searches', thinking: 'minimal', prompt: (i) => twoSearches(briefPrompt(i, true)) },
  { id: 'low2', label: 'low thinking, 2 searches', thinking: 'low', prompt: (i) => twoSearches(briefPrompt(i, true)) },
]

const K = await geminiKey('Gemini key for Pulse Brief')

// --only "<name>" --variants min,now --repeat 3: a narrower run
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const only = arg('--only'), pick = arg('--variants')?.split(','), repeat = Number(arg('--repeat') ?? 1)
const contacts = CONTACTS.filter((c) => !only || c.name === only)
const variants = VARIANTS.filter((v) => !pick || pick.includes(v.id)).flatMap((v) => Array.from({ length: repeat }, () => v))
const rows = [], briefs = []
for (const c of contacts) {
  for (const v of variants) {
    const body = { contents: [{ role: 'user', parts: [{ text: v.prompt(c) }] }], tools: [{ google_search: {} }], generationConfig: { thinkingConfig: { thinkingLevel: v.thinking } } }
    const t0 = Date.now()
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': K }, body: JSON.stringify(body) })
    const ms = Date.now() - t0
    let raw = await res.json().catch(() => ({}))
    // --nudge: as the Worker does, a brief written without a search is told so and asked again in the same conversation
    let nudged = false
    if (res.ok && process.argv.includes('--nudge') && !(raw.candidates?.[0]?.groundingMetadata?.webSearchQueries?.length)) {
      const said = raw.candidates?.[0]?.content ?? { parts: [{ text: '' }] }
      const again = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${MODEL}:generateContent`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': K }, body: JSON.stringify({ ...body, contents: [...body.contents, { ...said, role: 'model' }, { role: 'user', parts: [{ text: nudge(false) }] }] }) })
      if (again.ok) { raw = await again.json(); nudged = true }
    }
    if (!res.ok) { rows.push({ contact: c.name, variant: v.id, error: `${res.status} ${raw?.error?.message?.slice(0, 120)}` }); console.log(c.name, v.id, 'ERROR', res.status, raw?.error?.message?.slice(0, 160)); continue }
    const u = raw.usageMetadata ?? {}
    const tin = (u.promptTokenCount ?? 0) + (u.toolUsePromptTokenCount ?? 0), tout = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
    const searches = raw.candidates?.[0]?.groundingMetadata?.webSearchQueries ?? []
    const model = (tin * PRICE.in + tout * PRICE.out) / 1e6 * USD_INR
    const withSearch = model + searches.length * SEARCH_USD * USD_INR
    let parsed = null
    try { parsed = parseBriefResponse(raw) } catch (e) { parsed = { error: String(e?.message ?? e) } }
    rows.push({ contact: c.name, variant: v.id, secs: +(ms / 1000).toFixed(1), usage: usageLine(raw), searches: searches.length, inr_free: +model.toFixed(2), inr_paid: +withSearch.toFixed(2) })
    briefs.push({ contact: c.name, variant: v.label, queries: searches, person: parsed.person, company: parsed.company, sources: (parsed.sources ?? []).map((s) => s.title), error: parsed.error })
    console.log(`${c.name.padEnd(16)} ${v.id.padEnd(5)}${nudged ? '+n' : '  '} ${((Date.now() - t0) / 1000).toFixed(1).padStart(5)}s  ${usageLine(raw)}  ₹${model.toFixed(2)} (₹${withSearch.toFixed(2)} after free searches)`)
  }
}

console.log('\nAverage per brief:')
for (const v of VARIANTS.filter((x) => variants.includes(x))) {
  const r = rows.filter((x) => x.variant === v.id && !x.error)
  if (!r.length) { console.log(`  ${v.label}: no successful runs`); continue }
  const avg = (k) => (r.reduce((s, x) => s + x[k], 0) / r.length).toFixed(2)
  console.log(`  ${v.label.padEnd(32)} ${avg('secs')}s  searches ${avg('searches')}  ₹${avg('inr_free')} within free searches, ₹${avg('inr_paid')} after`)
}
const out = new URL(`../.superpowers/brief-lab-${MODEL}.json`, import.meta.url)
writeFileSync(out, JSON.stringify({ rows, briefs }, null, 2))
console.log(`\nBriefs for comparing quality: ${fileURLToPath(out)}`)
