# Read and Brief brakes: failures stop snowballing

Date: 2026-10-09. Branch `pulse-brand`. Status: awaiting the user's review.

## The problem (field report, 2026-10-08)

Card reads sat on "Trying again shortly", then failed with "Too many scans. Try again in 9 min." Pulse Brief sometimes
failed. AI Studio showed a spike of Gemini **400 BadRequest** errors. Investigation:

- When the same requests the Worker builds are sent to Gemini directly (single card, front and back, a batch of 4, a
  Brief with and without search), they all return 200. The request format and the models are fine.
- The Worker's brake (`checkRate`, `server/worker.ts:42`) allows 30 calls per 10 minutes per account. Reads and Briefs
  already have separate buckets (`account:<id>` and `brief:<id>`). Every attempt counts, **including those Gemini
  rejects**, because the hit is recorded before Gemini is called.
- Three things multiply attempts:
  1. Gemini rejecting a request (any non-429 error) becomes Worker 502 `upstream_error`, which the app treats as
     temporary and retries 3 times, 30 s apart (`src/App.tsx:63-64,270`, `src/lib/errors.ts:19`).
  2. "Too many scans" (429 `rate_limited`, with a Retry-After of minutes) is also retried after 30 s. The retries are
     refused, the card ends as "failed" after 3 tries, and the user has to tap Retry all.
  3. A batch Gemini can't attribute is re-read card by card (`src/App.tsx:236-239`). That's correct behaviour, but it's
     4 more calls on the same brake.
- Refusals (daily limit, brake, busy) aren't logged by the Worker, so `wrangler tail` showed a 429 for a Brief without
  saying which limit refused it.

## Changes

**Worker (`server/worker.ts`):**
- `checkRate` splits in two: `rateWait(key, now)` only looks, and `rateHit(key, now)` records. A read or Brief records
  its hit **only after Gemini answered 200**, so rejected and failed calls no longer use up the brake. The window and
  sizes are unchanged: 30 per 10 minutes, per account, reads and Briefs apart.
- Gemini's 400-class rejections (except 429) become **422 `unreadable`**, "Could not read that photo. Try a clearer
  one.", for reads, and 422 `brief_failed` for Briefs. These aren't temporary, so the app doesn't retry them. Gemini's
  5xx stays 502 `upstream_error` and is retried as now.
- Every refusal is logged with its reason, in one line: `refused <route> <code> user=<first 8 of id> wait=<s>`. No
  personal data.

**App:**
- `classifyFailure` gains `retryAfterMs`. For 429 `rate_limited` it reads the Retry-After header that `extractCard`
  now passes on (in seconds), and for `busy` it uses 20 s.
- The retry timer uses `retryAfterMs` when given, otherwise 30 s. A brake wait doesn't count as one of the card's 3
  attempts (like being offline), and the card shows "Waiting a few minutes. Too many scans at once" instead of failing.
- 422 `unreadable` is not retried. The card shows "This card could not be read. Tap to try again." (existing wording).

## Testing

- `server/test/worker.test.mjs`:
  - a read whose Gemini call returns 400 leaves the brake untouched (31 such calls in a row are all answered 422,
    none refused 429);
  - 30 good reads then fill it;
  - Briefs and reads keep separate buckets.
- `test/errors.test.mjs`: 429 `rate_limited` with Retry-After 540 gives `retryAfterMs` 540000 and transient;
  422 `unreadable` is not transient.
- The app's retry scheduling is pure logic: `nextRetry(failure, attempts)` → `{ delayMs, countsAsAttempt }` in a lib
  file, tested.

## Out of scope

The batch re-read fallback stays. The brake sizes and daily limits stay. Plans and pricing are a separate spec
(`2026-10-09-plans-v2-design.md`).
