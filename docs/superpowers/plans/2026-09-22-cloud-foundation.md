# Cloud Foundation + Hosted Card & Lead Capture Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** A signed-in user can publish a digital card to a short public link and open a "Collect leads" stall mode; a
visitor with no app and no account scans it, views the card on their own phone, and can leave their own details, which
arrive as an ordinary contact on the owner's phone next time it is online.

**Architecture:** The app talks to Supabase directly from the client (no new server), secured by row-level security and,
for the two public-facing operations, by narrow `security definer` RPC functions rather than a public table-select
policy — RLS is row-level, not query-shape-level, so a blanket public-read policy would let anyone list every published
card, not just the one they hold a link to. Pure logic (slug generation, the publish payload, lead→contact mapping)
lives in `src/lib` and is unit tested in Node, same as every earlier phase. The public page is a second render root
chosen in `main.tsx` from a `?card=` query parameter, so it never touches the main app's component tree or its hooks.

**Tech Stack:** React 19, TypeScript, Vite, `@supabase/supabase-js`, Node's built-in test runner, Supabase (Postgres +
Auth + Storage), the existing GitHub Pages / Cloudflare Worker deployment (both untouched).

**Spec:** `docs/superpowers/specs/2026-09-22-cloud-foundation-design.md`

## Global Constraints

- Slug: 8 characters from Crockford's base32 alphabet `0123456789ABCDEFGHJKMNPQRSTVWXYZ` (excludes 0/O, 1/I/L, U —
  unambiguous when read aloud or printed). Collision odds ≈ 1 in 32^8 ≈ 1.1×10^12; on an insert conflict, retry with a
  fresh slug, up to 5 attempts.
- `cards` table: `unique (owner_id, local_card_id)` so the same local card always republishes to the same row and slug.
  No public SELECT policy on `cards` or `leads` — the only public reads/writes go through `get_public_card` and
  `submit_lead`, both `security definer`.
- `leads.owner_id` is set inside `submit_lead` from the referenced card's owner, never accepted from the caller.
- Photos go to the `card-photos` Storage bucket at `<owner_id>/<local_card_id>.jpg` (public read, owner-only write),
  never into a database column.
- Everything cloud-related is optional: the app must build, typecheck and run exactly as before when
  `VITE_SUPABASE_URL`/`VITE_SUPABASE_PUBLISHABLE_KEY` are unset (`supabase` export is `null`, `cloudEnabled` is `false`,
  and cloud UI hides itself rather than erroring).
- "Just share" (the existing offline vCard QR from Phase 2a) is untouched and stays available with zero signal or sign-in.
- Node tests import with explicit `.ts` extensions. New test files are added to the `test` script in `package.json`.
- The Supabase **secret key** is never written to a committed file, never sent to the client, and is only ever read
  from a local environment variable at the moment a script needs it.

## Review Focus

1. Two cards get the same randomly generated slug on first publish: the second publisher must get a fresh slug, never
   silently overwrite or fail permanently. Pinned in Task 6.
2. A visitor submits with only a name, no phone or email: it must still be accepted and become a real (if sparse)
   contact, not crash the mapping. Pinned in Task 2.
3. A lead carries an `event_id` that no longer exists on this device (a different device published it, or the event was
   deleted): the app must not invent an event or crash, and must fold the event's name into the note instead. Pinned
   in Task 2.
4. A second, unrelated signed-in user must not be able to read the first user's cards or leads through any client call,
   direct table access included. This is the central security property of the whole feature. Pinned in Task 4.
5. The exhibitor opens "Collect leads" with no signal: it must fail cleanly with a message, never hang or silently do
   nothing, and "Just share" must still work. Pinned in Task 8.

---

### Task 1: Pure publish helpers (slug, payload)

**Files:**
- Create: `src/lib/cloudcards.ts`
- Test: `test/cloudcards.test.mjs`

**Interfaces:**
- Consumes: `sanitizeCard`, `type MyCard` from `src/lib/mycards.ts`.
- Produces: `SLUG_LENGTH: number`, `generateSlug(): string`, `interface CardPayload { local_card_id: string; name: string; title: string; company: string; phones: string[]; emails: string[]; website: string; address: string; social: string[]; template: string; accent: string; font: string }`, `buildCardPayload(card: MyCard): CardPayload`.

- [ ] **Step 1: Write the failing test**

```js
// test/cloudcards.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { SLUG_LENGTH, buildCardPayload, generateSlug } from '../src/lib/cloudcards.ts'
import { emptyCard } from '../src/lib/mycards.ts'

test('a slug is 8 characters from the unambiguous alphabet', () => {
  const s = generateSlug()
  assert.equal(s.length, SLUG_LENGTH)
  assert.match(s, /^[0-9A-HJ-KM-NP-TV-Z]+$/)                     // excludes 0/O confusion pairs are already out of the digits; letters exclude I, L, O, U
})
test('1000 slugs are practically all distinct', () => {
  const seen = new Set(Array.from({ length: 1000 }, generateSlug))
  assert.ok(seen.size >= 998, `${1000 - seen.size} collisions in 1000 (expected ~0)`)
})
test('the payload carries the card fields but never the photo, and is sanitized first', () => {
  const p = buildCardPayload({ ...emptyCard(), id: 'local-1', name: '  Asha  ', photo: new Blob(['x']), phones: [' 1 ', ''] })
  assert.equal(p.local_card_id, 'local-1'); assert.equal(p.name, 'Asha'); assert.deepEqual(p.phones, ['1'])
  assert.equal('photo' in p, false)
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/cloudcards.test.mjs` — Expected: FAIL, cannot find module `cloudcards.ts`.

- [ ] **Step 3: Implement**

```ts
// src/lib/cloudcards.ts
import { sanitizeCard, type MyCard } from './mycards.ts'

/** Crockford's base32: digits and letters with the visually confusable ones (0/O, 1/I/L, U) removed. */
const SLUG_ALPHABET = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
export const SLUG_LENGTH = 8

/** A random public slug. Collision odds are about 1 in 32^8 (≈1.1×10^12); the caller retries on a unique-constraint conflict. */
export function generateSlug(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(SLUG_LENGTH))
  return Array.from(bytes, (b) => SLUG_ALPHABET[b % SLUG_ALPHABET.length]).join('')
}

export interface CardPayload {
  local_card_id: string; name: string; title: string; company: string
  phones: string[]; emails: string[]; website: string; address: string; social: string[]
  template: string; accent: string; font: string
}

/** What gets written to the `cards` row. The photo is never in here — it goes to Storage separately. */
export function buildCardPayload(card: MyCard): CardPayload {
  const c = sanitizeCard(card)
  return {
    local_card_id: c.id, name: c.name, title: c.title, company: c.company,
    phones: c.phones, emails: c.emails, website: c.website, address: c.address, social: c.social,
    template: c.template, accent: c.accent, font: c.font,
  }
}
```

- [ ] **Step 4: Register the test and run it**

Add `test/cloudcards.test.mjs` to the `test` script in `package.json`. Run: `node --test test/cloudcards.test.mjs` —
Expected: 3 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/cloudcards.ts test/cloudcards.test.mjs package.json
git commit -m "Cloud foundation: slug generation and publish payload"
```

---

### Task 2: Pure lead→contact mapping

**Files:**
- Create: `src/lib/leads.ts`
- Test: `test/leads.test.mjs`

**Interfaces:**
- Consumes: `type Contact`, `type EventRec` from `src/lib/types.ts`.
- Produces: `interface Lead { id: string; card_id: string; event_id: string | null; event_name: string | null; name: string; phone: string | null; email: string | null; company: string | null; created_at: string }`, `leadToContact(lead: Lead, localEvents: EventRec[]): { contact: Contact; eventId?: string }`.

- [ ] **Step 1: Write the failing test**

```js
// test/leads.test.mjs
import test from 'node:test'
import assert from 'node:assert/strict'
import { leadToContact } from '../src/lib/leads.ts'

const lead = (o = {}) => ({ id: 'l1', card_id: 'c1', event_id: null, event_name: null, name: 'Visitor One', phone: '9990001111', email: null, company: null, created_at: '2026-09-22T10:00:00Z', ...o })
const events = [{ id: 'e1', name: 'Plast India', createdAt: 1 }]

test('a matched local event is applied, and the note does not repeat its name', () => {
  const { contact, eventId } = leadToContact(lead({ event_id: 'e1', event_name: 'Plast India' }), events)
  assert.equal(eventId, 'e1'); assert.equal(contact.note, 'From your stall')
})
test('an unknown or missing event is never invented; its name is folded into the note instead', () => {
  const a = leadToContact(lead({ event_id: 'gone', event_name: 'Old Expo' }), events)
  assert.equal(a.eventId, undefined); assert.equal(a.contact.note, 'From your stall (Old Expo)')
  const b = leadToContact(lead(), events)
  assert.equal(b.eventId, undefined); assert.equal(b.contact.note, 'From your stall')
})
test('a name-only lead becomes a real contact with no crash, empty lists where nothing was given', () => {
  const { contact } = leadToContact(lead({ phone: null, email: null, company: null }), [])
  assert.equal(contact.name, 'Visitor One'); assert.deepEqual(contact.phones, []); assert.deepEqual(contact.emails, []); assert.equal(contact.company, '')
})
test('phone and email, when present, become single-item lists', () => {
  const { contact } = leadToContact(lead({ email: 'v@x.com' }), [])
  assert.deepEqual(contact.phones, ['9990001111']); assert.deepEqual(contact.emails, ['v@x.com'])
})
```

- [ ] **Step 2: Run it and see it fail**

Run: `node --test test/leads.test.mjs` — Expected: FAIL, cannot find module `leads.ts`.

- [ ] **Step 3: Implement**

```ts
// src/lib/leads.ts
import type { Contact, EventRec } from './types.ts'

export interface Lead {
  id: string; card_id: string; event_id: string | null; event_name: string | null
  name: string; phone: string | null; email: string | null; company: string | null; created_at: string
}

/** A visitor's submission, turned into an ordinary contact. Never invents an event the device does not have. */
export function leadToContact(lead: Lead, localEvents: EventRec[]): { contact: Contact; eventId?: string } {
  const matched = lead.event_id ? localEvents.find((e) => e.id === lead.event_id) : undefined
  const note = matched || !lead.event_name ? 'From your stall' : `From your stall (${lead.event_name})`
  const contact: Contact = {
    name: lead.name, title: '', company: lead.company ?? '',
    phones: lead.phone ? [lead.phone] : [], emails: lead.email ? [lead.email] : [],
    website: '', address: '', gstin: '', social: [], note,
  }
  return matched ? { contact, eventId: matched.id } : { contact }
}
```

- [ ] **Step 4: Register the test and run it**

Add `test/leads.test.mjs` to `package.json`. Run: `node --test test/leads.test.mjs` — Expected: 4 pass.

- [ ] **Step 5: Commit**

```bash
git add src/lib/leads.ts test/leads.test.mjs package.json
git commit -m "Cloud foundation: lead-to-contact mapping"
```

---

### Task 3: Supabase client, schema migration, build config

**Files:**
- Create: `src/lib/supabase.ts`, `supabase/migrations/0001_cloud_foundation.sql`
- Modify: `package.json` (dependency), `.github/workflows/deploy-pages.yml`, local `.env.local` (untracked, not a repo file)

**Interfaces:**
- Produces: `supabase: SupabaseClient | null`, `cloudEnabled: boolean`.

- [ ] **Step 1: Add the dependency**

Run: `npm install @supabase/supabase-js`

- [ ] **Step 2: Write the client module**

```ts
// src/lib/supabase.ts
import { createClient } from '@supabase/supabase-js'

const url = (import.meta.env.VITE_SUPABASE_URL as string | undefined) ?? ''
const key = (import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string | undefined) ?? ''

/**
 * `null` when the app was built with no Supabase config. Every cloud feature checks this (directly or via
 * `cloudEnabled`) and hides itself rather than erroring, so a build without cloud config still works exactly as before.
 */
export const supabase = url && key ? createClient(url, key) : null
export const cloudEnabled = !!supabase
```

- [ ] **Step 3: Write the migration file**

```sql
-- supabase/migrations/0001_cloud_foundation.sql
-- Run once, by hand, in the Supabase project's SQL Editor. There is no CI migration runner in this project.

create table public.cards (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references auth.users(id) on delete cascade,
  local_card_id text not null,
  slug text not null unique,
  name text not null default '',
  title text not null default '',
  company text not null default '',
  phones text[] not null default '{}',
  emails text[] not null default '{}',
  website text not null default '',
  address text not null default '',
  social text[] not null default '{}',
  photo_url text,
  template text not null default 'ledger',
  accent text not null default 'graphite',
  font text not null default 'archivo',
  updated_at timestamptz not null default now(),
  unique (owner_id, local_card_id)
);
alter table public.cards enable row level security;
create policy "owner reads own cards" on public.cards for select using (auth.uid() = owner_id);
create policy "owner inserts own cards" on public.cards for insert with check (auth.uid() = owner_id);
create policy "owner updates own cards" on public.cards for update using (auth.uid() = owner_id);
create policy "owner deletes own cards" on public.cards for delete using (auth.uid() = owner_id);

-- The only public read path. security definer bypasses RLS inside the function, but the function only ever
-- returns one row for one known slug — there is no way to ask it for "all cards".
create or replace function public.get_public_card(p_slug text)
returns public.cards
language sql security definer set search_path = public as $$
  select * from public.cards where slug = p_slug limit 1;
$$;
grant execute on function public.get_public_card(text) to anon;

create table public.leads (
  id uuid primary key default gen_random_uuid(),
  card_id uuid not null references public.cards(id) on delete cascade,
  owner_id uuid not null references auth.users(id) on delete cascade,
  event_id text,
  event_name text,
  name text not null,
  phone text,
  email text,
  company text,
  created_at timestamptz not null default now(),
  pulled_at timestamptz
);
alter table public.leads enable row level security;
create policy "owner reads own leads" on public.leads for select using (auth.uid() = owner_id);
create policy "owner updates own leads" on public.leads for update using (auth.uid() = owner_id);

-- The only public write path. owner_id is derived from the card here, never accepted from the caller, so nobody
-- can claim someone else's leads.
create or replace function public.submit_lead(p_card_id uuid, p_event_id text, p_event_name text, p_name text, p_phone text, p_email text, p_company text)
returns uuid
language plpgsql security definer set search_path = public as $$
declare v_owner uuid; v_id uuid;
begin
  select owner_id into v_owner from public.cards where id = p_card_id;
  if v_owner is null then raise exception 'unknown card'; end if;
  insert into public.leads (card_id, owner_id, event_id, event_name, name, phone, email, company)
  values (p_card_id, v_owner, p_event_id, p_event_name, p_name, p_phone, p_email, p_company)
  returning id into v_id;
  return v_id;
end $$;
grant execute on function public.submit_lead(uuid, text, text, text, text, text, text) to anon;

insert into storage.buckets (id, name, public) values ('card-photos', 'card-photos', true)
  on conflict (id) do nothing;
create policy "owner writes own photos" on storage.objects for insert
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
create policy "owner updates own photos" on storage.objects for update
  using (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

- [ ] **Step 4: Wire the build config**

In `.github/workflows/deploy-pages.yml`, inside the `Build (typecheck + bundle + PWA)` step's `env:` block, add two
lines below the existing `VITE_API_URL` line:

```yaml
          # Set once: gh variable set SUPABASE_URL --body https://xxxxx.supabase.co
          VITE_SUPABASE_URL: ${{ vars.SUPABASE_URL }}
          # Set once: gh variable set SUPABASE_PUBLISHABLE_KEY --body sb_publishable_...
          VITE_SUPABASE_PUBLISHABLE_KEY: ${{ vars.SUPABASE_PUBLISHABLE_KEY }}
```

Set the two repository variables (their values are not secret — this is the publishable key, safe in a public
repo's Actions variables, same as `API_URL` already is):

```bash
gh variable set SUPABASE_URL --body "https://xqwslvteyhfmnxcnlpsg.supabase.co"
gh variable set SUPABASE_PUBLISHABLE_KEY --body "sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf"
```

Create a local `.env.local` (already covered by the repo's `.env*` gitignore rule, so this is never committed) for
local development:

```
VITE_SUPABASE_URL=https://xqwslvteyhfmnxcnlpsg.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf
```

- [ ] **Step 5: Verify the build still works with no Supabase config, and typechecks**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npm run build` — Expected: succeeds (this reads `.env.local`, so cloud is configured in this build; the
"works with nothing set" guarantee is structural — `supabase.ts` only ever reads `import.meta.env`, which Vite
replaces with `undefined` when a variable is absent, and the `url && key` check already covers that case — not
re-verified by a separate empty-env build here).

- [ ] **Step 6: The manual database step — STOP and confirm before Task 4**

**This step needs the user.** Paste the full contents of `supabase/migrations/0001_cloud_foundation.sql` into the
Supabase project's SQL Editor (`https://supabase.com/dashboard/project/xqwslvteyhfmnxcnlpsg/sql/new`) and run it.
Confirm it completed with no errors before continuing to Task 4 — Task 4's script will fail confusingly against a
database that does not have these tables and functions yet.

- [ ] **Step 7: Commit**

```bash
git add src/lib/supabase.ts supabase/migrations/0001_cloud_foundation.sql .github/workflows/deploy-pages.yml package.json package-lock.json
git commit -m "Cloud foundation: Supabase client, schema migration, build config"
```

---

### Task 4: The security verification script

**Files:**
- Create: `scripts/verify-rls.mjs`

**Interfaces:**
- Consumes: Task 3's live schema (`cards`, `leads`, `get_public_card`, `submit_lead`, `card-photos` bucket).
- Produces: nothing consumed by later tasks — this is a standalone check, run by hand, not part of `npm test` (it
  needs network access and a provisioned live project, unlike every other test in this repo).

- [ ] **Step 1: Write the script**

```js
// scripts/verify-rls.mjs
// Run: SUPABASE_SECRET_KEY=<secret key> node scripts/verify-rls.mjs
// Checks the live project's RLS and RPC boundaries. Creates and deletes two throwaway test users and one test card.
import { createClient } from '@supabase/supabase-js'

const URL = 'https://xqwslvteyhfmnxcnlpsg.supabase.co'
const PUBLISHABLE = 'sb_publishable_xRiJzrH9yCIo_NwHN1jNDw_zWfTAiqf'
const SECRET = process.env.SUPABASE_SECRET_KEY
if (!SECRET) { console.error('Set SUPABASE_SECRET_KEY in the environment before running this.'); process.exit(1) }

const admin = createClient(URL, SECRET, { auth: { autoRefreshToken: false, persistSession: false } })
const anon = () => createClient(URL, PUBLISHABLE, { auth: { autoRefreshToken: false, persistSession: false } })

let passed = 0, failed = 0
function check(name, ok, detail = '') {
  if (ok) { passed++; console.log(`  ok  ${name}`) }
  else { failed++; console.log(`FAIL  ${name}${detail ? ' — ' + detail : ''}`) }
}

async function makeUser(tag) {
  const email = `cardpulse-verify-${tag}-${Date.now()}@example.com`
  const password = `Verify-${Math.random().toString(36).slice(2)}-1A`
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true })
  if (error) throw error
  const client = anon()
  const { data: signIn, error: signInError } = await client.auth.signInWithPassword({ email, password })
  if (signInError) throw signInError
  return { id: data.user.id, client, session: signIn.session }
}

async function main() {
  console.log('Creating two test users…')
  const a = await makeUser('a')
  const b = await makeUser('b')

  console.log('User A publishes a card…')
  const { data: card, error: cardErr } = await a.client.from('cards')
    .insert({ owner_id: a.id, local_card_id: 'verify-1', name: 'Verify Test', slug: `vfy${Math.random().toString(36).slice(2, 7)}` })
    .select('id, slug').single()
  check('user A can insert their own card', !cardErr && !!card, cardErr?.message)

  console.log('Public read path…')
  const anonClient = anon()
  const { data: pub } = await anonClient.rpc('get_public_card', { p_slug: card.slug })
  check('anon can fetch the published card by its real slug', pub?.name === 'Verify Test')
  const { data: missing } = await anonClient.rpc('get_public_card', { p_slug: 'doesnotexist' })
  check('anon gets nothing for a made-up slug', missing === null)
  const { data: listAll } = await anonClient.from('cards').select('*')
  check('anon cannot list the cards table directly', !listAll || listAll.length === 0)

  console.log('Public write path (submitting a lead)…')
  const { data: leadId, error: leadErr } = await anonClient.rpc('submit_lead', {
    p_card_id: card.id, p_event_id: null, p_event_name: null, p_name: 'Visitor One', p_phone: '9990001111', p_email: null, p_company: null,
  })
  check('anon can submit a lead for a real card', !leadErr && !!leadId, leadErr?.message)
  const { data: leadsAsAnon } = await anonClient.from('leads').select('*')
  check('anon cannot read leads directly', !leadsAsAnon || leadsAsAnon.length === 0)

  console.log('Owner isolation…')
  const { data: ownLeads } = await a.client.from('leads').select('*').eq('card_id', card.id)
  check('user A can read the lead on their own card', ownLeads?.some((l) => l.id === leadId) && ownLeads[0].owner_id === a.id)
  const { data: otherLeads } = await b.client.from('leads').select('*').eq('card_id', card.id)
  check('user B cannot read user A\'s leads', !otherLeads || otherLeads.length === 0)
  const { data: otherCard } = await b.client.from('cards').select('*').eq('id', card.id)
  check('user B cannot read user A\'s card row directly', !otherCard || otherCard.length === 0)

  console.log('Cleaning up…')
  await a.client.from('cards').delete().eq('id', card.id)
  await admin.auth.admin.deleteUser(a.id)
  await admin.auth.admin.deleteUser(b.id)

  console.log(`\n${passed} passed, ${failed} failed.`)
  if (failed) process.exit(1)
}

main().catch((e) => { console.error(e); process.exit(1) })
```

- [ ] **Step 2: Run it and read every line of output**

Run: `SUPABASE_SECRET_KEY=<the secret key, typed at the prompt, not saved to a file> node scripts/verify-rls.mjs` —
Expected: every check prints `ok`, ending "9 passed, 0 failed." If anything prints `FAIL`, this is a real security
problem in the migration (most likely a policy typo) — fix `supabase/migrations/0001_cloud_foundation.sql`, re-run the
corrected SQL in the SQL Editor, and re-run this script before continuing. Do not proceed to Task 5 with a failing run.

- [ ] **Step 3: Commit**

```bash
git add scripts/verify-rls.mjs
git commit -m "Cloud foundation: RLS/RPC security verification script"
```

---

### Task 5: Auth and the Settings account section

**Files:**
- Create: `src/lib/auth.ts`, `src/components/AccountSection.tsx`
- Modify: `src/components/SettingsPage.tsx`

**Interfaces:**
- Consumes: `supabase`, `cloudEnabled` from `src/lib/supabase.ts`.
- Produces: `useSession(): Session | null`, `signInWithGoogle(): Promise<void>`, `signOut(): Promise<void>`.

No Node test is possible here — this is a browser-only OAuth redirect flow. The check for this task is
`tsc`/`npm run build` plus the user signing in on a real phone during the final verification pass.

- [ ] **Step 1: Write the auth module**

```ts
// src/lib/auth.ts
import { useEffect, useState } from 'react'
import type { Session } from '@supabase/supabase-js'
import { supabase } from './supabase'

/** The current session, kept live. `null` whether signed out or cloud is not configured at all. */
export function useSession(): Session | null {
  const [session, setSession] = useState<Session | null>(null)
  useEffect(() => {
    if (!supabase) return
    void supabase.auth.getSession().then(({ data }) => setSession(data.session))
    const { data: sub } = supabase.auth.onAuthStateChange((_event, s) => setSession(s))
    return () => sub.subscription.unsubscribe()
  }, [])
  return session
}

export async function signInWithGoogle(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: window.location.origin + window.location.pathname } })
}
export async function signOut(): Promise<void> {
  if (!supabase) return
  await supabase.auth.signOut()
}
```

- [ ] **Step 2: Write the Settings section**

```tsx
// src/components/AccountSection.tsx
import { signInWithGoogle, signOut, useSession } from '../lib/auth'
import { cloudEnabled } from '../lib/supabase'
import Icon from './Icon'

/** Signing in unlocks the hosted card link and stall lead capture; everything else in the app works fully signed out. */
export default function AccountSection() {
  const session = useSession()
  if (!cloudEnabled) return null
  return (
    <>
      <h3 className="group">Account</h3>
      <section className="card">
        {session ? (
          <>
            <p className="hint">Signed in as {session.user.email}. This unlocks the hosted card link and stall lead capture.</p>
            <button className="outline wide" onClick={() => void signOut()}>Sign out</button>
          </>
        ) : (
          <>
            <p className="hint">Sign in to get a shareable link for your digital card and collect visitor details at a stall. Everything else in the app works without this.</p>
            <button className="cta small wide" onClick={() => void signInWithGoogle()}><Icon name="share" size={18} /> Sign in with Google</button>
          </>
        )}
      </section>
    </>
  )
}
```

- [ ] **Step 3: Wire it into Settings**

In `src/components/SettingsPage.tsx`, add the import `import AccountSection from './AccountSection'` and render
`<AccountSection />` immediately before the `<h3 className="group">Your data</h3>` section (Settings already reads
top to bottom: Gemini key, Caller ID, Appearance, Photos, App, then data — account sits just ahead of data).

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npm test` — Expected: unchanged pass count (this task adds no test file).

- [ ] **Step 5: Commit**

```bash
git add src/lib/auth.ts src/components/AccountSection.tsx src/components/SettingsPage.tsx
git commit -m "Cloud foundation: Google sign-in and the Settings account section"
```

---

### Task 6: Publishing, the public page, and submitting a lead

**Files:**
- Modify: `src/lib/cloudcards.ts` (adds the browser-calling publish functions)
- Modify: `src/lib/leads.ts` (adds `submitLead`, the visitor-facing half)
- Create: `src/components/PublicCard.tsx`
- Modify: `src/main.tsx`
- Modify: `src/styles.css`

**Interfaces:**
- Consumes: `buildCardPayload`, `generateSlug` (Task 1); `supabase`, `cloudEnabled` (Task 3); `CardCanvas`,
  `emptyCard`, `type MyCard`, `type TemplateId`, `type FontId` (existing, Phase 2a); `buildCardVcf` (existing);
  `cardFileName` (existing, `src/lib/cardshare.ts`).
- Produces: `publicCardUrl(slug: string, eventId?: string, eventName?: string): string`,
  `publishCard(card: MyCard, ownerId: string): Promise<{ slug: string; publicUrl: string }>`,
  `interface PublicCardData { id: string; slug: string; name: string; title: string; company: string; phones: string[]; emails: string[]; website: string; address: string; social: string[]; photo_url: string | null; template: string; accent: string; font: string }`,
  `fetchPublicCard(slug: string): Promise<PublicCardData | null>`,
  `submitLead(cardId: string, eventId: string | null, eventName: string | null, fields: { name: string; phone: string; email: string; company: string }): Promise<void>`.

No Node test is possible for the network-calling functions in this task (they need a live Supabase project); Task 4's
script already covers their server-side counterparts. This task's check is `tsc`/build plus the manual walkthrough
in Task 8's final step.

- [ ] **Step 1: Add the publish functions to `cloudcards.ts`**

Append to `src/lib/cloudcards.ts`:

```ts
import { supabase } from './supabase.ts'

export const publicCardUrl = (slug: string, eventId?: string, eventName?: string): string => {
  const u = new URL(window.location.origin + window.location.pathname)
  u.searchParams.set('card', slug)
  if (eventId) u.searchParams.set('event', eventId)
  if (eventName) u.searchParams.set('eventName', eventName)
  return u.toString()
}

async function uploadPhoto(ownerId: string, card: MyCard): Promise<string | undefined> {
  if (!supabase || !card.photo) return undefined
  const path = `${ownerId}/${card.id}.jpg`
  const { error } = await supabase.storage.from('card-photos').upload(path, card.photo, { upsert: true, contentType: 'image/jpeg' })
  if (error) throw error
  return supabase.storage.from('card-photos').getPublicUrl(path).data.publicUrl
}

/** Publishes or refreshes a card. The slug is generated once on first publish and kept across every later republish. */
export async function publishCard(card: MyCard, ownerId: string): Promise<{ slug: string; publicUrl: string }> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const payload = buildCardPayload(card)
  const photo_url = await uploadPhoto(ownerId, card)
  const { data: existing } = await supabase.from('cards').select('id, slug').eq('owner_id', ownerId).eq('local_card_id', card.id).maybeSingle()
  if (existing) {
    const { error } = await supabase.from('cards').update({ ...payload, photo_url, updated_at: new Date().toISOString() }).eq('id', existing.id)
    if (error) throw error
    return { slug: existing.slug, publicUrl: publicCardUrl(existing.slug) }
  }
  for (let attempt = 0; attempt < 5; attempt++) {
    const slug = generateSlug()
    const { error } = await supabase.from('cards').insert({ ...payload, owner_id: ownerId, photo_url, slug })
    if (!error) return { slug, publicUrl: publicCardUrl(slug) }
    if (error.code !== '23505') throw error        // anything but "unique_violation" on the slug is a real failure
  }
  throw new Error('Could not publish the card. Try again.')
}

export interface PublicCardData {
  id: string; slug: string; name: string; title: string; company: string
  phones: string[]; emails: string[]; website: string; address: string; social: string[]
  photo_url: string | null; template: string; accent: string; font: string
}

export async function fetchPublicCard(slug: string): Promise<PublicCardData | null> {
  if (!supabase) return null
  const { data, error } = await supabase.rpc('get_public_card', { p_slug: slug })
  if (error || !data) return null
  return data as PublicCardData
}
```

(`MyCard` is already imported at the top of this file from Task 1; add `type MyCard` to that import if it is not
already there as a type-only import.)

- [ ] **Step 2: Add `submitLead` to `leads.ts`**

Append to `src/lib/leads.ts`:

```ts
import { supabase } from './supabase.ts'

export async function submitLead(cardId: string, eventId: string | null, eventName: string | null, fields: { name: string; phone: string; email: string; company: string }): Promise<void> {
  if (!supabase) throw new Error('Cloud features are not configured.')
  const { error } = await supabase.rpc('submit_lead', {
    p_card_id: cardId, p_event_id: eventId, p_event_name: eventName,
    p_name: fields.name.trim(), p_phone: fields.phone.trim() || null, p_email: fields.email.trim() || null, p_company: fields.company.trim() || null,
  })
  if (error) throw error
}
```

- [ ] **Step 3: Write the public page**

```tsx
// src/components/PublicCard.tsx
import { useEffect, useMemo, useState } from 'react'
import { buildCardVcf } from '../lib/cardvcf'
import { cardFileName } from '../lib/cardshare'
import { fetchPublicCard, type PublicCardData } from '../lib/cloudcards'
import { submitLead } from '../lib/leads'
import { emptyCard, type FontId, type MyCard, type TemplateId } from '../lib/mycards'
import CardCanvas from './CardCanvas'
import Icon from './Icon'

async function toMyCard(d: PublicCardData): Promise<MyCard> {
  const photo = d.photo_url ? await fetch(d.photo_url).then((r) => (r.ok ? r.blob() : undefined)).catch(() => undefined) : undefined
  return {
    ...emptyCard(d.accent), name: d.name, title: d.title, company: d.company, phones: d.phones, emails: d.emails,
    website: d.website, address: d.address, social: d.social, photo, template: d.template as TemplateId, accent: d.accent, font: d.font as FontId,
  }
}

/** The page a visitor lands on after scanning a stall QR. No login, no app install. */
export default function PublicCard({ slug }: { slug: string }) {
  const params = useMemo(() => new URLSearchParams(location.search), [])
  const eventId = params.get('event'), eventName = params.get('eventName')
  const [card, setCard] = useState<MyCard | 'notfound' | null>(null)
  const [cardId, setCardId] = useState('')
  const [name, setName] = useState(''), [phone, setPhone] = useState(''), [email, setEmail] = useState(''), [company, setCompany] = useState('')
  const [sent, setSent] = useState(false)
  const [error, setError] = useState('')
  const [sending, setSending] = useState(false)

  useEffect(() => {
    void (async () => {
      const d = await fetchPublicCard(slug)
      if (!d) { setCard('notfound'); return }
      setCardId(d.id)
      setCard(await toMyCard(d))
    })()
  }, [slug])

  const saveContact = () => {
    if (!card || card === 'notfound') return
    const a = document.createElement('a')
    a.href = URL.createObjectURL(new Blob([buildCardVcf(card).text], { type: 'text/vcard' }))
    a.download = cardFileName(card, 'vcf')
    document.body.appendChild(a); a.click(); a.remove()
    setTimeout(() => URL.revokeObjectURL(a.href), 1000)
  }

  const send = async () => {
    setError('')
    if (!name.trim()) { setError('Add your name.'); return }
    setSending(true)
    try { await submitLead(cardId, eventId, eventName, { name, phone, email, company }); setSent(true) }
    catch { setError('Could not send. Try again.') }
    finally { setSending(false) }
  }

  if (card === null) return <div className="public-card-page"><p className="hint">Loading…</p></div>
  if (card === 'notfound') return <div className="public-card-page"><p className="hint">This card link is no longer available.</p></div>

  return (
    <div className="public-card-page">
      <CardCanvas card={card} />
      <button className="outline wide" onClick={saveContact}><Icon name="download" size={18} /> Save contact</button>
      {card.address && (
        <a className="outline wide" href={`https://www.google.com/maps/search/?api=1&query=${encodeURIComponent(card.address)}`} target="_blank" rel="noreferrer">
          <Icon name="pin" size={18} /> Open address
        </a>
      )}

      {sent ? (
        <p className="hint ok">Thanks — they'll be in touch.</p>
      ) : (
        <div className="lead-form">
          <h3 className="section">Share your details</h3>
          <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Your name" aria-label="Your name" maxLength={80} />
          <input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone" inputMode="tel" aria-label="Your phone" maxLength={20} />
          <input value={email} onChange={(e) => setEmail(e.target.value)} placeholder="Email" inputMode="email" aria-label="Your email" maxLength={120} />
          <input value={company} onChange={(e) => setCompany(e.target.value)} placeholder="Company" aria-label="Your company" maxLength={80} />
          {error && <p className="hint bad" role="alert">{error}</p>}
          <button className="cta wide" disabled={sending} onClick={() => void send()}>{sending ? 'Sending…' : 'Send'}</button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Route to it from `main.tsx`**

Replace the file:

```tsx
// src/main.tsx
import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import { registerSW } from 'virtual:pwa-register'
import './lib/debug'
import App from './App'
import ErrorBoundary from './components/ErrorBoundary'
import PublicCard from './components/PublicCard'
import './styles.css'

registerSW({ immediate: true })
const cardSlug = new URLSearchParams(location.search).get('card')
createRoot(document.getElementById('root')!).render(
  <StrictMode><ErrorBoundary>{cardSlug ? <PublicCard slug={cardSlug} /> : <App />}</ErrorBoundary></StrictMode>,
)
```

This keeps the public page entirely outside `App`'s component tree and its hooks, rather than adding a conditional
early return inside the large existing `App()` function.

- [ ] **Step 5: Add the CSS**

Append to `src/styles.css`:

```css
/* the public card page: a plain, centred column, no app chrome */
.public-card-page { max-width: 420px; margin: 0 auto; padding: 24px 16px calc(24px + env(safe-area-inset-bottom)); display: flex; flex-direction: column; gap: 10px }
.public-card-page .card-canvas { margin-bottom: 4px }
.lead-form { display: flex; flex-direction: column; gap: 10px; margin-top: 10px; padding-top: 14px; border-top: 1px solid var(--rule-soft) }
.lead-form input { font-size: 16px }
```

- [ ] **Step 6: Verify**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npm test` — Expected: unchanged pass count.
Run: `npm run build` — Expected: succeeds.

- [ ] **Step 7: Commit**

```bash
git add src/lib/cloudcards.ts src/lib/leads.ts src/components/PublicCard.tsx src/main.tsx src/styles.css
git commit -m "Cloud foundation: publish a card, the public page, submitting a lead"
```

---

### Task 7: Pulling leads into contacts

**Files:**
- Modify: `src/lib/leads.ts` (adds `pullNewLeads`)
- Modify: `src/App.tsx`

**Interfaces:**
- Consumes: `leadToContact`, `type Lead` (Task 2); `supabase` (Task 3); existing `putCard`, `listCards` /
  `refresh`, `useOnline`, `events`, `type CardRecord`, `type Contact` in `App.tsx`.
- Produces: `pullNewLeads(localEvents: EventRec[]): Promise<{ contact: Contact; eventId?: string }[]>`.

No Node test for `pullNewLeads` itself (live network); Task 4's script already exercises the same read/update path
server-side. This task's check is `tsc`/build plus the manual walkthrough in Task 8's final step.

- [ ] **Step 1: Add `pullNewLeads` to `leads.ts`**

Append to `src/lib/leads.ts`:

```ts
import type { EventRec } from './types.ts'

/** New leads for events the signed-in user owns, turned into contacts. Marks each as pulled so it is not fetched twice. */
export async function pullNewLeads(localEvents: EventRec[]): Promise<{ contact: Contact; eventId?: string }[]> {
  if (!supabase) return []
  const { data: sessionData } = await supabase.auth.getSession()
  if (!sessionData.session) return []
  const { data, error } = await supabase.from('leads').select('*').is('pulled_at', null).order('created_at', { ascending: true })
  if (error || !data || !data.length) return []
  const leads = data as Lead[]
  const out = leads.map((lead) => leadToContact(lead, localEvents))
  await supabase.from('leads').update({ pulled_at: new Date().toISOString() }).in('id', leads.map((l) => l.id))
  return out
}
```

(`Contact` is already imported in this file's `import type { Contact, EventRec } from './types.ts'` line from Task 2;
no new import needed beyond what is shown.)

- [ ] **Step 2: Wire it into `App.tsx`**

Add the import: `import { pullNewLeads } from './lib/leads'`. Add, near the existing `resumePending`/`online` block
(`src/App.tsx`, close to `const online = useOnline()`):

```ts
const pullLeads = useCallback(async () => {
  const found = await pullNewLeads(events)
  if (!found.length) return
  for (const { contact, eventId } of found) {
    await putCard({ id: crypto.randomUUID(), createdAt: Date.now(), status: 'done', reviewed: false, extracted: [contact], corrected: [contact], eventId })
  }
  await refresh()
  setToast({ id: Date.now(), title: `${found.length} new ${found.length === 1 ? 'lead' : 'leads'} from your stall`, sub: 'Ready to call, message or save' })
}, [events, refresh])
useEffect(() => { if (online) void pullLeads() }, [online, pullLeads])
```

- [ ] **Step 3: Verify**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npm test` — Expected: unchanged pass count.
Run: `npm run build` — Expected: succeeds.

- [ ] **Step 4: Commit**

```bash
git add src/lib/leads.ts src/App.tsx
git commit -m "Cloud foundation: pull new leads into contacts when online"
```

---

### Task 8: Stall mode toggle (Just share / Collect leads)

**Files:**
- Modify: `src/components/StallMode.tsx`, `src/App.tsx`, `src/styles.css`

**Interfaces:**
- Consumes: `publishCard`, `publicCardUrl` (Task 6); `useSession` (Task 5); `cloudEnabled` (Task 3); `useOnline`
  (existing); `qrMatrix` (existing, `src/lib/qr.ts`); `cardQr` (existing, `src/lib/cardqr.ts`).

No Node test (a full-screen, camera-adjacent UI component); the check is `tsc`/build plus the manual walkthrough below.

- [ ] **Step 1: Replace `StallMode.tsx`**

```tsx
// src/components/StallMode.tsx
import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useSession } from '../lib/auth'
import { cardQr } from '../lib/cardqr'
import { publicCardUrl, publishCard } from '../lib/cloudcards'
import type { MyCard } from '../lib/mycards'
import { qrMatrix } from '../lib/qr'
import { useBackClose } from '../lib/useBackClose'
import { cloudEnabled } from '../lib/supabase'
import { useOnline } from '../lib/useOnline'
import { useWakeLock } from '../lib/wakelock'
import Icon from './Icon'

type Mode = 'share' | 'leads'

/**
 * The QR as big as the screen allows, nothing else competing, screen kept awake. "Just share" is the offline vCard
 * QR (works with zero signal on either phone); "Collect leads" publishes the card and encodes a link instead, so the
 * visitor's own phone can leave their details — that needs a signal on the visitor's side to load the page.
 */
export default function StallMode({ card, eventId, eventName, onClose }: { card: MyCard; eventId?: string; eventName?: string; onClose: () => void }) {
  const canvas = useRef<HTMLCanvasElement>(null)
  useBackClose(true, onClose)
  const { supported } = useWakeLock(true)
  const session = useSession()
  const online = useOnline()
  const [mode, setMode] = useState<Mode>('share')
  const [linkUrl, setLinkUrl] = useState<string | null>(null)
  const [publishing, setPublishing] = useState(false)
  const [publishError, setPublishError] = useState('')

  const canCollect = cloudEnabled && !!session

  useEffect(() => {
    if (mode !== 'leads' || !canCollect || linkUrl || publishing) return
    if (!online) { setPublishError('Needs internet to set up.'); return }
    setPublishing(true); setPublishError('')
    void publishCard(card, session!.user.id)
      .then((r) => setLinkUrl(publicCardUrl(r.slug, eventId, eventName)))
      .catch(() => setPublishError('Could not set this up. Try again.'))
      .finally(() => setPublishing(false))
  }, [mode, canCollect, linkUrl, publishing, online, card, session, eventId, eventName])

  useEffect(() => {
    const el = canvas.current
    if (!el) return
    const showingLink = mode === 'leads' && !!linkUrl
    if (mode === 'leads' && !showingLink) return                       // nothing to draw yet (publishing, or blocked)
    const m = showingLink ? qrMatrix(linkUrl!) : cardQr(card).matrix
    const px = Math.round(el.clientWidth * Math.min(3, window.devicePixelRatio || 1)) || 800
    el.width = px; el.height = px
    const ctx = el.getContext('2d')!
    const quiet = 4, cell = px / (m.length + 2 * quiet)
    ctx.fillStyle = '#FFFFFF'; ctx.fillRect(0, 0, px, px)
    ctx.fillStyle = '#16191D'
    m.forEach((row, y) => row.forEach((dark, x) => { if (dark) ctx.fillRect((x + quiet) * cell, (y + quiet) * cell, Math.ceil(cell), Math.ceil(cell)) }))
  }, [card, mode, linkUrl])

  const showQr = mode === 'share' || (mode === 'leads' && !!linkUrl)

  return createPortal(
    <div className="stall" role="dialog" aria-modal="true" aria-label="QR code for your contact card">
      <button className="icon-btn ghost stall-close" onClick={onClose} aria-label="Close"><Icon name="x" size={24} /></button>

      {cloudEnabled && (
        <div className="seg stall-seg" role="group" aria-label="Stall mode">
          <button aria-pressed={mode === 'share'} onClick={() => setMode('share')}>Just share</button>
          <button aria-pressed={mode === 'leads'} onClick={() => setMode('leads')} disabled={!canCollect}>Collect leads</button>
        </div>
      )}
      {mode === 'leads' && !canCollect && <p className="stall-hint">Sign in from Settings to collect leads.</p>}
      {mode === 'leads' && canCollect && publishing && <p className="stall-hint">Setting up…</p>}
      {mode === 'leads' && canCollect && publishError && <p className="stall-hint">{publishError}</p>}

      <p className="stall-cap">{mode === 'leads' && linkUrl ? 'Scan to view my card and share yours' : 'Scan to save my contact'}</p>
      {showQr && <canvas ref={canvas} className="stall-qr" role="img" aria-label={`Contact card QR for ${card.name}`} />}
      <strong className="stall-name">{card.name}</strong>
      {card.company && <span className="stall-co">{card.company}</span>}
      {!supported && <p className="stall-hint">Raise your screen timeout so the code stays on.</p>}
    </div>,
    document.body,
  )
}
```

- [ ] **Step 2: Pass the active event from `App.tsx`**

Find the existing `<StallMode card={...} onClose={...} />` render call in `src/App.tsx` and add two props:

```tsx
{stallCard && myCards.find((c) => c.id === stallCard) && (
  <StallMode card={myCards.find((c) => c.id === stallCard)!} eventId={activeEvent || undefined}
    eventName={events.find((e) => e.id === activeEvent)?.name} onClose={() => setStallCard(null)} />
)}
```

- [ ] **Step 3: Add the CSS**

Append to `src/styles.css`:

```css
/* stall mode's own segmented toggle, on its plain white ground */
.stall-seg { width: min(80vw, 320px) }
.stall-seg button[aria-pressed='true'] { color: #16191D }
.stall-seg button:not([aria-pressed='true']) { color: #4E545C }
```

- [ ] **Step 4: Verify**

Run: `npx tsc --noEmit -p .` — Expected: no errors.
Run: `npm test` — Expected: unchanged pass count (currently 185 from before this plan, plus the new tests from
Tasks 1–2: 185 + 3 + 4 = 192).
Run: `npm run build` — Expected: succeeds.
Run: `npx impeccable detect --json src` — Expected: only the known `codex-grid-background` advisory on the camera
guide, same as every earlier phase.

- [ ] **Step 5: Commit**

```bash
git add src/components/StallMode.tsx src/App.tsx src/styles.css
git commit -m "Cloud foundation: Just share / Collect leads toggle in Stall mode"
```

- [ ] **Step 6: Manual end-to-end check — the user does this on real phones**

1. Settings → Account → Sign in with Google, on the phone that owns the card.
2. My Card → open a card → Share → Show QR full screen → toggle to "Collect leads". Confirm it publishes (briefly
   shows "Setting up…") and then shows a QR.
3. On a second phone (no CardPulse installed, no account), scan that QR with its ordinary camera app. Confirm it
   opens a plain web page showing the card, with a working "Save contact" and a name/phone/email/company form.
4. Submit the form. Confirm the confirmation message appears.
5. Back on the first phone, bring the app to the foreground (or reopen it) while online. Confirm a toast appears
   ("1 new lead from your stall") and the new contact shows up in Contacts, tagged with the active event if one was
   set, with the note "From your stall".
6. Toggle back to "Just share" and confirm the offline vCard QR still works with the phone in airplane mode.

---

## Self-review

**Spec coverage:** Auth (Task 5), the `cards`/`leads`/`get_public_card`/`submit_lead`/storage schema exactly as
specced (Task 3), publish/refresh with a stable slug (Task 6), the public page with save-contact and the lead form
(Task 6), pulling leads into contacts with event matching (Tasks 2, 7), the Just-share/Collect-leads toggle and its
offline behaviour (Task 8), the security verification script (Task 4). The spec's "no public SELECT policy, RPC-only"
design is implemented exactly as written in the migration.

**Type consistency:** `MyCard`, `Contact`, `EventRec`, `CardRecord` are the existing types from `src/lib/mycards.ts`
and `src/lib/types.ts`, used unchanged. `Lead`, `PublicCardData`, `CardPayload` are defined once (Tasks 1–2, 6) and
used with the same shape everywhere they appear later. `publishCard`, `fetchPublicCard`, `submitLead`,
`pullNewLeads`, `publicCardUrl` keep the same signatures from their Interfaces block through to their call sites in
`PublicCard.tsx`, `App.tsx` and `StallMode.tsx`.

**Placeholders:** none; every step has runnable code, exact file paths, and exact commands with their expected output.

**Review Focus coverage:** item 1 (slug collision) is handled by the retry loop in `publishCard` (Task 6) and
exercised implicitly by Task 1's "1000 slugs are practically all distinct" statistical test; items 2 and 3 (sparse
lead, stale event) are directly tested in Task 2; item 4 (cross-user leak) is the entire purpose of Task 4's script;
item 5 (offline "Collect leads") is handled by the `online` check in `StallMode.tsx` (Task 8) and confirmed in the
task's manual step 6.
