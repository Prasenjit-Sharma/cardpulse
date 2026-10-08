// Run: node --test server/test
import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { checkRate, rateHit, rateWait, usageLine } from '../worker.ts'

const GOOD = 'https://prasenjit-sharma.github.io'
const png = Buffer.from('fake-image-bytes').toString('base64')
const geminiOk = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: ['English'], notes: '', contacts: [{ name: ' Asha Rao ', title: 'CEO', company: 'Acme', phones: ['+91 98765 43210'], emails: ['ASHA@ACME.IN'], website: '', address: '', gstin: 'abc', social: [] }] }) }] } }], usageMetadata: { promptTokenCount: 10, candidatesTokenCount: 5 } }

function env(over = {}) { return { GEMINI_API_KEY: 'secret-key', ALLOWED_ORIGINS: GOOD, ...over } }
function post(body, headers = {}) {
  return new Request('https://api.test/v1/extract', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: GOOD, 'cf-connecting-ip': `1.1.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) })
}
function mockUpstream(fn) {
  const real = globalThis.fetch
  const calls = []
  globalThis.fetch = async (url, init) => { calls.push({ url: String(url), init }); return fn(url, init) }
  return { calls, restore: () => { globalThis.fetch = real } }
}

test('happy path: returns cleaned contacts, sends key upstream only, never echoes it', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(geminiOk)))
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env())
    assert.equal(res.status, 200)
    assert.equal(res.headers.get('access-control-allow-origin'), GOOD)
    const body = await res.json()
    assert.equal(body.contacts[0].name, 'Asha Rao')
    assert.equal(body.contacts[0].emails[0], 'asha@acme.in')
    assert.equal(body.contacts[0].gstin, 'ABC')
    assert.equal(body.tokensIn, 10)
    assert.equal(JSON.stringify(body).includes('secret-key'), false)
    assert.equal(m.calls[0].init.headers['x-goog-api-key'], 'secret-key')
    assert.match(m.calls[0].url, /gemini-2\.5-flash:generateContent/)
    const sent = JSON.parse(m.calls[0].init.body)
    assert.ok(sent.contents[0].parts[0].text.includes('You extract contact details'), 'prompt is added server-side')
  } finally { m.restore() }
})

test('front + back are labelled and both forwarded', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(geminiOk)))
  try {
    await worker.fetch(post({ images: [{ mime: 'image/jpeg', data: png }, { mime: 'image/jpeg', data: png }] }), env())
    const parts = JSON.parse(m.calls[0].init.body).contents[0].parts
    assert.equal(parts.filter((p) => p.inline_data).length, 2)
    assert.ok(parts.some((p) => p.text?.includes('BACK')))
  } finally { m.restore() }
})

test('rejects unknown origins (no CORS header, no upstream call)', async () => {
  const m = mockUpstream(() => new Response('{}'))
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }, { Origin: 'https://evil.example' }), env())
    assert.equal(res.status, 403)
    assert.equal(res.headers.get('access-control-allow-origin'), null)
    assert.equal(m.calls.length, 0)
    const noOrigin = new Request('https://api.test/v1/extract', { method: 'POST', body: '{}' })
    assert.equal((await worker.fetch(noOrigin, env())).status, 403)
  } finally { m.restore() }
})

test('preflight: allowed origin ok, others refused', async () => {
  const ok = await worker.fetch(new Request('https://api.test/v1/extract', { method: 'OPTIONS', headers: { Origin: GOOD } }), env())
  assert.equal(ok.status, 204)
  assert.equal(ok.headers.get('access-control-allow-origin'), GOOD)
  const bad = await worker.fetch(new Request('https://api.test/v1/extract', { method: 'OPTIONS', headers: { Origin: 'https://x.example' } }), env())
  assert.equal(bad.status, 403)
})

test('LAN origins only work when ALLOW_LAN=1', async () => {
  const lan = 'https://192.168.1.7:5173'
  const m = mockUpstream(() => new Response(JSON.stringify(geminiOk)))
  try {
    assert.equal((await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }, { Origin: lan }), env())).status, 403)
    assert.equal((await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }, { Origin: lan }), env({ ALLOW_LAN: '1' }))).status, 200)
  } finally { m.restore() }
})

test('validates images: count, type, encoding, size', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(geminiOk)))
  try {
    for (const images of [[], [{ mime: 'image/png', data: png }, { mime: 'image/png', data: png }, { mime: 'image/png', data: png }], [{ mime: 'application/pdf', data: png }], [{ mime: 'image/png', data: 'not base64!!' }], [{ mime: 'image/png', data: 'A'.repeat(8_000_001) }], 'nope']) {
      const res = await worker.fetch(post({ images }), env())
      assert.equal(res.status, 400, JSON.stringify(images).slice(0, 60))
    }
    assert.equal(m.calls.length, 0)
    const badJson = new Request('https://api.test/v1/extract', { method: 'POST', headers: { Origin: GOOD, 'cf-connecting-ip': '9.9.9.9' }, body: '{oops' })
    assert.equal((await worker.fetch(badJson, env())).status, 400)
  } finally { m.restore() }
})

test('upstream problems are hidden from the client', async () => {
  const cases = [[429, 429, 'busy'], [400, 502, 'upstream_error'], [500, 502, 'upstream_error'], [403, 502, 'upstream_error']]
  for (const [up, expected, code] of cases) {
    const m = mockUpstream(() => new Response(JSON.stringify({ error: { message: 'API key not valid: secret-key' } }), { status: up }))
    try {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env())
      assert.equal(res.status, expected)
      const body = await res.json()
      assert.equal(body.error.code, code)
      assert.equal(JSON.stringify(body).includes('secret-key'), false)
    } finally { m.restore() }
  }
})

test('garbage or empty model output gives a friendly 502', async () => {
  for (const payload of [{ candidates: [] }, { candidates: [{ content: { parts: [{ text: 'not json' }] } }] }]) {
    const m = mockUpstream(() => new Response(JSON.stringify(payload)))
    try {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env())
      assert.equal(res.status, 502)
      assert.equal((await res.json()).error.code, 'unreadable')
    } finally { m.restore() }
  }
})

test('unconfigured server says so without crashing', async () => {
  const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env({ GEMINI_API_KEY: '' }))
  assert.equal(res.status, 500)
})

test('rate limit: 30 per window per IP, then 429 with Retry-After', () => {
  const ip = 'rate-test-ip', t = 1_000_000
  for (let i = 0; i < 30; i++) assert.equal(checkRate(ip, t + i), 0)
  assert.ok(checkRate(ip, t + 100) > 0)
  assert.equal(checkRate(ip, t + 11 * 60_000), 0, 'window slides')
  assert.equal(checkRate('someone-else', t), 0, 'other IPs unaffected')
})

test('routing: health, 404, wrong method', async () => {
  assert.equal((await worker.fetch(new Request('https://api.test/health'), env())).status, 200)
  assert.equal((await worker.fetch(new Request('https://api.test/nope', { method: 'POST' }), env())).status, 404)
  assert.equal((await worker.fetch(new Request('https://api.test/v1/extract', { method: 'GET' }), env())).status, 404)
})

// ---- batch layout: several photos, ONE Gemini call ----
const batchOk = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: ['English'], notes: '', contacts: [
  { name: 'Asha', title: '', company: 'A', phones: [], emails: [], website: '', address: '', gstin: '', social: [], image: 1 },
  { name: 'Ravi', title: '', company: 'B', phones: [], emails: [], website: '', address: '', gstin: '', social: [], image: 3 },
  { name: 'Lost', title: '', company: 'C', phones: [], emails: [], website: '', address: '', gstin: '', social: [], image: 0 },
  { name: 'Odd', title: '', company: 'D', phones: [], emails: [], website: '', address: '', gstin: '', social: [] },
] }) }] } }], usageMetadata: { promptTokenCount: 900, candidatesTokenCount: 120 } }
const img = { mime: 'image/jpeg', data: png }

test('batch: 6 photos go upstream in ONE request, labelled by number, with batch (not front/back) instructions', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(batchOk)))
  try {
    const res = await worker.fetch(post({ layout: 'batch', images: Array(6).fill(img) }), env())
    assert.equal(res.status, 200)
    assert.equal(m.calls.length, 1, 'exactly one upstream call for six photos')
    const sent = JSON.parse(m.calls[0].init.body)
    const parts = sent.contents[0].parts
    assert.equal(parts.filter((p) => p.inline_data).length, 6)
    const texts = parts.filter((p) => p.text).map((p) => p.text)
    assert.ok(texts.includes('Photo 1 of 6:') && texts.includes('Photo 6 of 6:'))
    assert.ok(!texts.some((t) => /FRONT of the card|BACK of the card/.test(t)), 'no front/back labels in a batch')
    assert.match(texts[0], /BATCH: 6 photos are given/)
    assert.ok(!/are the FRONT and BACK of the SAME card/.test(texts[0]), 'the front/back rule is replaced, not kept')
    assert.ok(sent.generationConfig.responseSchema.properties.contacts.items.properties.image, 'schema asks which photo each person came from')
  } finally { m.restore() }
})

test('batch: the photo number of each person comes back; invalid or missing numbers are left undefined', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(batchOk)))
  try {
    const body = await (await worker.fetch(post({ layout: 'batch', images: Array(3).fill(img) }), env())).json()
    assert.deepEqual(body.contacts.map((c) => [c.name, c.image]), [['Asha', 1], ['Ravi', 3], ['Lost', undefined], ['Odd', undefined]])
  } finally { m.restore() }
})

test('batch: limits. 7 photos, oversize, and unknown layouts are refused; sides still caps at 2', async () => {
  const m = mockUpstream(() => new Response(JSON.stringify(batchOk)))
  try {
    const bad = [
      { layout: 'batch', images: Array(7).fill(img) },
      { layout: 'batch', images: [] },
      { layout: 'batch', images: [{ mime: 'image/png', data: 'A'.repeat(4_400_001) }] },
      { layout: 'batch', images: Array(4).fill({ mime: 'image/png', data: 'A'.repeat(1_200_000) }) },
      { layout: 'sides', images: Array(3).fill(img) },
      { images: Array(3).fill(img) },
      { layout: 'everything', images: [img] },
    ]
    for (const b of bad) assert.equal((await worker.fetch(post(b), env())).status, 400, JSON.stringify(b).slice(0, 70))
    assert.equal(m.calls.length, 0, 'nothing reached Gemini')
    assert.equal((await worker.fetch(post({ layout: 'batch', images: [img] }), env())).status, 200, 'a batch of one is fine')
    assert.equal((await worker.fetch(post({ images: [img, img] }), env())).status, 200, 'old clients (no layout) still work as front + back')
  } finally { m.restore() }
})

test('batch: six photos at the size the app sends cost far less than the free plan\'s 10 ms CPU budget', () => {
  const data = Buffer.alloc(500_000, 7).toString('base64')   // 6 x ~500 KB, the per-photo budget for a batch of 6
  const body = JSON.stringify({ layout: 'batch', images: Array(6).fill({ mime: 'image/jpeg', data }) })
  // Best of five: a timing check must measure the code, not whatever else the machine is running (test files run in parallel).
  let ms = Infinity
  for (let n = 0; n < 5; n++) {
    const t = process.cpuUsage()
    const parsed = JSON.parse(body); parsed.images.every((i) => /^[A-Za-z0-9+/=]+$/.test(i.data)); JSON.stringify({ contents: [{ parts: parsed.images.map((i) => ({ inline_data: i })) }] })
    const c = process.cpuUsage(t); ms = Math.min(ms, (c.user + c.system) / 1000)
  }
  console.log(`  ~${ms.toFixed(1)} ms CPU for a six-photo batch (${(body.length / 1e6).toFixed(1)} MB)`)
  assert.ok(ms < 6, `${ms} ms`)
})

// ── per-account quota ──
const SUPA = { SUPABASE_URL: 'https://supa.test', SUPABASE_PUBLISHABLE_KEY: 'sb_publishable_x' }
const b64url = (o) => Buffer.from(JSON.stringify(o)).toString('base64url')
const token = (sub) => `${b64url({ alg: 'HS256' })}.${b64url({ sub, role: 'authenticated' })}.sig`
/** Supabase answers `consume` for the quota call; Gemini answers everything else. */
function mockBoth(consume) {
  return mockUpstream((url, init) => (String(url).startsWith('https://supa.test') ? consume(url, init) : new Response(JSON.stringify(geminiOk))))
}

test('quota: a signed-in read is counted with the user\'s own token, never a secret, and then read normally', async () => {
  const m = mockBoth(() => new Response(JSON.stringify([{ allowed: true, used: 3, day_limit: 300 }])))
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('user-1') }), env(SUPA))
    assert.equal(res.status, 200)
    const q = m.calls.find((c) => c.url.startsWith('https://supa.test'))
    assert.equal(q.url, 'https://supa.test/rest/v1/rpc/begin_read')
    assert.equal(q.init.headers.Authorization, `Bearer ${token('user-1')}`)
    assert.equal(q.init.headers.apikey, 'sb_publishable_x')
    assert.equal(m.calls.length, 3, 'a check, the read, and the charge for its one contact')
  } finally { m.restore() }
})

test('quota: over today\'s limit is a 429 daily_limit with a plain message, and Gemini is never called', async () => {
  const m = mockBoth(() => new Response(JSON.stringify([{ allowed: false, used: 300, day_limit: 300 }])))
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('user-2') }), env(SUPA))
    assert.equal(res.status, 429)
    const body = await res.json()
    assert.equal(body.error.code, 'daily_limit')
    assert.match(body.error.message, /today's limit of 300 scans/)
    assert.equal(m.calls.filter((c) => !c.url.startsWith('https://supa.test')).length, 0)
  } finally { m.restore() }
})

test('quota: Supabase down, a missing function or no config all fall back to the per-IP limit and still read', async () => {
  const cases = [
    [() => { throw new TypeError('fetch failed') }, SUPA],
    [() => new Response('{"message":"upstream"}', { status: 503 }), SUPA],
    [() => new Response('{"code":"PGRST202"}', { status: 404 }), SUPA],
    [() => new Response('not json'), SUPA],
    [() => { throw new Error('should not be called') }, {}],
  ]
  for (const [consume, extra] of cases) {
    const m = mockBoth(consume)
    try {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('user-3') }), env(extra))
      assert.equal(res.status, 200)
    } finally { m.restore() }
  }
})

test('quota: with no accounts configured (local development), signed-out reading still works and nothing is counted', async () => {
  const m = mockBoth(() => { throw new Error('should not be called') })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env())
    assert.equal(res.status, 200)
    assert.equal(m.calls.length, 1)
  } finally { m.restore() }
})

test('quota: the burst limit follows the account, not the IP', async () => {
  const m = mockBoth(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 300 }])))
  try {
    const sub = `burst-${Date.now()}`
    for (let i = 0; i < 30; i++) {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token(sub) }), env(SUPA))
      assert.equal(res.status, 200, `read ${i + 1}`)
    }
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token(sub) }), env(SUPA))
    assert.equal(res.status, 429, 'the 31st read from the same account is braked, even from a new IP')
    assert.equal((await res.json()).error.code, 'rate_limited')
  } finally { m.restore() }
})

test('quota: invalid images are refused before anything is counted', async () => {
  const m = mockBoth(() => { throw new Error('should not be called') })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/gif', data: png }], auth: token('user-4') }), env(SUPA))
    assert.equal(res.status, 400)
    assert.equal(m.calls.length, 0)
  } finally { m.restore() }
})

// ── Pulse Brief ──
const briefReq = (body, headers = {}) => new Request('https://api.test/v1/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: GOOD, 'cf-connecting-ip': `2.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) })
const who = { name: 'Abhishek Jain', company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Surat' }
const briefOk = { candidates: [{ content: { parts: [{ text: 'Sure. ' + JSON.stringify({ person: 'Director.', company: 'Makes sacks.', starters: ['Hi'], links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }, { kind: 'website', url: 'https://guess.example' }] }) }] },
  groundingMetadata: { groundingChunks: [{ web: { title: 'linkedin.com', uri: 'https://vertexaisearch.cloud.google.com/r/1' } }], searchEntryPoint: { renderedContent: '<style></style><div>chips</div>' } } }] }
function mockBrief(consume) {
  return mockUpstream((url, init) => (String(url).startsWith('https://supa.test') ? consume(url, init) : new Response(JSON.stringify(briefOk))))
}

test('brief: by default, no web search: the model writes from what it knows', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])))
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('b-0') }), env(SUPA))
    assert.equal(res.status, 200)
    const sent = JSON.parse(m.calls[1].init.body)
    assert.equal(sent.tools, undefined)
    assert.equal(sent.generationConfig.responseMimeType, 'application/json')
  } finally { m.restore() }
})
test('brief: BRIEF_API_KEY is used for briefs only; reading keeps GEMINI_API_KEY', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])))
  try {
    await worker.fetch(briefReq({ contact: who, auth: token('b-k') }), env({ ...SUPA, BRIEF_API_KEY: 'paid-key' }))
    assert.equal(m.calls[1].init.headers['x-goog-api-key'], 'paid-key')
  } finally { m.restore() }
  const r = mockUpstream(() => new Response(JSON.stringify(geminiOk)))
  try {
    await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env({ BRIEF_API_KEY: 'paid-key' }))
    assert.equal(r.calls[0].init.headers['x-goog-api-key'], 'secret-key')
  } finally { r.restore() }
})
test('brief: with BRIEF_SEARCH=1, checked with begin_brief, grounded with Google Search, links checked', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])))
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('b-1') }), env({ ...SUPA, BRIEF_SEARCH: '1' }))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.person, 'Director.')
    assert.deepEqual(body.links, [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }], 'the guessed site is dropped')
    assert.equal(body.suggestions, '<style></style><div>chips</div>')
    assert.equal(m.calls[0].url, 'https://supa.test/rest/v1/rpc/begin_brief')
    const sent = JSON.parse(m.calls[1].init.body)
    assert.deepEqual(sent.tools, [{ google_search: {} }])
    assert.ok(!JSON.stringify(sent).includes('secret-key'))
  } finally { m.restore() }
})
test('brief: no token is 401 sign_in, and nothing is called', async () => {
  const m = mockBrief(() => { throw new Error('no') })
  try {
    const res = await worker.fetch(briefReq({ contact: who }), env(SUPA))
    assert.equal(res.status, 401); assert.equal((await res.json()).error.code, 'sign_in'); assert.equal(m.calls.length, 0)
  } finally { m.restore() }
})
test('brief: over the limit is 429 daily_limit with the brief wording', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: false, used: 10, day_limit: 10 }])))
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('b-2') }), env(SUPA))
    assert.equal(res.status, 429)
    assert.match((await res.json()).error.message, /today's 10 fresh briefs/)
    assert.equal(m.calls.length, 1)
  } finally { m.restore() }
})
test('brief: a quota outage still makes the brief (per-IP brake only)', async () => {
  const m = mockBrief(() => { throw new TypeError('fetch failed') })
  try { assert.equal((await worker.fetch(briefReq({ contact: who, auth: token('b-3') }), env(SUPA))).status, 200) } finally { m.restore() }
})
test('brief: bad input is 400 before anything is counted; unusable output is 502 bad_output', async () => {
  const m = mockBrief(() => { throw new Error('no') })
  try {
    for (const contact of [undefined, {}, { name: 7 }, { name: '', company: '' }]) assert.equal((await worker.fetch(briefReq({ contact, auth: token('b-4') }), env(SUPA))).status, 400)
    assert.equal(m.calls.length, 0)
  } finally { m.restore() }
  const g = mockUpstream((url) => (String(url).startsWith('https://supa.test') ? new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])) : new Response(JSON.stringify({ candidates: [{ content: { parts: [{ text: 'no idea' }] } }] }))))
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('b-5') }), env(SUPA))
    assert.equal(res.status, 502); assert.equal((await res.json()).error.code, 'bad_output')
  } finally { g.restore() }
})
test('brief: unknown origin refused, and BRIEF_MODEL picks the model', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])))
  try {
    assert.equal((await worker.fetch(briefReq({ contact: who, auth: token('b-6') }, { Origin: 'https://evil.example' }), env(SUPA))).status, 403)
    await worker.fetch(briefReq({ contact: who, auth: token('b-7') }), env({ ...SUPA, BRIEF_MODEL: 'gemini-brief-x' }))
    assert.match(m.calls.find((c) => c.url.includes(':generateContent')).url, /gemini-brief-x:generateContent/)
  } finally { m.restore() }
})

test('the deployed allow-list lets the Android app (https://localhost) call the API', async () => {
  const toml = (await import('node:fs')).readFileSync(new URL('../wrangler.toml', import.meta.url), 'utf8')
  const allowed = /^ALLOWED_ORIGINS\s*=\s*"([^"]*)"/m.exec(toml)[1]
  const res = await worker.fetch(new Request('https://api.test/v1/extract', { method: 'OPTIONS', headers: { Origin: 'https://localhost', 'Access-Control-Request-Method': 'POST' } }), env({ ALLOWED_ORIGINS: allowed }))
  assert.equal(res.headers.get('access-control-allow-origin'), 'https://localhost')
})

test('usageLine: tokens in and out, thinking apart, and the searches a call ran; missing fields read as 0', () => {
  const raw = { usageMetadata: { promptTokenCount: 900, toolUsePromptTokenCount: 2100, candidatesTokenCount: 700, thoughtsTokenCount: 1200 }, candidates: [{ groundingMetadata: { webSearchQueries: ['Asha Rao Acme', 'Acme Pune'] } }] }
  assert.equal(usageLine(raw), 'in=3000 out=700 thinking=1200 searches=2')
  assert.equal(usageLine(geminiOk), 'in=10 out=5 thinking=0 searches=0')
  assert.equal(usageLine(null), 'in=0 out=0 thinking=0 searches=0')
})

// ── Pricing: sign-in, balances, charges ──
const BAL = { tier: 'free', periodEnd: '2026-11-01T00:00:00+05:30', cards: { month: { used: 2, allowance: 20 }, pass: null, pack: 0, left: 18 }, briefs: { month: { used: 0, allowance: 0 }, extra: 0, trial: 3, left: 3 } }
/** Supabase: begin_* answers `begin`, charge_* answers `charged`; Gemini answers everything else. */
function mockSupa({ begin = () => [{ allowed: true, reason: null, day_limit: 300, balance: BAL }], charged = () => ({ ...BAL, cards: { ...BAL.cards, left: 17 } }), gemini = geminiOk } = {}) {
  return mockUpstream((url, init) => {
    const u = String(url)
    if (u.includes('/rpc/begin_')) return new Response(JSON.stringify(begin(u, init)))
    if (u.includes('/rpc/charge_')) return new Response(JSON.stringify(charged(u, init)))
    return new Response(JSON.stringify(gemini))
  })
}

test('pricing: signed out is 401 sign_in when accounts are configured, and nothing is called', async () => {
  const m = mockSupa()
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env(SUPA))
    assert.equal(res.status, 401)
    assert.equal((await res.json()).error.code, 'sign_in')
    assert.equal(m.calls.length, 0)
  } finally { m.restore() }
})

test('pricing: a read is checked, then charged one card per contact, and the balance comes back', async () => {
  const two = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: [], notes: '', contacts: [{ name: 'A', phones: [], emails: [], social: [] }, { name: 'B', phones: [], emails: [], social: [] }] }) }] } }] }
  const m = mockSupa({ gemini: two })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('p-1') }), env(SUPA))
    assert.equal(res.status, 200)
    assert.equal((await res.json()).balance.cards.left, 17)
    const charge = m.calls.find((c) => c.url.endsWith('/rpc/charge_reads'))
    assert.deepEqual(JSON.parse(charge.init.body), { n: 2 })
    assert.equal(charge.init.headers.Authorization, `Bearer ${token('p-1')}`)
  } finally { m.restore() }
})

test('pricing: no cards left is 402 no_cards with the balance, and Gemini is never called', async () => {
  const m = mockSupa({ begin: () => [{ allowed: false, reason: 'no_cards', day_limit: 300, balance: { ...BAL, cards: { ...BAL.cards, left: 0 } } }] })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('p-2') }), env(SUPA))
    assert.equal(res.status, 402)
    const body = await res.json()
    assert.equal(body.error.code, 'no_cards'); assert.equal(body.balance.cards.left, 0)
    assert.equal(m.calls.filter((c) => !c.url.startsWith('https://supa.test')).length, 0)
  } finally { m.restore() }
})

test('pricing: an empty read or a failed read is never charged', async () => {
  const empty = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: [], notes: '', contacts: [] }) }] } }] }
  for (const gemini of [empty, { candidates: [] }]) {
    const m = mockSupa({ gemini })
    try {
      await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('p-3') }), env(SUPA))
      assert.equal(m.calls.filter((c) => c.url.includes('/rpc/charge_')).length, 0)
    } finally { m.restore() }
  }
})

test('pricing: Supabase down or 0005 missing still reads, uncharged, with balance null', async () => {
  for (const begin of [() => { throw new TypeError('fetch failed') }, () => ({ code: 'PGRST202' })]) {
    const m = mockSupa({ begin })
    try {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('p-4') }), env(SUPA))
      assert.equal(res.status, 200)
      assert.equal((await res.json()).balance, null)
      assert.equal(m.calls.filter((c) => c.url.includes('/rpc/charge_')).length, 0)
    } finally { m.restore() }
  }
})

test('pricing: a charge that fails still returns the read, with the balance from before', async () => {
  const m = mockSupa({ charged: () => { throw new TypeError('fetch failed') } })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token('p-7') }), env(SUPA))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.contacts.length, 1); assert.equal(body.balance.cards.left, 18)
  } finally { m.restore() }
})

test('pricing: briefs are checked with begin_brief, charged with charge_brief; pro_only and no_briefs are 402', async () => {
  let m = mockSupa({ gemini: briefOk, begin: () => [{ allowed: true, reason: null, day_limit: 10, balance: BAL }] })
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('p-5') }), env(SUPA))
    assert.equal(res.status, 200)
    assert.ok(m.calls.some((c) => c.url.endsWith('/rpc/begin_brief')))
    assert.ok(m.calls.some((c) => c.url.endsWith('/rpc/charge_brief')))
    assert.ok((await res.json()).balance)
  } finally { m.restore() }
  for (const reason of ['pro_only', 'no_briefs']) {
    m = mockSupa({ begin: () => [{ allowed: false, reason, day_limit: 10, balance: BAL }] })
    try {
      const res = await worker.fetch(briefReq({ contact: who, auth: token('p-6') }), env(SUPA))
      assert.equal(res.status, 402)
      const body = await res.json()
      assert.equal(body.error.code, reason); assert.ok(body.balance)
      assert.equal(m.calls.filter((c) => !c.url.startsWith('https://supa.test')).length, 0)
    } finally { m.restore() }
  }
})

test('pricing: a token Supabase refuses (made up, expired) is 401 sign_in, for reads and briefs, and nothing is read', async () => {
  for (const refuse of [() => new Response('{"message":"JWT expired"}', { status: 401 }), () => new Response('{"message":"invalid JWT"}', { status: 403 })]) {
    const m = mockUpstream((url) => (String(url).startsWith('https://supa.test') ? refuse() : new Response(JSON.stringify(geminiOk))))
    try {
      let res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: 'x' }), env(SUPA))
      assert.equal(res.status, 401); assert.equal((await res.json()).error.code, 'sign_in')
      res = await worker.fetch(briefReq({ contact: who, auth: 'x' }), env(SUPA))
      assert.equal(res.status, 401)
      assert.equal(m.calls.filter((c) => !c.url.startsWith('https://supa.test')).length, 0, 'Gemini is never called')
    } finally { m.restore() }
  }
})

test('pricing: a batch whose people cannot all be matched to a photo is not charged (the app reads those cards again, one by one)', async () => {
  const unmatched = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: [], notes: '', contacts: [{ name: 'A', image: 1, phones: [], emails: [], social: [] }, { name: 'B', phones: [], emails: [], social: [] }] }) }] } }] }
  const matched = { candidates: [{ content: { parts: [{ text: JSON.stringify({ languages: [], notes: '', contacts: [{ name: 'A', image: 1, phones: [], emails: [], social: [] }, { name: 'B', image: 2, phones: [], emails: [], social: [] }] }) }] } }] }
  const two = [{ mime: 'image/png', data: png }, { mime: 'image/png', data: png }]
  let m = mockSupa({ gemini: unmatched })
  try {
    const res = await worker.fetch(post({ images: two, layout: 'batch', auth: token('p-8') }), env(SUPA))
    assert.equal(res.status, 200)
    assert.equal(m.calls.filter((c) => c.url.includes('/rpc/charge_')).length, 0)
  } finally { m.restore() }
  m = mockSupa({ gemini: matched })
  try {
    await worker.fetch(post({ images: two, layout: 'batch', auth: token('p-9') }), env(SUPA))
    assert.deepEqual(JSON.parse(m.calls.find((c) => c.url.endsWith('/rpc/charge_reads')).init.body), { n: 2 })
  } finally { m.restore() }
})

test('BRIEF_THINKING sets the thinking level of a searched brief (low when unset)', async () => {
  for (const [set, want] of [['minimal', 'minimal'], [undefined, 'low'], ['nonsense', 'low']]) {
    const m = mockSupa({ gemini: briefOk, begin: () => [{ allowed: true, reason: null, day_limit: 10, balance: BAL }] })
    try {
      await worker.fetch(briefReq({ contact: who, auth: token(`t-${want}-${set}`) }), env({ ...SUPA, BRIEF_SEARCH: '1', ...(set ? { BRIEF_THINKING: set } : {}) }))
      const sent = JSON.parse(m.calls.find((c) => c.url.includes(':generateContent')).init.body)
      assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, want)
    } finally { m.restore() }
  }
})

// ── the shared company store, and the retry when a brief ran no search ──
function kvMock(seed = {}) {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]))
  return { m, puts: [], get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async function (k, v, o) { this.puts.push([k, o]); m.set(k, v) } }
}
const pinned = { name: 'Abhishek Jain', company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Tantithaiya, Surat 394305' }
const KEY = 'co1:name:vivacity woven sack|394305'
const okBegin = () => [{ allowed: true, reason: null, day_limit: 10, balance: BAL }]
/** briefOk with one Google search recorded, so no retry is triggered. */
const searched = (b = briefOk) => ({ ...b, candidates: [{ ...b.candidates[0], groundingMetadata: { ...b.candidates[0].groundingMetadata, webSearchQueries: ['q'] } }] })
const geminiCalls = (m) => m.calls.filter((c) => c.url.includes(':generateContent')).map((c) => JSON.parse(c.init.body))

test('company store: a miss runs the full brief and keeps the company part, with its name, never the person, for 30 days', async () => {
  const kv = kvMock()
  const m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    const res = await worker.fetch(briefReq({ contact: pinned, auth: token('c-1') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))
    assert.equal(res.status, 200)
    assert.equal(geminiCalls(m).length, 1)
    assert.match(geminiCalls(m)[0].contents[0].parts[0].text, /Search for the company/)
    const kept = JSON.parse(kv.m.get(KEY))
    assert.equal(kept.company, 'Makes sacks.'); assert.equal(kept.name, 'vivacity woven sack'); assert.equal('person' in kept, false)
    assert.equal(kv.puts[0][1].expirationTtl, 30 * 86400)
  } finally { m.restore() }
})

test('company store: a hit for the same company researches only the person and returns the kept company', async () => {
  const kv = kvMock({ [KEY]: { name: 'vivacity woven sack', company: 'Kept: makes PP sacks in Surat.', sources: [{ title: 'vivacity.in', uri: 'https://v/2' }], links: [] } })
  const m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    const body = await (await worker.fetch(briefReq({ contact: pinned, auth: token('c-2') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))).json()
    assert.equal(body.company, 'Kept: makes PP sacks in Surat.'); assert.equal(body.person, 'Director.')
    assert.match(geminiCalls(m)[0].contents[0].parts[0].text, /already been researched/)
    assert.ok(m.calls.some((c) => c.url.endsWith('/rpc/charge_brief')), 'a brief from the store is still a brief')
  } finally { m.restore() }
})

test('company store: a sister firm on the same domain is not reused', async () => {
  const kv = kvMock({ 'co1:dom:vivacitygroup.com': { name: 'vivacity polymers', company: 'Makes polymers.', sources: [], links: [] } })
  const m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    const body = await (await worker.fetch(briefReq({ contact: { ...pinned, address: 'Surat', domains: ['vivacitygroup.com'] }, auth: token('c-7') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))).json()
    assert.equal(body.company, 'Makes sacks.')
    assert.match(geminiCalls(m)[0].contents[0].parts[0].text, /Search for the company/)
  } finally { m.restore() }
})

test('company store: Refresh reuses company research under 7 days old, and researches again once it is older', async () => {
  const day = 86400000
  for (const [age, reused] of [[2 * day, true], [8 * day, false]]) {
    const kv = kvMock({ [KEY]: { name: 'vivacity woven sack', company: 'Kept.', sources: [], links: [], at: Date.now() - age } })
    const m = mockSupa({ gemini: searched(), begin: okBegin })
    try {
      const body = await (await worker.fetch(briefReq({ contact: pinned, auth: token(`f-${age}`), fresh: true }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))).json()
      assert.equal(body.company, reused ? 'Kept.' : 'Makes sacks.')
      if (!reused) assert.ok(JSON.parse(kv.m.get(KEY)).at > Date.now() - 60000, 'the new research is kept with its date')
    } finally { m.restore() }
  }
})

test('company store: an entry without a date counts as old on Refresh; no strong match, no store; a failing store never stops a brief', async () => {
  let kv = kvMock({ [KEY]: { name: 'vivacity woven sack', company: 'Old.', sources: [], links: [] } })
  let m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    const body = await (await worker.fetch(briefReq({ contact: pinned, auth: token('c-3'), fresh: true }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))).json()
    assert.equal(body.company, 'Makes sacks.'); assert.equal(JSON.parse(kv.m.get(KEY)).company, 'Makes sacks.')
  } finally { m.restore() }
  kv = kvMock(); m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    await worker.fetch(briefReq({ contact: who, auth: token('c-4') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))
    assert.equal(kv.puts.length, 0, 'Surat without a pincode is too weak to share')
  } finally { m.restore() }
  const broken = { get: async () => { throw new Error('kv down') }, put: async () => { throw new Error('kv down') } }
  m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    assert.equal((await worker.fetch(briefReq({ contact: pinned, auth: token('c-5') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: broken }))).status, 200)
  } finally { m.restore() }
})

test('a brief that ran no search is nudged once, in the same conversation and thinking level; a still-unsearched brief is marked unchecked and its company never kept', async () => {
  const second = (searchedToo) => { const b = { ...briefOk, candidates: [{ ...briefOk.candidates[0], content: { parts: [{ text: JSON.stringify({ person: 'Second.', company: 'Second co.', starters: [], links: [] }) }] } }] }; return searchedToo ? searched(b) : b }
  for (const searchedToo of [true, false]) {
    let n = 0
    const kv = kvMock()
    const m = mockUpstream((url) => {
      const u = String(url)
      if (u.includes('/rpc/begin_')) return new Response(JSON.stringify(okBegin()))
      if (u.includes('/rpc/charge_')) return new Response(JSON.stringify(BAL))
      return new Response(JSON.stringify(++n === 1 ? briefOk : second(searchedToo)))
    })
    try {
      const body = await (await worker.fetch(briefReq({ contact: pinned, auth: token(`r-${searchedToo}`) }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_THINKING: 'minimal', BRIEF_CACHE: kv }))).json()
      const calls = geminiCalls(m)
      assert.equal(calls.length, 2)
      assert.equal(calls[1].generationConfig.thinkingConfig.thinkingLevel, 'minimal')
      assert.deepEqual(calls[1].contents.map((c) => c.role), ['user', 'model', 'user'], 'the nudge replies to the first answer')
      assert.match(calls[1].contents[2].parts[0].text, /without running Google Search/)
      assert.equal(body.person, 'Second.')
      assert.equal(body.unchecked, !searchedToo || undefined)
      assert.equal(kv.puts.length, searchedToo ? 1 : 0, 'only searched company research is kept')
      assert.equal(m.calls.filter((c) => c.url.endsWith('/rpc/charge_brief')).length, 1, 'charged once')
    } finally { m.restore() }
  }
  const m = mockSupa({ gemini: searched(), begin: okBegin })
  try {
    const body = await (await worker.fetch(briefReq({ contact: who, auth: token('r-3') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_THINKING: 'minimal' }))).json()
    assert.equal(geminiCalls(m).length, 1); assert.equal('unchecked' in body, false)
  } finally { m.restore() }
})

function mockGemini(status, body) {
  return mockUpstream((url) => (String(url).startsWith('https://supa.test')
    ? new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 300 }]))
    : new Response(JSON.stringify(body), { status })))
}
test('brake: reads Gemini rejects are 422 unreadable and never use up the brake; 30 good reads do', async () => {
  const user = token('brake-user')
  let m = mockGemini(400, { error: { message: 'Unable to process input image.' } })
  try {
    for (let i = 0; i < 31; i++) {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: user }), env(SUPA))
      assert.equal(res.status, 422, `call ${i}`)
      assert.equal((await res.json()).error.code, 'unreadable')
    }
  } finally { m.restore() }
  m = mockGemini(200, geminiOk)
  try {
    for (let i = 0; i < 30; i++) assert.equal((await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: user }), env(SUPA))).status, 200, `good ${i}`)
    const over = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: user }), env(SUPA))
    assert.equal(over.status, 429)
    assert.equal((await over.json()).error.code, 'rate_limited')
    assert.ok(Number(over.headers.get('Retry-After')) > 0)
  } finally { m.restore() }
})
test('brake: a Gemini key, payment or access problem is the service\'s, not the photo\'s', async () => {
  for (const status of [401, 402, 403]) {
    const m = mockGemini(status, { error: { message: 'nope' } })
    try {
      const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }], auth: token(`svc-${status}`) }), env(SUPA))
      assert.equal(res.status, 502, String(status))
    } finally { m.restore() }
  }
})
test('rateWait looks without recording; rateHit records', () => {
  const k = 'look-test', t = 5_000_000
  for (let i = 0; i < 50; i++) assert.equal(rateWait(k, t + i), 0)
  for (let i = 0; i < 30; i++) rateHit(k, t + i)
  assert.ok(rateWait(k, t + 40) > 0)
})
