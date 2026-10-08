# Read and Brief Brakes Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A failed read no longer snowballs into "Too many scans": only answered Gemini calls use up the brake, a photo Gemini rejects isn't retried, and the server's brake is waited out instead of failing the card.

**Architecture:** In the Worker, `checkRate` splits into `rateWait` (look) and `rateHit` (record after Gemini answered 200). Gemini's 400 on a read becomes a 422 `unreadable`, and each refusal logs its reason. In the app, `GeminiError` carries the server's Retry-After, `withRetry` stops at our own brake, `classifyFailure` knows `rate_limited` and `unreadable`, and a new pure `nextRetry` decides when to try again and whether that try counts as one of the card's attempts.

**Tech Stack:** Cloudflare Worker (TypeScript), React app, Node test runner.

**Spec:** `docs/superpowers/specs/2026-10-09-read-brakes-design.md`

**Deviation, on purpose:** Briefs keep 502 for a Gemini rejection rather than 422 `brief_failed`. A Brief is never retried by itself, and the app already shows "Couldn't make the brief. Try again." for it. The Brief route only gets "record after success" and refusal logging.

## Global Constraints

- The brake stays 30 per 10 minutes per account (per IP when there's no account), with reads and Briefs apart.
- Only Gemini 400 becomes 422 `unreadable`. A 401, 402 or 403 from Gemini (key, payment or access) stays 502 `upstream_error`: that's our problem, not the photo's.
- Refusal log lines carry no personal data: `refused <read|brief> <code> who=<first 8 chars of the brake key> wait=<seconds>`.
- Deploying the Worker is outward-facing: ask the user first, or let them run `npm run server:deploy`.

## Review Focus

- A Gemini 402 (payment) or 401 reported to the user as "Could not read that photo". It must stay a service problem (Task 1 test).
- Concurrent reads slipping past the brake now that hits are recorded after the call. Acceptable: at most the requests in flight. Not tested.
- The app waiting forever if the Worker sends no Retry-After with `rate_limited`. Fall back to 60 s (Task 2 test).
- A card stuck "pending" because a brake wait never counts as an attempt. The server eventually allows the read, and the daily limit is non-transient (existing test).
- `withRetry` still retrying `rate_limited` within one attempt (Task 2 checks the code path by build and review).

---

### Task 1: The Worker records hits after success, says 422 for a rejected photo, and logs refusals

**Files:**
- Modify: `server/worker.ts` (`checkRate` at line 42; the Brief route around line 217; the read route around line 313)
- Test: `server/test/worker.test.mjs`

- [ ] **Step 1: Failing tests** (append to `server/test/worker.test.mjs`; `rateWait` and `rateHit` are added to its import)

```js
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
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test server/test/worker.test.mjs`
Expected: FAIL. `rateWait` isn't exported; reads get 502, not 422.

- [ ] **Step 3: Implement**

Replace `checkRate` with:

```ts
const recentHits = (key: string, now: number) => (hits.get(key) ?? []).filter((t) => now - t < WINDOW_MS)
/** Seconds until `key` may call again, or 0. Only looks: a call is recorded (rateHit) once Gemini has answered it. */
export function rateWait(key: string, now = Date.now()): number {
  const recent = recentHits(key, now)
  hits.set(key, recent)
  return recent.length >= MAX_PER_WINDOW ? Math.ceil((WINDOW_MS - (now - recent[0]!)) / 1000) : 0
}
/** Records one answered call. Failed and rejected calls are not recorded, so they never use up the brake. */
export function rateHit(key: string, now = Date.now()): void {
  const recent = recentHits(key, now)
  recent.push(now)
  hits.set(key, recent)
  if (hits.size > 5000) for (const [k, v] of hits) if (!v.some((t) => now - t < WINDOW_MS)) hits.delete(k)
}
/** Look, and record when allowed (kept for the per-IP test). */
export function checkRate(key: string, now = Date.now()): number {
  const wait = rateWait(key, now)
  if (!wait) rateHit(key, now)
  return wait
}
/** One line per refusal, so `wrangler tail` says which limit answered. No personal data. */
const refused = (route: 'read' | 'brief', code: string, who: string, wait = 0) => console.log(`refused ${route} ${code} who=${who.slice(0, 8)} wait=${wait}`)
```

The **read route**:
- Compute `const rateKey = use.kind === 'account' ? \`account:${use.userId}\` : req.headers.get('cf-connecting-ip') ?? 'local'`.
- Replace `checkRate(...)` with `rateWait(rateKey)`.
- Call `refused('read', code, rateKey, wait)` before returning each of `sign_in` (both), `no_cards`, `daily_limit` and `rate_limited`.
- After the upstream-429 check, add:

```ts
    // Gemini refusing this photo (400) is about the photo: not worth retrying. Key, payment or access trouble stays ours.
    if (upstream.status === 400) return fail(422, 'unreadable', 'Could not read that photo. Try a clearer one.', origin)
```

- Call `rateHit(rateKey)` right after `if (!upstream.ok) return fail(502, …)`, so only an answered call counts.

The **Brief route**:
- Compute `const rateKey = use.kind === 'account' ? \`brief:${use.userId}\` : \`brief-ip:${…}\``.
- Use `rateWait(rateKey)`, and call `refused('brief', …)` on each refusal (`sign_in`, `pro_only`, `no_briefs`, `daily_limit`, `rate_limited`).
- Call `rateHit(rateKey)` after the first upstream call is ok.

- [ ] **Step 4: Run the Worker tests**

Run: `npm run server:test`
Expected: all PASS, the old `checkRate` test included.

- [ ] **Step 5: Commit**

```bash
git add server/worker.ts server/test/worker.test.mjs
git commit -m "Worker brakes count only answered calls: a read Gemini rejects is 422 unreadable and leaves the brake alone; key or payment trouble stays a service error; every refusal logs which limit answered"
```

---

### Task 2: The app waits out the brake and doesn't retry a rejected photo

**Files:**
- Modify: `shared/extract-core.ts` (`GeminiError` gains `retryAfter`), `src/lib/gemini.ts` (`withRetry`), `src/lib/errors.ts`, `src/App.tsx` (lines 63-64 and 266-275)
- Create: `src/lib/retry.ts`
- Test: `test/errors.test.mjs`, `test/retry.test.mjs` (new, added to the `test` script)

- [ ] **Step 1: Failing tests**

Append to `test/errors.test.mjs`:

```js
test('our brake waits the minutes it states and is not the card failing', () => {
  const e = Object.assign(new Error('Too many scans. Try again in 9 min.'), { status: 429, code: 'rate_limited', retryAfter: 540 })
  const f = classifyFailure(e)
  assert.equal(f.transient, true)
  assert.equal(f.retryAfterMs, 540_000)
  assert.match(f.message, /few minutes/i)
  assert.equal(classifyFailure(Object.assign(new Error('Too many scans.'), { status: 429, code: 'rate_limited' })).retryAfterMs, 60_000)
})
test('a photo the reader rejected (422) is not retried by itself', () => {
  const f = classifyFailure(Object.assign(new Error('Could not read that photo. Try a clearer one.'), { status: 422, code: 'unreadable' }))
  assert.equal(f.transient, false)
  assert.match(f.message, /could not be read/i)
})
```

`test/retry.test.mjs`:

```js
// Run: node --test test/retry.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { nextRetry, MAX_ATTEMPTS, RETRY_DELAY_MS } from '../src/lib/retry.ts'

test('a brake wait uses the server\'s delay and does not count as one of the card\'s attempts', () => {
  assert.deepEqual(nextRetry({ message: '', transient: true, retryAfterMs: 540_000 }, true), { delayMs: 540_000, countsAsAttempt: false })
})
test('other transient failures retry after 30 s and count while online', () => {
  assert.deepEqual(nextRetry({ message: '', transient: true }, true), { delayMs: RETRY_DELAY_MS, countsAsAttempt: true })
  assert.deepEqual(nextRetry({ message: '', transient: true }, false), { delayMs: RETRY_DELAY_MS, countsAsAttempt: false })
  assert.equal(MAX_ATTEMPTS, 3)
})
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `node --test test/errors.test.mjs test/retry.test.mjs`
Expected: FAIL (`retryAfterMs` undefined; `retry.ts` missing).

- [ ] **Step 3: Implement**

`shared/extract-core.ts`, `GeminiError`: add `retryAfter?: number` (seconds). The constructor's `extra` gains `retryAfter?: number`, assigned as `this.retryAfter = extra?.retryAfter`.

`src/lib/gemini.ts`, `withRetry`:
- Build the error with `retryAfter: Number(res.headers.get('Retry-After')) || undefined`.
- After the `no_cards`/`sign_in` line, add `if (json?.error?.code === 'rate_limited') throw lastErr   // our own brake: minutes, scheduled by the app (retry.ts)`.

`src/lib/errors.ts`:
- `ReadFailure` gains `/** Try again after this long (the server's brake said so); the wait is not the card failing. */ retryAfterMs?: number`.
- Before the `status === 429` line:

```ts
  if (code === 'rate_limited') {
    const secs = (e as { retryAfter?: number } | null)?.retryAfter
    return { message: 'Waiting a few minutes. Too many scans at once.', transient: true, retryAfterMs: (secs && secs > 0 ? secs : 60) * 1000 }
  }
  if (code === 'unreadable' || status === 422) return { message: 'This card could not be read. Tap to try again.', transient: false }
```

`src/lib/retry.ts`:

```ts
import type { ReadFailure } from './errors'

export const MAX_ATTEMPTS = 3
export const RETRY_DELAY_MS = 30_000

/**
 * When to read a failed card again, and whether that try uses up one of its attempts. A brake wait does not: it is the
 * server pacing the account, not the card failing. Being offline does not either.
 */
export function nextRetry(f: ReadFailure, online: boolean): { delayMs: number; countsAsAttempt: boolean } {
  if (f.retryAfterMs) return { delayMs: f.retryAfterMs, countsAsAttempt: false }
  return { delayMs: RETRY_DELAY_MS, countsAsAttempt: online }
}
```

`src/App.tsx`:
- Delete the `MAX_ATTEMPTS` and `RETRY_DELAY_MS` constants (lines 63-64) and import `MAX_ATTEMPTS, nextRetry` from `./lib/retry`.
- In the catch loop, replace the `attempts` line with:

```ts
        const plan = nextRetry(failure, online)
        const attempts = (cur.attempts ?? 0) + (plan.countsAsAttempt ? 1 : 0)
```

- Replace the timer line with `if (later.length) setTimeout(() => void enqueueRef.current(later), nextRetry(failure, true).delayMs)`.

Add ` test/retry.test.mjs` to the `test` script after `test/errors.test.mjs`.

- [ ] **Step 4: Run tests and build**

Run: `npm test && npm run build`
Expected: all PASS, and the build succeeds.

- [ ] **Step 5: Commit**

```bash
git add shared/extract-core.ts src/lib/gemini.ts src/lib/errors.ts src/lib/retry.ts src/App.tsx test/errors.test.mjs test/retry.test.mjs package.json
git commit -m "The app waits out the server's brake (its Retry-After, not 30 s, and not counted against the card) and does not retry a photo the reader rejected"
```

---

### Task 3: Ship

- [ ] **Step 1:** Run `npm test && npm run server:test && npm run build:android` and expect everything green, with `BUILD SUCCESSFUL`.
- [ ] **Step 2:** Ask the user to deploy the Worker (`npm run server:deploy`), or deploy with their go-ahead. It's live for every user.
- [ ] **Step 3:** Hand the phone check to the user (`npm run apk:install`):
  1. Scan a few cards in a row: they read, or wait with "Waiting a few minutes".
  2. Retry all doesn't end in "Too many scans".
  3. A blurry photo says "could not be read" at once, without three retries.
  4. `wrangler tail` shows `refused …` lines naming the limit.
