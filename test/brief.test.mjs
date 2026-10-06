// Run: node --test test/brief.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { BRIEF_KEEP_MS, BriefFailure, addLink, briefInput, briefText, canBrief, freshBrief, hasLink, linkLabel, pendingBrief, requestBrief, runBrief } from '../src/lib/brief.ts'

const person = (o = {}) => ({ name: 'Abhishek Jain', title: 'Director', company: 'Vivacity Woven Sack Pvt. Ltd.', phones: ['99740 33339'], emails: ['vivacitywovensackpvtltd@gmail.com'], website: '', address: 'Block 25-27, Bardoli Road, Tantithaiya, Surat, Gujarat 394305', gstin: '', social: [], note: 'secret note', tags: ['Customer'], ...o })
const brief = { at: Date.UTC(2026, 8, 29), model: 'm', person: 'Director at Vivacity.', company: 'Makes woven sacks.', starters: ['Ask about the new plant.', 'Ask about exports.'], links: [], sources: [{ title: 'indiamart.com', uri: 'https://r/1' }, { title: 'vivacitygroup.in', uri: 'https://r/2' }], suggestions: '' }

test('only the card identity is sent: no phones, no notes, no free-mail domain', () => {
  const i = briefInput(person({ emails: ['a@gmail.com', 'b@VivacityGroup.in'] }))
  assert.deepEqual(Object.keys(i).sort(), ['address', 'company', 'domains', 'gstin', 'name', 'title', 'website'])
  assert.deepEqual(i.domains, ['vivacitygroup.in'])
  assert.deepEqual(briefInput(person()).domains, [])
  assert.ok(!JSON.stringify(i).includes('99740') && !JSON.stringify(i).includes('secret'))
})
test('a brief needs a name or a company', () => {
  assert.equal(canBrief(person({ name: ' ', company: '' })), false)
  assert.equal(canBrief(person({ name: '', company: 'X' })), true)
})
test('a brief is kept for two years, then dropped', () => {
  const c = person({ brief })
  assert.equal(freshBrief(c, brief.at + BRIEF_KEEP_MS - 1), brief)
  assert.equal(freshBrief(c, brief.at + BRIEF_KEEP_MS + 1), undefined)
  assert.equal(freshBrief(person()), undefined)
})
test('shared text: all sections, or one, with the heading line, sources and the credit', () => {
  const all = briefText(person({ brief }), brief)
  assert.equal(all, [
    '*Abhishek Jain*, Vivacity Woven Sack Pvt. Ltd., Surat',
    '*About the person*\nDirector at Vivacity.',
    '*About the company*\nMakes woven sacks.',
    '*Conversation starters*\n• Ask about the new plant.\n• Ask about exports.',
    'Sources: indiamart.com, vivacitygroup.in\nvia Pulse Brief',
  ].join('\n\n'))
  const one = briefText(person(), brief, 'company')
  assert.ok(one.includes('*About the company*') && !one.includes('About the person'))
  assert.ok(briefText(person({ name: '' }), brief).startsWith('*Vivacity Woven Sack Pvt. Ltd.*, Surat'), 'no name: the company leads')
})
test('adding a link: a website fills an empty website, anything else goes to social, never twice', () => {
  let c = addLink(person(), { kind: 'website', url: 'https://www.vivacitygroup.in/' })
  assert.equal(c.website, 'https://www.vivacitygroup.in/')
  c = addLink(c, { kind: 'linkedin', url: 'https://linkedin.com/in/aj' })
  assert.deepEqual(c.social, ['https://linkedin.com/in/aj'])
  assert.equal(addLink(c, { kind: 'linkedin', url: 'http://www.linkedin.com/in/aj/' }), c, 'same link, other spelling')
  assert.equal(hasLink(person({ website: 'vivacitygroup.in' }), 'https://www.vivacitygroup.in'), true)
  assert.equal(linkLabel({ kind: 'linkedin', url: 'https://linkedin.com/company/v' }), 'LinkedIn page')
  assert.equal(linkLabel({ kind: 'linkedin', url: 'https://linkedin.com/in/v' }), 'LinkedIn profile')
})
test('request: offline, signed out, over the limit and failures are named; success is stamped', async () => {
  const ok = async () => new Response(JSON.stringify({ ...brief, at: undefined, model: 'gm' }))
  await assert.rejects(requestBrief(person(), { url: 'https://api', token: 't', online: false, fetch: ok }), (e) => e instanceof BriefFailure && e.code === 'offline')
  await assert.rejects(requestBrief(person(), { url: 'https://api', token: undefined, online: true, fetch: ok }), (e) => e.code === 'sign_in')
  const limit = async () => new Response(JSON.stringify({ error: { code: 'daily_limit', message: 'You have used today\'s 10 fresh searches.' } }), { status: 429 })
  await assert.rejects(requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: limit }), (e) => e.code === 'daily_limit' && /10 fresh/.test(e.message))
  const boom = async () => { throw new TypeError('fetch failed') }
  await assert.rejects(requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: boom }), (e) => e.code === 'failed')
  const bad = async () => new Response('{"error":{"code":"bad_output","message":"secret detail"}}', { status: 502 })
  await assert.rejects(requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: bad }), (e) => e.code === 'failed' && !/secret/.test(e.message))
  let sent
  const spy = async (u, init) => { sent = { u, body: JSON.parse(init.body) }; return ok() }
  const b = await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: spy, now: 42 })
  assert.equal(b.at, 42); assert.equal(b.model, 'gm'); assert.equal(sent.u, 'https://api/v1/brief'); assert.equal(sent.body.auth, 't')
  assert.equal(sent.body.contact.name, 'Abhishek Jain')
})
test('one search per contact at a time: a second start joins the first', async () => {
  let n = 0, release
  const start = () => { n++; return new Promise((r) => { release = r }) }
  const a = runBrief('k', start), b = runBrief('k', start)
  assert.equal(n, 1); assert.equal(pendingBrief('k'), a)
  release(brief); assert.equal(await b, brief)
  await Promise.resolve(); await Promise.resolve()
  assert.equal(pendingBrief('k'), undefined)
})

test('requestBrief: pro_only and no_briefs keep their codes, and the balance is handed on', async () => {
  for (const code of ['pro_only', 'no_briefs']) {
    let seen
    const f = async () => new Response(JSON.stringify({ error: { code, message: 'x' }, balance: { tier: 'free' } }), { status: 402 })
    await assert.rejects(requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: f, onBalance: (b) => { seen = b } }), (e) => e instanceof BriefFailure && e.code === code)
    assert.deepEqual(seen, { tier: 'free' })
  }
  let seen
  const ok = async () => new Response(JSON.stringify({ person: 'P', company: '', starters: [], links: [], sources: [], balance: { tier: 'pro' } }))
  const b = await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: ok, onBalance: (x) => { seen = x } })
  assert.deepEqual(seen, { tier: 'pro' }); assert.equal('balance' in b, false, 'the balance is never saved on the contact')
})

test('requestBrief: Refresh asks the server for fresh company research; a first brief does not', async () => {
  const bodies = []
  const f = async (_u, init) => { bodies.push(JSON.parse(init.body)); return new Response(JSON.stringify({ person: 'P', company: 'C', starters: [], links: [], sources: [] })) }
  await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: f })
  await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: f, fresh: true })
  assert.equal(bodies[0].fresh, undefined); assert.equal(bodies[1].fresh, true)
})

test('requestBrief keeps the server\'s unchecked mark (written without a web search) on the brief', async () => {
  const f = (unchecked) => async () => new Response(JSON.stringify({ person: 'P', company: 'C', starters: [], links: [], sources: [{ title: 'x.in', uri: 'https://v/1' }], ...(unchecked ? { unchecked: true } : {}) }))
  assert.equal((await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: f(true) })).unchecked, true)
  assert.equal('unchecked' in (await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: f(false) })), false)
})
