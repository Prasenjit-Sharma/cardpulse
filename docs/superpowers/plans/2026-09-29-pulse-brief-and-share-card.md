# Pulse Brief and Share my card Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A web-researched brief on a contact (Gemini with Google Search) and a one-tap "send my card to this contact's WhatsApp", both on the contact page.

**Architecture:** The prompt, the Gemini request and the checks on its answer live in `shared/brief-core.ts`, used by a new Worker route `POST /v1/brief` (sign-in required, own daily quota `consume_brief`). The phone keeps each brief on the contact (`Contact.brief`), so it syncs to the user's own phones; nothing is stored on the server. Share my card writes the vCard to the app cache and hands it to WhatsApp with the contact's number through a small native plugin, falling back to the share sheet.

**Tech Stack:** React 19 + TypeScript + Vite, Cloudflare Worker, Supabase (Postgres RPC), Capacitor 8 Android (Java plugin), node:test.

**Spec:** `docs/superpowers/specs/2026-09-29-pulse-brief-and-share-card-design.md`

## Global Constraints

- Name in the UI: **Pulse Brief**. Never "Instant Bio".
- Sent to the server: name, title, company, address, website, email **domains** (free-mail domains dropped), GSTIN. Never phones, notes, tags, log.
- Daily limit: **10** fresh briefs per account (UTC day). Message: "You've used today's 10 fresh searches. Saved briefs still open. Resets at 5:30 am."
- No shared cache on the server; a brief is kept on the contact for at most **2 years**.
- Google Search suggestions (`renderedContent`) are shown with every brief.
- A link is offered only when its domain is one of the grounding sources; LinkedIn only for `/in/...` or `/company/...`.
- The brief is never exported (vCard, CSV, Save to phone).
- Share my card sends the vCard **alone** (no text), `jid` = digits + `@s.whatsapp.net`, packages `com.whatsapp`, `com.whatsapp.w4b`.
- Loading state: pulse rings + timed captions + shimmer placeholders; no progress bar; still under reduce motion.
- Code style: match the repo — small pure modules with node tests, plain-English comments, no new dependencies.

## Review Focus

1. The model returns prose around the JSON, or JSON in a ```json fence: the lenient parser must still read it (test in Task 2).
2. The model invents a LinkedIn URL not among the sources: it must be dropped (test in Task 2).
3. The contact is edited or the page closed while a brief is loading: the brief must still be saved to the right person and must not overwrite the edit (Task 5, guarded by name match).
4. A contact with only a free-mail address and no website: the request must still work, sending no domain (test in Task 4).
5. Share my card with a landline-only contact: no WhatsApp number, so the share sheet is used (test in Task 6).

---

### Task 1: Daily brief quota (migration 0003)

**Files:**
- Create: `supabase/migrations/0003_brief_quota.sql`
- Modify: `scripts/check-migrations.mjs`

**Interfaces:**
- Produces: `public.consume_brief() returns table (allowed boolean, used integer, day_limit integer)`, callable by `authenticated` only.

- [ ] **Step 1: Write the failing check** — in `scripts/check-migrations.mjs`, run 0003 (twice) after 0002 and add, after the consume_scan block:

```js
// consume_brief: its own limit of 10, separate from scans
for (let i = 1; i <= 10; i++) {
  r = await as('authenticated', A, 'select * from public.consume_brief()')
  assert.equal(r.rows[0].allowed, true); assert.equal(r.rows[0].used, i)
}
r = await as('authenticated', A, 'select * from public.consume_brief()')
assert.deepEqual(r.rows[0], { allowed: false, used: 10, day_limit: 10 })
r = await as('authenticated', B, 'select * from public.consume_brief()')
assert.equal(r.rows[0].used, 1)
await assert.rejects(as('anon', null, 'select * from public.consume_brief()'), /permission denied/)
console.log('ok consume_brief limit per account, anon refused')
```

- [ ] **Step 2: Run** `npm run test:db` — Expected: FAIL (file 0003 missing).
- [ ] **Step 3: Write the migration**

```sql
-- supabase/migrations/0003_brief_quota.sql
-- Pulse Brief: a daily limit of fresh web-searched briefs per account, counted the same way as scans (consume_scan, 0002).
-- Re-runnable. Run it in the Supabase SQL editor after 0002.
create table if not exists public.brief_usage (
  owner_id uuid not null references auth.users(id) on delete cascade,
  day date not null,
  briefs integer not null default 0,
  primary key (owner_id, day)
);
alter table public.brief_usage enable row level security;
drop policy if exists "owner reads own brief usage" on public.brief_usage;
create policy "owner reads own brief usage" on public.brief_usage for select using (auth.uid() = owner_id);
-- No insert/update policy: only consume_brief (below) changes the count.

-- Called by the Worker with the user's own token. Each fresh brief is a paid Google search, so the limit is small.
create or replace function public.consume_brief()
returns table (allowed boolean, used integer, day_limit integer)
language plpgsql security definer set search_path = public as $$
declare v_uid uuid := auth.uid(); v_limit constant integer := 10; v_used integer;
begin
  if v_uid is null then raise exception 'not signed in'; end if;
  insert into public.brief_usage as u (owner_id, day, briefs) values (v_uid, current_date, 1)
    on conflict (owner_id, day) do update set briefs = u.briefs + 1 where u.briefs < v_limit
    returning u.briefs into v_used;
  if v_used is null then
    select briefs into v_used from public.brief_usage where owner_id = v_uid and day = current_date;
    return query select false, v_used, v_limit;
  else
    return query select true, v_used, v_limit;
  end if;
end $$;
revoke execute on function public.consume_brief() from public, anon;
grant execute on function public.consume_brief() to authenticated;
```

- [ ] **Step 4: Run** `npm run test:db` — Expected: ALL OK.
- [ ] **Step 5: Commit** `git add supabase/migrations/0003_brief_quota.sql scripts/check-migrations.mjs && git commit -m "Pulse Brief: a daily limit of 10 fresh briefs per account"`

### Task 2: The brief core (prompt, request, lenient parse, link checks)

**Files:**
- Create: `shared/brief-core.ts`
- Test: `test/briefcore.test.mjs` (add to `npm test`)

**Interfaces:**
- Produces:
  - `interface BriefInput { name; title; company; address; website: string; domains: string[]; gstin: string }`
  - `type LinkKind = 'linkedin'|'website'|'indiamart'|'facebook'|'instagram'|'justdial'|'tradeindia'|'other'`
  - `interface BriefLink { kind: LinkKind; url: string }`, `interface BriefSource { title: string; uri: string }`
  - `interface BriefResult { person: string; company: string; starters: string[]; links: BriefLink[]; sources: BriefSource[]; suggestions: string }`
  - `validBriefInput(v: unknown): BriefInput | null`, `briefPrompt(i)`, `buildBriefRequest(i)`, `parseBriefResponse(json): BriefResult` (throws `BriefError`), `checkLinks(raw, sources): BriefLink[]`, `hostOf(url): string`

- [ ] **Step 1: Write the failing tests** (full file):

```js
// Run: node --test test/briefcore.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { BriefError, buildBriefRequest, checkLinks, parseBriefResponse, validBriefInput } from '../shared/brief-core.ts'

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
test('the request uses Google Search and carries only the card identity', () => {
  const req = buildBriefRequest({ ...input, gstin: '24ABCDE1234F1Z5' })
  assert.deepEqual(req.tools, [{ google_search: {} }])
  const text = req.contents[0].parts[0].text
  assert.match(text, /Vivacity Woven Sack/); assert.match(text, /24ABCDE1234F1Z5/); assert.match(text, /Little public information found/)
  assert.ok(!/Title:/.test(text), 'empty fields are left out')
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
    { kind: 'linkedin', url: 'https://linkedin.com/in/made-up' + '?x' },
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
})
```

- [ ] **Step 2: Run** `node --test test/briefcore.test.mjs` — Expected: FAIL (module missing).
- [ ] **Step 3: Implement** `shared/brief-core.ts`:

```ts
// Pulse Brief: the prompt, the request to Gemini with Google Search, and the checks on what comes back. Shared by the
// server, which makes the call, and the tests. No network and no storage here.

export interface BriefInput { name: string; title: string; company: string; address: string; website: string; domains: string[]; gstin: string }
export type LinkKind = 'linkedin' | 'website' | 'indiamart' | 'facebook' | 'instagram' | 'justdial' | 'tradeindia' | 'other'
export interface BriefLink { kind: LinkKind; url: string }
export interface BriefSource { title: string; uri: string }
export interface BriefResult { person: string; company: string; starters: string[]; links: BriefLink[]; sources: BriefSource[]; suggestions: string }

export class BriefError extends Error {}

const FIELD_MAX = 300
const DOMAIN = /^[a-z0-9-]+(\.[a-z0-9-]+)*\.[a-z]{2,}$/i
const SCALARS = ['name', 'title', 'company', 'address', 'website', 'gstin'] as const

/** What the app sent, checked: strings only, trimmed and bounded; the name or the company is needed. Null when unusable. */
export function validBriefInput(v: unknown): BriefInput | null {
  if (!v || typeof v !== 'object') return null
  const o = v as Record<string, unknown>
  const out = { domains: [] as string[] } as BriefInput
  for (const k of SCALARS) {
    const x = o[k] ?? ''
    if (typeof x !== 'string') return null
    out[k] = x.trim().slice(0, FIELD_MAX)
  }
  if (o.domains !== undefined) {
    if (!Array.isArray(o.domains)) return null
    out.domains = o.domains.filter((d): d is string => typeof d === 'string' && d.length <= 100 && DOMAIN.test(d)).map((d) => d.toLowerCase()).slice(0, 3)
  }
  return out.name || out.company ? out : null
}

/** The instructions: facts from the search only, said plainly, and a short honest line when little is public. */
export function briefPrompt(i: BriefInput): string {
  const card = [
    ['Name', i.name], ['Title', i.title], ['Company', i.company], ['Address', i.address], ['Website', i.website],
    ['Email domain', i.domains.join(', ')], ['GSTIN', i.gstin],
  ].filter(([, v]) => v).map(([k, v]) => `${k}: ${v}`)
  return [
    'You research a business contact for a salesperson in India who is about to call or meet them. Use Google Search:',
    'search for the company (by name with the city, the website or email domain, and the GSTIN) and for this person at that company.',
    '',
    'From their business card:',
    ...card,
    '',
    'Reply with ONLY a JSON object, in this shape: {"person": string, "company": string, "starters": string[], "links": [{"kind": string, "url": string}]}',
    'person: 2 to 4 sentences of facts about this person at this company: their role, how long, anything public (interviews, associations, awards). If you find nothing specific about the person, write exactly: "Little public information found about this person."',
    'company: 2 to 5 sentences of facts: what they make or trade, where, since when, size, group companies, certifications, markets. If you find nothing, write exactly: "Little public information found about this company."',
    'starters: 2 or 3 short openers the salesperson could say, each tied to a fact you found (a product line, an expansion, a trade fair, a certification). With no facts found, 2 openers about their line of business, never invented facts.',
    'links: at most 5 pages from the search results that belong to this person or company. kind is one of linkedin, website, indiamart, facebook, instagram, justdial, tradeindia, other. Never guess or build a URL.',
    'Rules: only facts from the search results. If different companies share the name, use the one matching the city, website or GSTIN, and say so if unsure. No praise words (renowned, leading, innovative, key player, commitment to excellence). Plain Indian English.',
  ].join('\n')
}

export function buildBriefRequest(i: BriefInput) {
  return { contents: [{ role: 'user', parts: [{ text: briefPrompt(i) }] }], tools: [{ google_search: {} }], generationConfig: { temperature: 0.2 } }
}

/** "in.linkedin.com" from a URL; empty when it is not an http(s) URL. */
export function hostOf(url: string): string {
  try {
    const u = new URL(url)
    return u.protocol === 'https:' || u.protocol === 'http:' ? u.hostname.toLowerCase().replace(/^www\./, '') : ''
  } catch { return '' }
}

const clean = (s: unknown, max: number) => (typeof s === 'string' ? s.replace(/\s+/g, ' ').trim().slice(0, max) : '')
const KIND_BY_HOST: [string, LinkKind][] = [['linkedin.com', 'linkedin'], ['indiamart.com', 'indiamart'], ['facebook.com', 'facebook'], ['instagram.com', 'instagram'], ['justdial.com', 'justdial'], ['tradeindia.com', 'tradeindia']]
const onHost = (host: string, domain: string) => host === domain || host.endsWith('.' + domain)

/**
 * The model's links, kept only when the search actually visited that site (its domain is one of the sources). The kind
 * comes from the host, not the model; a LinkedIn link must be a person's or a company's page.
 */
export function checkLinks(raw: unknown[], sources: BriefSource[]): BriefLink[] {
  const searched = sources.map((s) => s.title.toLowerCase().replace(/^www\./, ''))
  const out: BriefLink[] = []
  for (const x of raw) {
    if (out.length >= 5 || !x || typeof x !== 'object') continue
    const { kind, url } = x as { kind?: unknown; url?: unknown }
    if (typeof url !== 'string' || url.length > 300) continue
    const host = hostOf(url)
    if (!host || !searched.some((d) => d && onHost(host, d))) continue
    const byHost = KIND_BY_HOST.find(([d]) => onHost(host, d))?.[1]
    if (byHost === 'linkedin' && !/linkedin\.com\/(in|company)\/[^/?#]+/i.test(url)) continue
    const k: LinkKind = byHost ?? (kind === 'website' ? 'website' : 'other')
    if (!out.some((l) => l.url === url)) out.push({ kind: k, url })
  }
  return out
}

/** Reads Gemini's grounded answer. The JSON may come inside prose or a code fence; a missing or empty answer throws. */
export function parseBriefResponse(json: unknown): BriefResult {
  const cand = (json as { candidates?: { content?: { parts?: { text?: unknown }[] }; groundingMetadata?: Record<string, any> }[] } | null)?.candidates?.[0]
  const text = (cand?.content?.parts ?? []).map((p) => (typeof p?.text === 'string' ? p.text : '')).join('')
  const a = text.indexOf('{'), b = text.lastIndexOf('}')
  if (a < 0 || b <= a) throw new BriefError('No answer')
  let o: Record<string, unknown>
  try { o = JSON.parse(text.slice(a, b + 1)) } catch { throw new BriefError('Unreadable answer') }
  const person = clean(o.person, 1200), company = clean(o.company, 1500)
  if (!person && !company) throw new BriefError('Empty answer')
  const starters = Array.isArray(o.starters) ? o.starters.map((s) => clean(s, 400)).filter(Boolean).slice(0, 3) : []
  const meta = cand?.groundingMetadata ?? {}
  const sources: BriefSource[] = []
  for (const c of Array.isArray(meta.groundingChunks) ? meta.groundingChunks : []) {
    const w = c?.web
    if (!w || typeof w.uri !== 'string' || !/^https:\/\//.test(w.uri)) continue
    const title = clean(w.title, 120) || hostOf(w.uri)
    if (!sources.some((s) => s.title === title) && sources.length < 10) sources.push({ title, uri: w.uri })
  }
  const rendered = meta.searchEntryPoint?.renderedContent
  return { person, company, starters, links: checkLinks(Array.isArray(o.links) ? o.links : [], sources), sources, suggestions: typeof rendered === 'string' ? rendered.slice(0, 20_000) : '' }
}
```

- [ ] **Step 4: Run** the test — Expected: PASS. Add `test/briefcore.test.mjs` to the `test` script in `package.json`.
- [ ] **Step 5: Commit** `git commit -m "Pulse Brief core: prompt, grounded request, lenient parse, links checked against the sources"`

### Task 3: Worker route `POST /v1/brief`

**Files:**
- Modify: `server/worker.ts` (generalise `checkQuota` with an RPC name; new `brief()` handler; route before the 404)
- Modify: `server/wrangler.toml` (comment on `BRIEF_MODEL`)
- Test: `server/test/worker.test.mjs`

**Interfaces:**
- Consumes: Task 2 exports.
- Produces: `POST /v1/brief` body `{ contact: BriefInput, auth: string }` → 200 `{ ...BriefResult, model }`; errors `{ error: { code, message } }` with codes `forbidden_origin` 403, `bad_request`/`bad_contact` 400, `sign_in` 401, `too_large` 413, `daily_limit`/`rate_limited`/`busy` 429, `upstream_unreachable`/`upstream_error`/`bad_output` 502.
- `checkQuota(token, env, fn = 'consume_scan')`

- [ ] **Step 1: Write the failing tests** (append):

```js
// ── Pulse Brief ──
const briefReq = (body, headers = {}) => new Request('https://api.test/v1/brief', { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: GOOD, 'cf-connecting-ip': `2.2.${Math.floor(Math.random() * 250)}.${Math.floor(Math.random() * 250)}`, ...headers }, body: JSON.stringify(body) })
const who = { name: 'Abhishek Jain', company: 'Vivacity Woven Sack Pvt. Ltd.', address: 'Surat' }
const briefOk = { candidates: [{ content: { parts: [{ text: 'Sure. ' + JSON.stringify({ person: 'Director.', company: 'Makes sacks.', starters: ['Hi'], links: [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }, { kind: 'website', url: 'https://guess.example' }] }) }] },
  groundingMetadata: { groundingChunks: [{ web: { title: 'linkedin.com', uri: 'https://vertexaisearch.cloud.google.com/r/1' } }], searchEntryPoint: { renderedContent: '<style></style><div>chips</div>' } } }] }
function mockBrief(consume) {
  return mockUpstream((url, init) => (String(url).startsWith('https://supa.test') ? consume(url, init) : new Response(JSON.stringify(briefOk))))
}

test('brief: signed in, counted with consume_brief, grounded with Google Search, links checked', async () => {
  const m = mockBrief(() => new Response(JSON.stringify([{ allowed: true, used: 1, day_limit: 10 }])))
  try {
    const res = await worker.fetch(briefReq({ contact: who, auth: token('b-1') }), env(SUPA))
    assert.equal(res.status, 200)
    const body = await res.json()
    assert.equal(body.person, 'Director.')
    assert.deepEqual(body.links, [{ kind: 'linkedin', url: 'https://www.linkedin.com/in/aj' }], 'the guessed site is dropped')
    assert.equal(body.suggestions, '<style></style><div>chips</div>')
    assert.equal(m.calls[0].url, 'https://supa.test/rest/v1/rpc/consume_brief')
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
    assert.match((await res.json()).error.message, /today's 10 fresh searches/)
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
    assert.match(m.calls.at(-1).url, /gemini-brief-x:generateContent/)
  } finally { m.restore() }
})
```

- [ ] **Step 2: Run** `npm run server:test` — Expected: the new tests FAIL (404).
- [ ] **Step 3: Implement.** In `server/worker.ts`:
  - import `{ BriefError, buildBriefRequest, parseBriefResponse, validBriefInput } from '../shared/brief-core.ts'`
  - `Env` gains `BRIEF_MODEL?: string` (comment: "The model for Pulse Brief; falls back to GEMINI_MODEL").
  - `checkQuota(token: unknown, env: Env, fn: 'consume_scan' | 'consume_brief' = 'consume_scan')`, URL `.../rest/v1/rpc/${fn}`.
  - Add, before the `/v1/extract` 404 line: `if (url.pathname === '/v1/brief' && req.method === 'POST') return brief(req, env, origin)`
  - The handler:

```ts
const BRIEF_BODY_MAX = 16_384

/** Pulse Brief: a web-searched brief on one contact. Signed-in only, with its own daily limit; nothing is stored here. */
async function brief(req: Request, env: Env, origin: string | null): Promise<Response> {
  if (!originAllowed(origin, env)) return fail(403, 'forbidden_origin', 'This origin is not allowed.', null)
  if (!env.GEMINI_API_KEY) return fail(500, 'not_configured', 'The service is not configured.', origin)
  if (Number(req.headers.get('content-length') ?? 0) > BRIEF_BODY_MAX) return fail(413, 'too_large', 'Request too large.', origin)
  let body: { contact?: unknown; auth?: unknown }
  try { body = await req.json() } catch { return fail(400, 'bad_request', 'Invalid request.', origin) }
  const input = validBriefInput(body?.contact)
  if (!input) return fail(400, 'bad_contact', "Add the contact's name or company first.", origin)
  if (typeof body.auth !== 'string' || !body.auth) return fail(401, 'sign_in', 'Sign in to use Pulse Brief.', origin)

  // Each fresh brief is a paid Google search: counted per account. A quota outage falls back to the per-IP brake.
  const quota = await checkQuota(body.auth, env, 'consume_brief')
  if (quota.kind === 'over') return fail(429, 'daily_limit', `You've used today's ${quota.limit} fresh searches. Saved briefs still open. Resets at 5:30 am.`, origin)
  const wait = checkRate(quota.kind === 'account' ? `brief:${quota.userId}` : `brief-ip:${req.headers.get('cf-connecting-ip') ?? 'local'}`)
  if (wait) return fail(429, 'rate_limited', `Too many briefs. Try again in ${Math.ceil(wait / 60)} min.`, origin, { 'Retry-After': String(wait) })

  const model = env.BRIEF_MODEL || env.GEMINI_MODEL || DEFAULT_MODEL
  let upstream: Response
  try {
    upstream = await fetch(`${env.GEMINI_BASE ?? UPSTREAM}/models/${encodeURIComponent(model)}:generateContent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'x-goog-api-key': env.GEMINI_API_KEY },
      body: JSON.stringify(buildBriefRequest(input)),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    })
  } catch {
    return fail(502, 'upstream_unreachable', 'The service is unavailable. Try again.', origin)
  }
  if (upstream.status === 429) return fail(429, 'busy', 'The service is busy. Try again in a moment.', origin, { 'Retry-After': '20' })
  if (!upstream.ok) return fail(502, 'upstream_error', "Couldn't make the brief. Try again.", origin)
  try {
    return json({ ...parseBriefResponse(await upstream.json()), model }, 200, origin)
  } catch (e) {
    return fail(502, 'bad_output', e instanceof BriefError ? "Couldn't make the brief. Try again." : 'Unexpected response.', origin)
  }
}
```

  - `wrangler.toml`: under `GEMINI_MODEL`, a comment line: `# BRIEF_MODEL = "..."  # optional: the model for Pulse Brief (Google Search grounding); defaults to GEMINI_MODEL`.
- [ ] **Step 4: Run** `npm run server:test` — Expected: PASS (all).
- [ ] **Step 5: Commit** `git commit -m "Server: POST /v1/brief, signed-in, its own daily limit, Gemini with Google Search"`

### Task 4: The phone's brief library

**Files:**
- Create: `src/lib/brief.ts`
- Modify: `src/lib/types.ts` (add `brief?: Brief` to `Contact`)
- Test: `test/brief.test.mjs` (add to `npm test`)

**Interfaces:**
- Consumes: Task 2 types.
- Produces:
  - `interface Brief extends BriefResult { at: number; model: string }`
  - `briefInput(c: Contact): BriefInput`, `canBrief(c): boolean`
  - `freshBrief(c, now?): Brief | undefined` (undefined when older than 2 years), `BRIEF_KEEP_MS`
  - `type Section = 'person' | 'company' | 'starters'`, `briefText(c, b, only?: Section): string`
  - `linkLabel(l: BriefLink): string`, `hasLink(c, url): boolean`, `addLink(c, l): Contact`
  - `class BriefFailure extends Error { code: 'sign_in' | 'daily_limit' | 'offline' | 'failed' }`
  - `requestBrief(c, deps: { url: string; token: string | undefined; online: boolean; fetch: typeof fetch; now?: number }): Promise<Brief>`
  - `runBrief(key, start): Promise<Brief>`, `pendingBrief(key): Promise<Brief> | undefined`

- [ ] **Step 1: Write the failing tests**:

```js
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
})
test('shared text: all sections, or one, with the heading line, sources and the credit', () => {
  const all = briefText(person({ brief }), brief)
  assert.equal(all, [
    '*Abhishek Jain*, Vivacity Woven Sack Pvt. Ltd., Surat',
    '*About the person*\nDirector at Vivacity.',
    '*About the company*\nMakes woven sacks.',
    '*Conversation starters*\n• Ask about the new plant.\n• Ask about exports.',
    'Sources: indiamart.com, vivacitygroup.in\nvia CardPulse Pulse Brief',
  ].join('\n\n'))
  const one = briefText(person(), brief, 'company')
  assert.ok(one.includes('*About the company*') && !one.includes('About the person'))
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
  let sent
  const spy = async (u, init) => { sent = { u, body: JSON.parse(init.body) }; return ok() }
  const b = await requestBrief(person(), { url: 'https://api', token: 't', online: true, fetch: spy, now: 42 })
  assert.equal(b.at, 42); assert.equal(b.model, 'gm'); assert.equal(sent.u, 'https://api/v1/brief'); assert.equal(sent.body.auth, 't')
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
```

- [ ] **Step 2: Run** `node --test test/brief.test.mjs` — Expected: FAIL.
- [ ] **Step 3: Implement** `src/lib/brief.ts`:

```ts
import type { BriefInput, BriefLink, BriefResult } from '../../shared/brief-core.ts'
import { splitAddress } from './address.ts'
import type { Contact } from './types.ts'

// Pulse Brief on the phone: what is sent, the call, the text that is copied or shared, and the links added to a contact.

/** A brief as kept on the contact: the server's answer, when it was made and by which model. */
export interface Brief extends BriefResult { at: number; model: string }
export type Section = 'person' | 'company' | 'starters'

/** Google's terms let the user keep their own grounded results for up to two years. */
export const BRIEF_KEEP_MS = 2 * 365 * 86_400_000

const FREE_MAIL = new Set(['gmail.com', 'googlemail.com', 'yahoo.com', 'yahoo.co.in', 'ymail.com', 'rediffmail.com', 'hotmail.com', 'outlook.com', 'live.com', 'icloud.com', 'me.com', 'aol.com', 'protonmail.com', 'proton.me', 'zohomail.in'])

/** What the server needs to find this person: who they are on the card. Never phones, notes, tags or the log. */
export function briefInput(c: Contact): BriefInput {
  const domains = [...new Set(c.emails.map((e) => e.split('@')[1]?.trim().toLowerCase() ?? '').filter((d) => d && !FREE_MAIL.has(d)))].slice(0, 3)
  return { name: c.name.trim(), title: c.title.trim(), company: c.company.trim(), address: c.address.trim(), website: c.website.trim(), domains, gstin: c.gstin.trim() }
}
export const canBrief = (c: Contact): boolean => !!(c.name.trim() || c.company.trim())

/** The contact's brief, unless it is past the two years it may be kept. */
export const freshBrief = (c: Contact, now: number = Date.now()): Brief | undefined => (c.brief && now - c.brief.at < BRIEF_KEEP_MS ? c.brief : undefined)

/* ---------- the text that is copied and shared ---------- */

const HEADING: Record<Section, string> = { person: 'About the person', company: 'About the company', starters: 'Conversation starters' }
const body = (b: Brief, s: Section) => (s === 'starters' ? b.starters.map((x) => `• ${x}`).join('\n') : b[s])

/** WhatsApp-friendly plain text: who, the sections (all, or one), the sources, and where it came from. */
export function briefText(c: Contact, b: Brief, only?: Section): string {
  const city = splitAddress(c.address).city
  const head = `*${c.name.trim() || c.company.trim()}*${[c.name.trim() ? c.company.trim() : '', city].filter(Boolean).map((x) => `, ${x}`).join('')}`
  const sections = (only ? [only] : (['person', 'company', 'starters'] as Section[])).filter((s) => body(b, s)).map((s) => `*${HEADING[s]}*\n${body(b, s)}`)
  const sources = [...new Set(b.sources.map((s) => s.title))].slice(0, 5)
  return [head, ...sections, `${sources.length ? `Sources: ${sources.join(', ')}\n` : ''}via CardPulse Pulse Brief`].join('\n\n')
}

/* ---------- links found by the search ---------- */

const LABEL: Record<BriefLink['kind'], string> = { linkedin: 'LinkedIn profile', website: 'Website', indiamart: 'IndiaMART', facebook: 'Facebook', instagram: 'Instagram', justdial: 'Justdial', tradeindia: 'TradeIndia', other: 'Web page' }
export const linkLabel = (l: BriefLink): string => (l.kind === 'linkedin' && /\/company\//i.test(l.url) ? 'LinkedIn page' : LABEL[l.kind])
const same = (u: string) => u.trim().toLowerCase().replace(/^https?:\/\//, '').replace(/^www\./, '').replace(/\/+$/, '')
export const hasLink = (c: Contact, url: string): boolean => [c.website, ...c.social].some((x) => x && same(x) === same(url))

/** A found link added to the contact: a website fills an empty website field, anything else joins the social links. */
export function addLink(c: Contact, l: BriefLink): Contact {
  if (hasLink(c, l.url)) return c
  if (l.kind === 'website' && !c.website.trim()) return { ...c, website: l.url }
  return { ...c, social: [...c.social, l.url] }
}

/* ---------- the call ---------- */

export type FailureCode = 'sign_in' | 'daily_limit' | 'offline' | 'failed'
export class BriefFailure extends Error {
  constructor(public code: FailureCode, message: string) { super(message) }
}
const MESSAGE: Record<FailureCode, string> = {
  sign_in: 'Sign in to use Pulse Brief.', daily_limit: "You've used today's 10 fresh searches. Saved briefs still open. Resets at 5:30 am.",
  offline: 'Pulse Brief needs a connection.', failed: "Couldn't make the brief. Try again.",
}

/** Asks the server for a brief. Every failure becomes a BriefFailure the page can show as it is. */
export async function requestBrief(c: Contact, deps: { url: string; token: string | undefined; online: boolean; fetch: typeof fetch; now?: number }): Promise<Brief> {
  if (!deps.online) throw new BriefFailure('offline', MESSAGE.offline)
  if (!deps.token) throw new BriefFailure('sign_in', MESSAGE.sign_in)
  let res: Response
  try {
    res = await deps.fetch(`${deps.url}/v1/brief`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contact: briefInput(c), auth: deps.token }), signal: AbortSignal.timeout(60_000) })
  } catch { throw new BriefFailure('failed', MESSAGE.failed) }
  const json = await res.json().catch(() => ({})) as Partial<Brief> & { error?: { code?: string; message?: string } }
  if (!res.ok) {
    const code: FailureCode = json.error?.code === 'daily_limit' ? 'daily_limit' : json.error?.code === 'sign_in' ? 'sign_in' : 'failed'
    throw new BriefFailure(code, code === 'failed' ? MESSAGE.failed : json.error?.message || MESSAGE[code])
  }
  return {
    person: json.person ?? '', company: json.company ?? '', starters: json.starters ?? [], links: json.links ?? [], sources: json.sources ?? [],
    suggestions: json.suggestions ?? '', model: json.model ?? '', at: deps.now ?? Date.now(),
  }
}

/* ---------- one search per contact, surviving the page being closed ---------- */

const pending = new Map<string, Promise<Brief>>()
/** Starts a search for `key` (card id and person), or joins the one already running. */
export function runBrief(key: string, start: () => Promise<Brief>): Promise<Brief> {
  let p = pending.get(key)
  if (!p) { p = start().finally(() => pending.delete(key)); pending.set(key, p) }
  return p
}
export const pendingBrief = (key: string): Promise<Brief> | undefined => pending.get(key)
```

  - `src/lib/types.ts`: `import type { Brief } from './brief.ts'` and in `Contact`, after `log`: `/** Pulse Brief: researched on the web; kept on this contact only (synced), never exported. */ brief?: Brief`
- [ ] **Step 4: Run** the test and `npx tsc -b` — Expected: PASS, no type errors. Add `test/brief.test.mjs` to `npm test`.
- [ ] **Step 5: Commit** `git commit -m "Pulse Brief on the phone: what is sent, shared text, links, the call"`

### Task 5: The Pulse Brief page and the contact page buttons

**Files:**
- Create: `src/components/BriefPage.tsx`, `src/components/brief.css`
- Modify: `src/components/Icon.tsx` (add `copy`), `src/components/ContactDetail.tsx`, `src/App.tsx`

**Interfaces:**
- Consumes: Task 4.
- Produces: `BriefPage({ contact, briefKey, onSave, onAddLink, onClose })`; `ContactDetail` new props `onBrief(idx: number, name: string, b: Brief): Promise<void>`, `myCards: MyCard[]`, `onMakeCard(): void` (the last two used in Task 6).

- [ ] **Step 1: `Icon.tsx`** — add `copy: 'M9 9h11v11H9z M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1'`.
- [ ] **Step 2: `BriefPage.tsx`** — full-screen page:
  - `useBackClose(true, onClose)`; header: back, "Pulse Brief" with the contact's name under it, ⋮ opening a `Sheet` with Copy all / Share all / Refresh.
  - State: `busy` (a search is running), `error: BriefFailure | null`, `step` (caption index 0..2, advanced at 4 s and 9 s while busy), `arrived` (true once, to play the fade-up).
  - On mount: join `pendingBrief(briefKey)` if any; else if `!freshBrief(contact)` start a search.
  - `start()` = `runBrief(briefKey, async () => requestBrief(contact, { url: API_URL, token: await accessToken(), online: navigator.onLine, fetch: (...a) => fetch(...a) }))`, then `onSave(b)`; errors set `error` only while mounted (`alive` ref).
  - `accessToken()` = `supabase ? (await supabase.auth.getSession().catch(() => null))?.data.session?.access_token : undefined`.
  - Cards: person, company, starters (a `<ul>`), each with Share and Copy icon buttons and a "Sources:" line of links (`target="_blank" rel="noreferrer"`).
  - Suggestions: `<iframe className="brief-suggest" sandbox="allow-popups allow-popups-to-escape-sandbox" srcDoc={'<base target="_blank">' + b.suggestions} title="Google Search suggestions" />`.
  - Add to profile: `b.links` rows with `linkLabel`, host, and a `+` / `✓` (`hasLink(contact, url)`), calling `onAddLink(l)`.
  - Footer: `Found on the web on {date} with Google Search. Public information; check before relying on it.`
  - Errors: `sign_in` shows a Sign in button (`signInWithGoogle`); others show "Try again" when no brief exists; with a brief, a short banner above it.
  - Copy: `navigator.clipboard.writeText`, flash "Copied."; Share: `shareNav().share({ title, text })` (AbortError ignored), else copy.
- [ ] **Step 3: `brief.css`** — `.brief-page` fixed full screen on `--board`; `.brief-pulse` with two `::before/::after` rings animating `scale(1)→scale(2.4)` and `opacity .5→0` over 2.4 s, staggered 1.2 s; `.brief-cap` fading between captions; `.brief-skel` lines with a `linear-gradient` shimmer moving `background-position` over 1.4 s; `.brief-card.arrive` `fadeUp` 320 ms with `animation-delay: calc(var(--i) * 80ms)`; `@media (prefers-reduced-motion: reduce)` turns every animation off. Colours only from tokens.
- [ ] **Step 4: `ContactDetail.tsx`** — two buttons between the details list and the adders: `✦ Pulse Brief` (disabled when `!canBrief(c)`) and `Share my card` (Task 6), class `brief-actions`. `briefOpen` state renders `<BriefPage>` with `briefKey = card.id + ':' + idx`; `onSave` = `saveBrief(idx, c.name, b)`: if the page is still mounted, replace the contact at `idx` in `contactsRef.current` (only if its name still equals `name`) and `onSave` the card; otherwise call `props.onBrief(idx, name, b)`. `onAddLink` = `replace(addLink(c, l))`. On open, a stale brief (past 2 years) is dropped with `replace`.
- [ ] **Step 5: `App.tsx`** — pass `onBrief={async (idx, name, b) => { const fresh = await getCard(openCard.id); const p = fresh?.corrected?.[idx]; if (!fresh || !p || p.name !== name) return; await putCard({ ...fresh, corrected: fresh.corrected!.map((x, j) => (j === idx ? { ...x, brief: b } : x)) }); await refresh() }}`, plus `myCards` and `onMakeCard={() => setEditingCard('new')}`.
- [ ] **Step 6: Run** `npx tsc -b && npm test && npm run build` — Expected: clean.
- [ ] **Step 7: Commit** `git commit -m "Pulse Brief page: pulse while searching, three cards, sources, Google suggestions, add to profile"`

### Task 6: Share my card to the contact's WhatsApp

**Files:**
- Create: `android/app/src/main/java/in/cardpulse/app/WhatsAppCardPlugin.java`, `src/lib/sharecard.ts`
- Modify: `MainActivity.java` (register), `AndroidManifest.xml` (`<queries>`), `src/lib/platform.ts` (`Native.waApps?`, `Native.waSend?`), `src/lib/native.ts`, `src/components/ContactDetail.tsx`
- Test: `test/sharecard.test.mjs` (add to `npm test`)

**Interfaces:**
- Produces: `type WaApp = 'com.whatsapp' | 'com.whatsapp.w4b'`; `waJid(c: Contact): string | null`; `sendCardTo(c: Contact, card: MyCard, deps: SendDeps): Promise<'sent' | 'cancelled' | 'fallback'>` with
  `interface SendDeps { native: Pick<Native, 'writeCache' | 'waApps' | 'waSend'> | null; remembered(): WaApp | undefined; remember(a: WaApp): void; ask(apps: WaApp[]): Promise<WaApp | null>; fallback(): Promise<void> }`.
- Native: `waApps(): Promise<string[]>`; `waSend({ uri, jid, pkg }): Promise<void>` (rejects when WhatsApp refuses).

- [ ] **Step 1: Write the failing tests**:

```js
// Run: node --test test/sharecard.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { sendCardTo, waJid } from '../src/lib/sharecard.ts'

const person = (o = {}) => ({ name: 'Abhishek', title: '', company: '', phones: ['99740 33339'], emails: [], website: '', address: '', gstin: '', social: [], ...o })
const card = { id: 'm1', name: 'Prasenjit Sharma', title: '', company: 'CardPulse', phones: ['+91 98240 22893'], emails: [], website: '', address: '', social: [] }
function deps(o = {}) {
  const calls = { sent: [], asked: 0, fallback: 0, remembered: [] }
  const native = { writeCache: async (name) => `file:///cache/${name}`, waApps: async () => ['com.whatsapp'], waSend: async (x) => { calls.sent.push(x) }, ...o.native }
  return { calls, d: { native: o.native === null ? null : native, remembered: () => o.remembered, remember: (a) => calls.remembered.push(a), ask: async () => { calls.asked++; return o.pick ?? null }, fallback: async () => { calls.fallback++ } } }
}

test('the number: main WhatsApp-able number, 91 in front of ten digits; landlines have none', () => {
  assert.equal(waJid(person()), '919974033339')
  assert.equal(waJid(person({ phones: ['0261 2345678'] })), null)
})
test('one WhatsApp: the vCard goes straight into the chat, alone', async () => {
  const { calls, d } = deps()
  assert.equal(await sendCardTo(person(), card, d), 'sent')
  assert.deepEqual(calls.sent, [{ uri: 'file:///cache/Prasenjit-Sharma-card.vcf', jid: '919974033339', pkg: 'com.whatsapp' }])
})
test('both apps: asks once and remembers; a remembered choice is used without asking', async () => {
  let x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] }, pick: 'com.whatsapp.w4b' })
  assert.equal(await sendCardTo(person(), card, x.d), 'sent')
  assert.equal(x.calls.asked, 1); assert.deepEqual(x.calls.remembered, ['com.whatsapp.w4b']); assert.equal(x.calls.sent[0].pkg, 'com.whatsapp.w4b')
  x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] }, remembered: 'com.whatsapp' })
  await sendCardTo(person(), card, x.d)
  assert.equal(x.calls.asked, 0); assert.equal(x.calls.sent[0].pkg, 'com.whatsapp')
  x = deps({ native: { waApps: async () => ['com.whatsapp', 'com.whatsapp.w4b'] } })
  assert.equal(await sendCardTo(person(), card, x.d), 'cancelled', 'closing the question sends nothing')
})
test('the share sheet instead: no number, no WhatsApp, a refusal, or not the app', async () => {
  for (const [c, o] of [[person({ phones: ['0261 2345678'] }), {}], [person(), { native: { waApps: async () => [] } }], [person(), { native: { waSend: async () => { throw new Error('refused') } } }], [person(), { native: null }]]) {
    const { calls, d } = deps(o)
    assert.equal(await sendCardTo(c, card, d), 'fallback')
    assert.equal(calls.fallback, 1)
  }
})
```

- [ ] **Step 2: Run** — Expected: FAIL.
- [ ] **Step 3: Implement `src/lib/sharecard.ts`**:

```ts
import { waNumber } from './actions.ts'
import { buildCardVcf } from './cardvcf.ts'
import { cardFileName } from './cardshare.ts'
import type { MyCard } from './mycards.ts'
import { whatsAppNumber } from './phones.ts'
import { cacheName, type Native } from './platform.ts'
import type { Contact } from './types.ts'

// "Share my card" from a contact: the user's own vCard, straight into this person's WhatsApp chat.

export type WaApp = 'com.whatsapp' | 'com.whatsapp.w4b'
const APPS: WaApp[] = ['com.whatsapp', 'com.whatsapp.w4b']

/** The contact's WhatsApp number as WhatsApp wants it (country code, digits only), or null when none can take WhatsApp. */
export function waJid(c: Contact): string | null {
  const n = whatsAppNumber(c)
  return n ? waNumber(n) : null
}

export interface SendDeps {
  native: Pick<Native, 'writeCache' | 'waApps' | 'waSend'> | null
  remembered(): WaApp | undefined
  remember(a: WaApp): void
  ask(apps: WaApp[]): Promise<WaApp | null>
  fallback(): Promise<void>
}

/**
 * Puts the vCard into the contact's chat, alone (text beside a vCard breaks it in WhatsApp). With both WhatsApp and
 * WhatsApp Business, the user picks once. Anything that stops the hand-off falls back to the share sheet.
 */
export async function sendCardTo(c: Contact, card: MyCard, deps: SendDeps): Promise<'sent' | 'cancelled' | 'fallback'> {
  const jid = waJid(c), n = deps.native
  const fallback = async () => { await deps.fallback(); return 'fallback' as const }
  if (!jid || !n?.waApps || !n.waSend) return fallback()
  const apps = (await n.waApps().catch(() => [] as string[])).filter((a): a is WaApp => APPS.includes(a as WaApp))
  if (!apps.length) return fallback()
  let app: WaApp | null = apps.length === 1 ? apps[0]! : (apps.includes(deps.remembered()!) ? deps.remembered()! : null)
  if (!app) {
    app = await deps.ask(apps)
    if (!app) return 'cancelled'
    deps.remember(app)
  }
  try {
    const uri = await n.writeCache(cacheName(cardFileName(card, 'vcf')), new Blob([buildCardVcf(card).text], { type: 'text/x-vcard' }))
    await n.waSend({ uri, jid, pkg: app })
    return 'sent'
  } catch { return fallback() }
}
```

- [ ] **Step 4: Native.** `platform.ts` `Native` gains:

```ts
  /** WhatsApp apps installed: 'com.whatsapp', 'com.whatsapp.w4b'. */
  waApps?(): Promise<string[]>
  /** Opens a WhatsApp chat with this number (jid digits) and the file ready to send. Rejects when WhatsApp refuses. */
  waSend?(o: { uri: string; jid: string; pkg: string }): Promise<void>
```

`native.ts`: `const WhatsAppCard = registerPlugin<{ installed(): Promise<{ apps: string[] }>; send(o: { uri: string; jid: string; pkg: string }): Promise<void> }>('WhatsAppCard')`, and `waApps: async () => (await WhatsAppCard.installed()).apps, waSend: async (o) => { await WhatsAppCard.send(o) }`.

`WhatsAppCardPlugin.java`:

```java
package in.cardpulse.app;

import android.content.ActivityNotFoundException;
import android.content.ClipData;
import android.content.Intent;
import android.content.pm.PackageManager;
import android.net.Uri;
import androidx.core.content.FileProvider;
import com.getcapacitor.JSArray;
import com.getcapacitor.JSObject;
import com.getcapacitor.Plugin;
import com.getcapacitor.PluginCall;
import com.getcapacitor.PluginMethod;
import com.getcapacitor.annotation.CapacitorPlugin;
import java.io.File;

/**
 * "Share my card" from a contact: hands the user's vCard to WhatsApp with the contact's number, so WhatsApp opens that
 * chat with the file ready to send. The "jid" extra is not documented by WhatsApp, but is widely used; when WhatsApp
 * refuses, the app falls back to the share sheet.
 */
@CapacitorPlugin(name = "WhatsAppCard")
public class WhatsAppCardPlugin extends Plugin {
    private static final String[] APPS = { "com.whatsapp", "com.whatsapp.w4b" };

    @PluginMethod
    public void installed(PluginCall call) {
        PackageManager pm = getContext().getPackageManager();
        JSArray apps = new JSArray();
        for (String p : APPS) {
            try { pm.getPackageInfo(p, 0); apps.put(p); } catch (PackageManager.NameNotFoundException ignored) { }
        }
        JSObject out = new JSObject();
        out.put("apps", apps);
        call.resolve(out);
    }

    @PluginMethod
    public void send(PluginCall call) {
        String uri = call.getString("uri"), jid = call.getString("jid"), pkg = call.getString("pkg");
        if (uri == null || jid == null || pkg == null || !jid.matches("\\d{8,15}")) { call.reject("Missing or bad details"); return; }
        Uri content;
        try {
            File file = new File(Uri.parse(uri).getPath());
            content = FileProvider.getUriForFile(getContext(), getContext().getPackageName() + ".fileprovider", file);
        } catch (Exception e) { call.reject("Could not read the card file", e); return; }
        Intent intent = new Intent(Intent.ACTION_SEND);
        intent.setType("text/x-vcard");
        intent.putExtra(Intent.EXTRA_STREAM, content);
        intent.setClipData(ClipData.newRawUri("", content));
        intent.putExtra("jid", jid + "@s.whatsapp.net");
        intent.setPackage(pkg);
        intent.addFlags(Intent.FLAG_GRANT_READ_URI_PERMISSION);
        try {
            getActivity().startActivity(intent);
            call.resolve();
        } catch (ActivityNotFoundException e) {
            call.reject("WhatsApp is not installed", "NO_WHATSAPP");
        }
    }
}
```

`MainActivity`: `registerPlugin(WhatsAppCardPlugin.class);`. Manifest, before `<application>`:

```xml
    <!-- Share my card checks which WhatsApp apps are installed (Android 11 package visibility) -->
    <queries>
        <package android:name="com.whatsapp" />
        <package android:name="com.whatsapp.w4b" />
    </queries>
```

- [ ] **Step 5: UI in `ContactDetail.tsx`.** The `Share my card` button: no cards → `onMakeCard()`; one → `send(myCards[0])`; several → a `Sheet` "Which card?" listing card names. `send(card)` calls `sendCardTo(c, card, { native: getNative(), remembered, remember, ask, fallback })` where `remembered/remember` read and write `localStorage['cardpulse.waApp']` (in try/catch), `ask` opens a `Sheet` "Send with" (WhatsApp / WhatsApp Business) resolved by a promise held in state, and `fallback` runs `shareVcf(cardFileName(card, 'vcf'), buildCardVcf(card).text, card.name, undefined, browserEnv(), false)` with `setFlash('Saved as a file. Open it to add the contact.')` when it downloads. `noteShare(card.id, 'file')` unless cancelled.
- [ ] **Step 6: Run** `npx tsc -b && npm test && npm run build:android` — Expected: all pass; `BUILD SUCCESSFUL`.
- [ ] **Step 7: Commit** `git commit -m "Share my card: the vCard straight into the contact's WhatsApp chat, share sheet as the fallback"`

### Task 7: Privacy policy, deploy, final build

**Files:** `public/privacy.html`

- [ ] **Step 1:** Add under "With an account": `<li><strong>Pulse Brief</strong> (signed in): the person's name, title, company, address, website, email domain and GSTIN from the card (never phone numbers or your notes) go through our server to Google's Gemini API, which searches Google to write the brief. We count how many briefs you make each day. The brief is kept with that contact on your phones (and your account, if sync is on) and is never shown to other users.</li>`; update "Last updated" to 29 September 2026.
- [ ] **Step 2:** `npm test && npm run test:sync && npm run test:db && npm run server:test && npm run build` — all pass.
- [ ] **Step 3:** Deploy the Worker (`npm run server:deploy`) — additive route; without migration 0003 the quota check falls back to the per-IP brake, so briefs work at once. Smoke test: `curl -s -X POST https://cardpulse-api.cardpulse-app.workers.dev/v1/brief -H 'Origin: https://localhost' -H 'Content-Type: application/json' -d '{"contact":{"company":"X"}}'` → 401 `sign_in`.
- [ ] **Step 4:** `npm run build:android` — `BUILD SUCCESSFUL`.
- [ ] **Step 5: Commit** `git commit -m "Privacy policy: Pulse Brief"`
- [ ] **Step 6:** Tell the user: run `supabase/migrations/0003_brief_quota.sql` in the Supabase SQL editor to switch on the per-account limit; install the APK; checklist from the spec's Testing section.
