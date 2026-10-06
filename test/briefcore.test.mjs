// Run: node --test test/briefcore.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { BriefError, buildBriefRequest, buildPersonRequest, checkLinks, companyEntry, companyKeys, entryMatches, mergeCompany, parseBriefResponse, validBriefInput } from '../shared/brief-core.ts'

const input = { name: 'Abhishek Jain', title: '', company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Tantithaiya, Surat 394305', website: '', domains: [], gstin: '' }
const grounded = (text, chunks = [], rendered = '<div>chips</div>') => ({ candidates: [{ content: { parts: [{ text }] }, groundingMetadata: {
  groundingChunks: chunks.map(([title, uri]) => ({ web: { title, uri } })), searchEntryPoint: { renderedContent: rendered } } }] })
const answer = { person: 'Director at Vivacity.', company: 'Makes woven PP sacks in Surat.', starters: ['Ask about the new line.'], links: [] }

test('input: strings trimmed and bounded, name or company required, domains checked', () => {
  assert.equal(validBriefInput({ ...input, name: '', company: '' }), null)
  assert.equal(validBriefInput({ ...input, name: 5 }), null)
  assert.equal(validBriefInput('x'), null)
  const v = validBriefInput({ ...input, name: '  A  ', title: 'x'.repeat(400), domains: ['vivacity.in', 'not a domain', 'a.in', 'b.in', 'c.in'] })
  assert.equal(v.name, 'A'); assert.equal(v.title.length, 300); assert.deepEqual(v.domains, ['vivacity.in', 'a.in', 'b.in'])
  assert.deepEqual(validBriefInput({ company: 'Only' }).domains, [], 'missing fields default to empty')
})
test('by default the brief comes from what the model already knows: no web search, JSON out, honest when unknown', () => {
  const req = buildBriefRequest({ ...input, gstin: '24ABCDE1234F1Z5' })
  assert.equal(req.tools, undefined, 'no Google Search')
  assert.equal(req.generationConfig.responseMimeType, 'application/json')
  const text = req.contents[0].parts[0].text
  assert.match(text, /Vivacity Woven Sack/); assert.match(text, /24ABCDE1234F1Z5/)
  assert.match(text, /No specific information on this person/); assert.match(text, /No specific information on this company/)
  assert.match(text, /Never invent/)
  assert.ok(!/Google Search/.test(text) && !/links/.test(text), 'nothing about searching or links')
  assert.ok(!/Title:/.test(text), 'empty fields are left out')
})
test('with search on, the request uses Google Search and asks for found links', () => {
  const req = buildBriefRequest(input, true)
  assert.deepEqual(req.tools, [{ google_search: {} }])
  assert.equal(req.generationConfig.responseMimeType, undefined, 'grounding and JSON mode are not combined')
  assert.equal(req.generationConfig.thinkingConfig.thinkingLevel, 'low', 'default thinking took 30 to 40 s')
  const text = req.contents[0].parts[0].text
  assert.match(text, /Always run Google Search/); assert.match(text, /site:linkedin\.com\/in/); assert.match(text, /designation, company, city and website/); assert.match(text, /Little public information found/); assert.match(text, /links:/)
})
test('parse: JSON inside prose or a code fence is read', () => {
  for (const t of [JSON.stringify(answer), 'Here you go:\n```json\n' + JSON.stringify(answer) + '\n```']) {
    const r = parseBriefResponse(grounded(t))
    assert.equal(r.person, 'Director at Vivacity.'); assert.deepEqual(r.starters, ['Ask about the new line.'])
  }
})
test('parse: sources and suggestions come from the grounding metadata', () => {
  const r = parseBriefResponse(grounded(JSON.stringify(answer), [['indiamart.com', 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/1'], ['indiamart.com', 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/2'], ['x', 'javascript:alert(1)']]))
  assert.deepEqual(r.sources, [{ title: 'indiamart.com', uri: 'https://vertexaisearch.cloud.google.com/grounding-api-redirect/1' }])
  assert.equal(r.suggestions, '<div>chips</div>')
})
test('parse: no JSON, bad JSON or nothing said is a BriefError', () => {
  for (const t of ['no json here', '{ broken', JSON.stringify({ person: '', company: '', starters: [] })]) assert.throws(() => parseBriefResponse(grounded(t)), BriefError)
  assert.throws(() => parseBriefResponse({ candidates: [] }), BriefError)
})
test('links: only on a searched domain, kind from the host, LinkedIn only for people and company pages, at most 5', () => {
  const sources = [{ title: 'linkedin.com', uri: 'https://r/1' }, { title: 'vivacitygroup.in', uri: 'https://r/2' }, { title: 'indiamart.com', uri: 'https://r/3' }]
  const links = checkLinks([
    { kind: 'linkedin', url: 'https://in.linkedin.com/in/abhishek-jain-123' },
    { kind: 'linkedin', url: 'https://www.linkedin.com/pub/dir/Abhishek/Jain' },
    { kind: 'linkedin', url: 'https://linkedin.com/in/made-up?x' },
    { kind: 'website', url: 'https://www.vivacitygroup.in/' },
    { kind: 'other', url: 'https://www.indiamart.com/vivacity-woven/' },
    { kind: 'website', url: 'https://invented-site.com' },
    { kind: 'website', url: 'ftp://vivacitygroup.in' },
    'junk',
  ], sources)
  assert.deepEqual(links.map((l) => [l.kind, l.url]), [
    ['linkedin', 'https://in.linkedin.com/in/abhishek-jain-123'],
    ['linkedin', 'https://linkedin.com/in/made-up?x'],
    ['website', 'https://www.vivacitygroup.in/'],
    ['indiamart', 'https://www.indiamart.com/vivacity-woven/'],
  ])
  const many = Array.from({ length: 8 }, (_, i) => ({ kind: 'other', url: `https://indiamart.com/p${i}` }))
  assert.equal(checkLinks(many, sources).length, 5)
})

test('a searched brief must stay on the company named on the card (minimal thinking once swapped in a similarly named firm)', () => {
  const text = buildBriefRequest(input, true, 'minimal').contents[0].parts[0].text
  assert.match(text, /never swap in a similarly named firm/)
})

// ── the shared company store ──
test('companyKeys: only strong matches (GSTIN, the company\'s own domain, or name with pincode); never a name alone', () => {
  const base = { name: 'A', title: '', company: '', address: '', website: '', domains: [], gstin: '' }
  assert.deepEqual(companyKeys({ ...base, company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Surat' }), [], 'a name without a pincode is too weak to share')
  assert.deepEqual(companyKeys({ ...base, company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Tantithaiya, Surat 394 305' }), ['co1:name:vivacity woven sack|394305'])
  assert.deepEqual(companyKeys({ ...base, company: 'M/s. Vivacity Woven Sack Private Limited', address: 'Surat - 394305, Gujarat' }), ['co1:name:vivacity woven sack|394305'], 'suffixes and punctuation do not split one company')
  assert.deepEqual(companyKeys({ ...base, company: 'Vivacity', gstin: '24abcde1234f1z5', website: 'https://www.Vivacity.in/about', domains: ['vivacity.in', 'vivacitygroup.com'] }),
    ['co1:gst:24ABCDE1234F1Z5', 'co1:dom:vivacity.in', 'co1:dom:vivacitygroup.com'])
  assert.deepEqual(companyKeys({ ...base, company: 'X', website: 'www.indiamart.com/vivacity' }), [], 'a marketplace or social site is not the company\'s domain')
  assert.deepEqual(companyKeys({ ...base, company: 'X', gstin: 'not-a-gstin' }), [])
})

test('companyEntry keeps only the company: no person text, no LinkedIn sources, no personal LinkedIn links', () => {
  const r = { person: 'Director, 20 years.', company: 'Makes PP woven sacks.', starters: ['Hi'], suggestions: '<div/>',
    sources: [{ title: 'linkedin.com', uri: 'https://v/1' }, { title: 'vivacity.in', uri: 'https://v/2' }],
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }, { kind: 'linkedin', url: 'https://www.linkedin.com/company/vivacity' }, { kind: 'website', url: 'https://vivacity.in' }] }
  assert.deepEqual(companyEntry(r, input), { name: 'vivacity woven sack', company: 'Makes PP woven sacks.', sources: [{ title: 'vivacity.in', uri: 'https://v/2' }],
    links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/company/vivacity' }, { kind: 'website', url: 'https://vivacity.in' }] })
})

test('with the company already known, the request researches only the person, in one search', () => {
  const req = buildPersonRequest(input, 'Makes PP woven sacks in Surat.', 'minimal')
  const text = req.contents[0].parts[0].text
  assert.deepEqual(req.tools, [{ google_search: {} }])
  assert.equal(req.generationConfig.thinkingConfig.thinkingLevel, 'minimal')
  assert.match(text, /Makes PP woven sacks in Surat\./)
  assert.match(text, /exactly ONE Google Search/)
  assert.doesNotMatch(text, /Search for the company/)
})

test('mergeCompany: the person from the fresh call, the company from the store, sources and links from both without repeats', () => {
  const fresh = { person: 'Director.', company: 'ignored', starters: ['Ask about sacks'], suggestions: '<s/>', sources: [{ title: 'linkedin.com', uri: 'https://v/9' }, { title: 'vivacity.in', uri: 'https://v/2' }], links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }] }
  const entry = { name: 'vivacity woven sack', company: 'Makes PP woven sacks.', sources: [{ title: 'vivacity.in', uri: 'https://v/2' }], links: [{ kind: 'website', url: 'https://vivacity.in' }] }
  const m = mergeCompany(entry, fresh)
  assert.equal(m.person, 'Director.'); assert.equal(m.company, 'Makes PP woven sacks.'); assert.deepEqual(m.starters, ['Ask about sacks'])
  assert.deepEqual(m.sources.map((s) => s.title), ['linkedin.com', 'vivacity.in'])
  assert.deepEqual(m.links.map((l) => l.url), ['https://www.linkedin.com/in/aj', 'https://vivacity.in'])
})

test('a saved company is reused only when it is the same company: GSTIN alone is enough; a shared domain or a pincode also needs the same name', () => {
  const card = (o) => ({ name: 'A', title: '', company: '', address: '', website: '', domains: [], gstin: '', ...o })
  const saved = companyEntry({ person: '', company: 'Makes sacks.', starters: [], suggestions: '', sources: [], links: [] }, card({ company: 'Vivacity Woven Sack Pvt. Ltd.' }))
  assert.equal(saved.name, 'vivacity woven sack')
  assert.equal(entryMatches(saved, card({ company: 'Vivacity Woven Sack Private Limited' }), 'co1:dom:vivacitygroup.com'), true)
  assert.equal(entryMatches(saved, card({ company: 'Vivacity Polymers Pvt Ltd' }), 'co1:dom:vivacitygroup.com'), false, 'a sister firm on the group domain is a different company')
  assert.equal(entryMatches(saved, card({ company: 'Vivacity Woven Sack' }), 'co1:name:vivacity woven sack|394305'), true)
  const group = { ...saved, name: 'vivacity polymers' }
  assert.equal(entryMatches(group, card({ company: 'Vivacity' }), 'co1:dom:vivacitygroup.com'), false, 'one word is too short to say it is the same firm')
  assert.equal(entryMatches(saved, card({ company: 'VIVACITY POLYMERS' }), 'co1:gst:24ABCDE1234F1Z5'), true, 'a GSTIN names one registered business, whatever the card calls it')
})
