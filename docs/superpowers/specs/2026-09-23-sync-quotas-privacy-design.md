# Sync, per-user quotas, privacy groundwork (Phase 3) + view counts (end of Phase 2): design

Date: 2026-09-23. Status: decided without a conversation — the user asked for the next phase to be built end to end
without intervention, so every choice below was made by the implementer and is written down here so it can be
reviewed and reversed. Nothing here is legal advice; the DPDP items are groundwork that still needs a lawyer.

## 1. Scope

Built in this pass:

1. **View counts** (the one Phase 2 item left): each published card counts how often its link is opened and how many
   leads it has received; the owner sees both on My Card.
2. **Sync across devices** (Phase 3's main item): contacts (with their card photos), events and the user's own digital
   cards, opt-in, for a signed-in user.
3. **Per-user scan quota** (Phase 3): a signed-in user's reads are counted per account on the server; signed-out use
   keeps today's per-IP brake.
4. **Privacy groundwork** (Phase 3, DPDP): a consent step recorded server-side before sync, leads deleted from the
   server once they reach the phone, deleting a digital card takes its public link down, "Delete cloud data" and
   "Delete account" in Settings, a rewritten privacy page (the current one still says there are no servers or accounts,
   which stopped being true in 2b).

Not built, with the reason:

- **Phone-number sign-in:** needs an SMS provider account with a DLT-registered sender (user action).
- **Paid Gemini tier:** a billing change in Google's console (user action).
- **DPDP sign-off:** needs legal review. The page and flows are written to be accurate about what the app does; they
  are not a compliance opinion.
- **Requiring sign-in to scan / monthly free reads:** that is Phase 4 (packs). Scanning stays usable signed out.

## 2. Decisions

| Question | Decision | Why |
|---|---|---|
| Sync on by default after sign-in? | **No, opt-in** with a consent sheet. | The contacts are other people's personal data; the principle "the contact belongs to the user, on-device by default" stands. |
| Conflict rule | **Last writer wins per record**, by the device's own `updatedAt` (ms). | Records are small and edited by one person; field-level merge is not worth its complexity. A clock that is badly wrong on one phone can lose an edit; accepted. |
| What syncs | Contacts (`CardRecord`, status `done` only), events, digital cards. Photos: a contact's `image` and `back`, a digital card's `photo`. | Pending or failed cards stay on the phone that took them, so two phones never both pay to read the same photo. `original`/`originalBack` (undo copies) and settings stay local. |
| Deletes | Tombstones: deleting on one phone deletes on the others. | Otherwise deleted contacts come back from the server. |
| "Delete all data" with sync on | Deletes everywhere, and the confirm text says so. | Honest; the separate "Delete cloud data" covers "keep my phone, clear the server". |
| Another account signs in on the same phone | Sync is tied to the account that turned it on; a different account starts with sync off and must consent itself. | Stops one person's phone data landing in another account by accident. |
| Where the quota token goes | In the JSON body (`auth`), not an `Authorization` header. | No CORS change: the current Worker ignores the field, so the app and Worker can deploy in either order. |
| Quota size | 300 reads per account per UTC day, plus the existing 30-per-10-minutes burst (keyed by account instead of IP). | An abuse brake, not a price. 300 is roughly a heavy exhibition day. Adjustable in one SQL constant. |
| Quota failure mode | If Supabase cannot be reached or the function is missing, fall back to the per-IP limit (fail open to today's behaviour). | A quota outage must never stop an exhibitor scanning. |
| Leads retention | A lead row is deleted from the server as soon as it is saved on the phone. | Keep only what is needed; the contact then lives on the phone (and in sync if the owner turned it on). |
| Lead contact id | `lead-<lead id>`, and a lead whose contact already exists locally is not written again. | Two phones pulling the same lead at once, or a delete that did not land, can never create duplicates or overwrite edits. |

## 3. Server (Supabase), `supabase/migrations/0002_sync_quota_privacy.sql`, run by hand once

- `cards.view_count`, `cards.lead_count` (integers, default 0). `record_card_view(p_slug)` — security definer, only
  increments. `submit_lead` is redefined to also increment `lead_count`.
- `leads`: an owner delete policy.
- `sync_items (owner_id, kind, item_id, data jsonb, deleted, client_updated_at bigint, seq bigint)`, primary key
  `(owner_id, kind, item_id)`; `kind` in `card | event | mycard`. RLS owner-only for select/insert/update/delete.
  `seq` comes from a sequence via a trigger on every insert/update, so a device pulls "everything after the last `seq`
  I saw". `sync_push(p_items jsonb)` upserts a batch (max 200) for `auth.uid()` and only overwrites a row whose
  `client_updated_at` is not newer than the incoming one.
- Private Storage bucket `sync-photos`, objects at `<uid>/<kind>-<id>-<slot>.jpg`, owner-only read/write/delete. The
  public `card-photos` bucket gets an owner delete policy.
- `consents (owner_id, purpose, policy_version, granted_at, withdrawn_at)`, owner-only.
- `scan_usage (owner_id, day, reads)` and `consume_scan()` (security definer): increments today's count if under the
  limit and returns `allowed, used, day_limit`.
- `delete_my_cloud_data()` removes the caller's sync items, leads and cards; the consent record and usage counts go with the account.
  `delete_my_account()` (security definer) deletes the caller's `auth.users` row; every table cascades from it. Storage
  files are removed by the app first through the Storage API (Supabase does not allow deleting them with SQL).

## 4. The app

- **Change tracking:** `putCard`, `deleteCard`, `putMyCard`, `deleteMyCard` and `saveEvents` record the change in a
  small outbox in localStorage (`kind:id → updatedAt`, plus deleted). Records gain an `updatedAt`. Writes that come
  *from* sync use separate raw writers that do not touch the outbox. The outbox is recorded whether or not sync is on,
  and turning sync on queues every local record anyway, so there is nothing to miss.
- **Engine** (`src/lib/sync.ts`): one run at a time; push the outbox (photos first, then rows, in batches), then pull
  everything after the cursor, apply what is newer than the local copy, download changed photos (a failed download is
  retried on the next run), then tell the app to reload its lists. Runs on start, when the network returns, when the app
  comes back to the foreground, a few seconds after any local change, and every 5 minutes while open.
- **Photo versions:** each synced photo carries a short SHA-256 of its bytes in the record, so an unchanged photo is
  never uploaded or downloaded twice.
- **Settings → Account** (signed in): a "Sync across devices" switch with status ("Synced just now", "Syncing…",
  "Waiting for network", or the error); turning it on opens the consent sheet. Below: "Delete cloud data" and "Delete
  account", each behind a confirm.
- **My Card:** a published card shows "Link opened N times · M leads" under its buttons.
- **Public card page:** records one view per visit (once per browser session) and adds one plain line under Send: whose
  phone the details go to, with a link to the privacy page. No banner, no checkbox wall (policy 4: nothing pushy).
- **Deleting a digital card** also unpublishes it (after pulling any waiting leads for it first); offline, the
  unpublish waits in a queue until the network is back.
- **Worker:** reads `auth` from the body; with it, asks Supabase `consume_scan` using the caller's own token (the Worker
  still holds no Supabase secret). Over the limit → `429 daily_limit`, which the app shows as a plain message and does
  not retry automatically.

## 5. Testing

- Node unit tests for the pure parts: outbox bookkeeping, event diffing, what a card looks like on the wire (no blobs,
  no retry state, only `done`), the "is the remote copy newer" rule, photo slots, lead id and skip rule, Worker quota
  paths (allowed, over limit, bad token → per-IP, Supabase down → per-IP, no token → per-IP).
- The migration is executed against a real Postgres (PGlite) with stand-ins for Supabase's `auth` schema, to check it
  parses and that `sync_push`'s newer-wins rule, `consume_scan`'s limit and the RLS isolation behave. This does not
  replace running `scripts/verify-sync.mjs` against the live project after the migration is applied.
- The user checks the UI on real phones, as with every phase.
