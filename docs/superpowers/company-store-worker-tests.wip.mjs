
// ── the shared company store ──
function kvMock(seed = {}) {
  const m = new Map(Object.entries(seed).map(([k, v]) => [k, JSON.stringify(v)]))
  return { m, puts: [], get: async (k, t) => (m.has(k) ? (t === 'json' ? JSON.parse(m.get(k)) : m.get(k)) : null), put: async function (k, v, o) { this.puts.push([k, o]); m.set(k, v) } }
}
const pinned = { name: 'Abhishek Jain', company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Tantithaiya, Surat 394305' }
const KEY = 'co1:name:vivacity woven sack|394305'
const okBegin = () => [{ allowed: true, reason: null, day_limit: 10, balance: BAL }]

test('company store: a miss runs the full brief and keeps the company part (never the person) for 30 days', async () => {
  const kv = kvMock()
  const m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    const res = await worker.fetch(briefReq({ contact: pinned, auth: token('c-1') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))
    assert.equal(res.status, 200)
    const sent = JSON.parse(m.calls.find((c) => c.url.includes(':generateContent')).init.body)
    assert.match(sent.contents[0].parts[0].text, /Search for the company/)
    const kept = JSON.parse(kv.m.get(KEY))
    assert.equal(kept.company, 'Makes sacks.'); assert.equal('person' in kept, false)
    assert.equal(kv.puts[0][1].expirationTtl, 30 * 86400)
  } finally { m.restore() }
})

test('company store: a hit researches only the person and returns the kept company', async () => {
  const kv = kvMock({ [KEY]: { company: 'Kept: makes PP sacks in Surat.', sources: [{ title: 'vivacity.in', uri: 'https://v/2' }], links: [] } })
  const m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    const res = await worker.fetch(briefReq({ contact: pinned, auth: token('c-2') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))
    const body = await res.json()
    assert.equal(body.company, 'Kept: makes PP sacks in Surat.'); assert.equal(body.person, 'Director.')
    const sent = JSON.parse(m.calls.find((c) => c.url.includes(':generateContent')).init.body)
    assert.match(sent.contents[0].parts[0].text, /already been researched/)
    assert.ok(m.calls.some((c) => c.url.endsWith('/rpc/charge_brief')), 'a brief from the store is still a brief')
  } finally { m.restore() }
})

test('company store: Refresh (fresh) skips the store and writes the new company; no strong match, no store; a failing store never stops a brief', async () => {
  let kv = kvMock({ [KEY]: { company: 'Old.', sources: [], links: [] } })
  let m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    const body = await (await worker.fetch(briefReq({ contact: pinned, auth: token('c-3'), fresh: true }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))).json()
    assert.equal(body.company, 'Makes sacks.'); assert.equal(JSON.parse(kv.m.get(KEY)).company, 'Makes sacks.')
  } finally { m.restore() }
  kv = kvMock(); m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    await worker.fetch(briefReq({ contact: who, auth: token('c-4') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: kv }))
    assert.equal(kv.puts.length, 0, 'Surat without a pincode is too weak to share')
  } finally { m.restore() }
  const broken = { get: async () => { throw new Error('kv down') }, put: async () => { throw new Error('kv down') } }
  m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    const res = await worker.fetch(briefReq({ contact: pinned, auth: token('c-5') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_CACHE: broken }))
    assert.equal(res.status, 200)
  } finally { m.restore() }
})

test('BRIEF_THINKING sets the thinking level of a searched brief', async () => {
  const m = mockSupa({ gemini: briefOk, begin: okBegin })
  try {
    await worker.fetch(briefReq({ contact: who, auth: token('c-6') }), env({ ...SUPA, BRIEF_SEARCH: '1', BRIEF_THINKING: 'minimal' }))
    const sent = JSON.parse(m.calls.find((c) => c.url.includes(':generateContent')).init.body)
    assert.equal(sent.generationConfig.thinkingConfig.thinkingLevel, 'minimal')
  } finally { m.restore() }
})
