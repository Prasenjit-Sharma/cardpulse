// Run: node --test server/test
import test from 'node:test'
import assert from 'node:assert/strict'
import worker, { checkRate } from '../worker.ts'

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
    assert.equal(q.url, 'https://supa.test/rest/v1/rpc/consume_scan')
    assert.equal(q.init.headers.Authorization, `Bearer ${token('user-1')}`)
    assert.equal(q.init.headers.apikey, 'sb_publishable_x')
    assert.equal(m.calls.length, 2, 'one quota call, one read')
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

test('quota: a bad token, Supabase down, a missing function or no config all fall back to the per-IP limit and still read', async () => {
  const cases = [
    [() => new Response('{"message":"JWT expired"}', { status: 401 }), SUPA],
    [() => { throw new TypeError('fetch failed') }, SUPA],
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

test('quota: no token means no quota call at all (signed-out use is unchanged)', async () => {
  const m = mockBoth(() => { throw new Error('should not be called') })
  try {
    const res = await worker.fetch(post({ images: [{ mime: 'image/png', data: png }] }), env(SUPA))
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
