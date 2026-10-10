// Run: npm run read:lab [-- --models gemini-2.5-flash-lite,gemini-3.5-flash-lite --limit 20 --clipboard]
// Reads the cards fetched by read-fetch (.lab/cards/) with each model, using the app's own prompt and settings, and scores
// every answer field by field against the user's corrections, the same way the app's Accuracy page does (src/lib/score.ts).
// Prints accuracy, the people count, speed and cost per card for each model, and writes every answer to .lab/ to compare.
// Needs the paid Gemini key (scripts/geminikey.mjs). Never shipped in the app.
import { readdirSync, readFileSync, existsSync, writeFileSync } from 'node:fs'
import { buildRequest, parseResponse } from '../shared/extract-core.ts'
import { accuracy, overall, scoreCard, sumTallies } from '../src/lib/score.ts'
import { ALL_FIELDS } from '../src/lib/types.ts'
import { fileURLToPath } from 'node:url'
import { geminiKey } from './geminikey.mjs'

const LAB = fileURLToPath(new URL('../.lab/', import.meta.url))
const USD_INR = 96
/** $ per million tokens, paid tier, checked 2026-10-09 (thinking is billed as output). */
const PRICE = {
  'gemini-3.5-flash-lite': { in: 0.30, out: 2.50 },
  'gemini-3.1-flash-lite': { in: 0.25, out: 1.50 },
  'gemini-2.5-flash-lite': { in: 0.10, out: 0.40 },
  'gemini-2.5-flash': { in: 0.30, out: 2.50 },
  'gemini-3.5-flash': { in: 1.50, out: 9.00 },
  'gemma-4-31b-it': { in: 0, out: 0 },        // free on the API (free tier only)
  'gemma-4-26b-a4b-it': { in: 0, out: 0 },
}
const arg = (k) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : undefined }
const MODELS = (arg('--models') ?? 'gemini-3.5-flash-lite,gemini-2.5-flash-lite,gemini-3.1-flash-lite').split(',')
const LIMIT = Number(arg('--limit') ?? Infinity)
const PARALLEL = 3
// --media low|medium|high: Gemini 3's photo detail (fewer image tokens at lower detail), to test the cost against accuracy
const MEDIA = arg('--media')
const withMedia = (req) => (MEDIA ? { ...req, generationConfig: { ...req.generationConfig, mediaResolution: `MEDIA_RESOLUTION_${MEDIA.toUpperCase()}` } } : req)

if (!existsSync(`${LAB}cards`)) { console.error('No cards yet. Run: npm run read:fetch'); process.exit(1) }
const cards = readdirSync(`${LAB}cards`).filter((d) => existsSync(`${LAB}cards/${d}/card.json`)).slice(0, LIMIT)
  .map((d) => {
    const meta = JSON.parse(readFileSync(`${LAB}cards/${d}/card.json`, 'utf8'))
    const images = ['front', 'back'].filter((s) => existsSync(`${LAB}cards/${d}/${s}.jpg`))
      .map((s) => ({ mime: 'image/jpeg', data: readFileSync(`${LAB}cards/${d}/${s}.jpg`).toString('base64') }))
    return { ...meta, images }
  })
if (!cards.length) { console.error('No cards in .lab/cards/. Run: npm run read:fetch'); process.exit(1) }
const K = await geminiKey('Paid Gemini key (the Pulse Brief project)')

async function read(model, card) {
  const t0 = Date.now()
  for (let attempt = 0; attempt < 3; attempt++) {
    const res = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': K }, body: JSON.stringify(withMedia(buildRequest(card.images, 'sides'))),
    }).catch(() => null)
    if (res?.status === 429 || (res && res.status >= 500)) { await new Promise((r) => setTimeout(r, 3000 * (attempt + 1))); continue }
    const raw = await res?.json().catch(() => ({})) ?? {}
    const ms = Date.now() - t0
    if (!res?.ok) return { error: `${res?.status ?? 'network'} ${raw?.error?.message?.slice(0, 120) ?? ''}`, ms }
    const u = raw.usageMetadata ?? {}
    const tokensIn = u.promptTokenCount ?? 0, tokensOut = (u.candidatesTokenCount ?? 0) + (u.thoughtsTokenCount ?? 0)
    try { return { contacts: parseResponse(raw).contacts, ms, tokensIn, tokensOut } } catch (e) { return { error: e.message, ms, tokensIn, tokensOut } }
  }
  return { error: 'busy after 3 tries', ms: Date.now() - t0 }
}

const results = {}
for (const model of MODELS) {
  results[model] = []
  let next = 0
  await Promise.all(Array.from({ length: PARALLEL }, async () => {
    while (next < cards.length) {
      const card = cards[next++]
      const r = await read(model, card)
      const score = r.contacts ? scoreCard({ extracted: r.contacts, corrected: card.corrected }) : null
      results[model].push({ id: card.id, opened: card.opened, firstReadBy: card.model, languages: card.languages, ...r, score })
      process.stdout.write('.')
    }
  }))
  process.stdout.write(` ${model}\n`)
}

const pct = (x) => (x == null ? '  –  ' : `${(x * 100).toFixed(1).padStart(5)}%`)
const median = (xs) => { const s = [...xs].sort((a, b) => a - b); return s.length ? s[Math.floor(s.length / 2)] : 0 }
const nonEnglish = (r) => (r.languages ?? []).some((l) => !/^english$/i.test(l))
const opened = cards.filter((c) => c.opened).length
console.log(`\n${cards.length} cards (${opened} opened by you: their corrections are checked truth; the rest still carry the`)
console.log('reading of the model that first read them, which gives that model a head start there).\n')
console.log('model                    all     opened  non-Eng  people   median  ₹/card  errors')
for (const model of MODELS) {
  const rs = results[model], ok = rs.filter((r) => r.score)
  const acc = (xs) => overall(sumTallies(xs.map((r) => r.score)))
  const cost = (r) => ((r.tokensIn ?? 0) * PRICE[model]?.in + (r.tokensOut ?? 0) * PRICE[model]?.out) / 1e6 * USD_INR
  const people = ok.length ? ok.filter((r) => r.score.contactCountOk).length / ok.length : null
  const rupees = PRICE[model] ? (rs.reduce((a, r) => a + cost(r), 0) / rs.length).toFixed(3) : '  ?  '
  console.log(`${model.padEnd(24)} ${pct(acc(ok))}  ${pct(acc(ok.filter((r) => r.opened)))}  ${pct(acc(ok.filter(nonEnglish)))}  ${pct(people)}  ${(median(rs.map((r) => r.ms)) / 1000).toFixed(1).padStart(5)}s  ${String(rupees).padStart(6)}  ${rs.length - ok.length}`)
}
console.log('\nby field (opened cards; all cards when none are opened)')
console.log(`${'field'.padEnd(10)}${MODELS.map((m) => m.replace('gemini-', '').padStart(18)).join('')}`)
for (const f of ALL_FIELDS) {
  const cells = MODELS.map((m) => {
    const ok = results[m].filter((r) => r.score), base = ok.some((r) => r.opened) ? ok.filter((r) => r.opened) : ok
    return pct(accuracy(sumTallies(base.map((r) => r.score))[f])).padStart(18)
  })
  console.log(`${f.padEnd(10)}${cells.join('')}`)
}
const file = `${LAB}read-lab-${new Date().toISOString().slice(0, 16).replace(/[:T]/g, '-')}.json`
writeFileSync(file, JSON.stringify({ models: MODELS, cards: cards.map((c) => ({ id: c.id, opened: c.opened, corrected: c.corrected })), results }, null, 2))
console.log(`\nEvery answer is in ${file.replace(LAB, '.lab/')}`)
