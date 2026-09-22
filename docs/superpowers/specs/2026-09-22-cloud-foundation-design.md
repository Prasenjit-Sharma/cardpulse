# Cloud foundation + hosted card & lead capture (Phase 2b): design

Date: 2026-09-22. Status: approved in conversation 2026-09-22; written here for the record before planning.
Scope: the shared Supabase foundation (auth, project schema) plus everything Phase 2b needs on top of it: a hosted,
shareable digital-card link and stall lead capture. Full bidirectional contact sync, per-user Gemini quotas and DPDP
policy work are explicitly out of scope (see Non-goals).

## 1. Goal

A signed-in user can turn any of their digital cards (built in Phase 2a) into a short, shareable public link, and can
open a "Collect leads" stall mode where a visitor scans a QR, sees the card on their own phone, and can leave their own
name and contact details. Those details land as an ordinary contact in the exhibitor's app the next time it is online.

Success: from a fresh sign-in, a user publishes a card, a second phone (no app, no account) scans the QR, opens a plain
web page, saves the contact and submits its own details, and those details appear as a new contact on the first phone.

Non-goals: full bidirectional sync of existing local contacts and cards; per-user Gemini rate limits; DPDP consent and
retention flows or a rewritten privacy page; a paid tier; phone-based sign-in (built after Google sign-in, once an SMS
provider account exists — see section 3).

## 2. Decisions already made (2026-09-22)

- Foundation and Phase 2b are one spec, since 2b is what actually needs the foundation.
- Sign-in: Google first (no extra account needed beyond Supabase), phone OTP added later once an SMS provider is set up.
- Supabase project already created: `https://xqwslvteyhfmnxcnlpsg.supabase.co`. Its publishable key is safe to ship in the
  client; its secret key is never used by this spec (nothing here needs server-side Supabase access) and must never be
  committed or embedded in client code.
- The app talks to Supabase **directly from the client**, secured by row-level security (RLS) and, where RLS's row-level
  nature is not enough (see section 4), by security-definer RPC functions. No new server component is added; the
  existing Cloudflare Worker for Gemini is untouched.
- The public share link is a query parameter (`?card=<slug>`) on the existing GitHub Pages app, not a path, because
  GitHub Pages cannot rewrite paths for a single-page app. This matches the existing `?action=scan` convention.
- Scope is a one-way pull of leads into local contacts, not full sync of everything else.
- Stall mode gets two toggled modes: **Just share** (today's offline vCard QR, unchanged, works with zero signal on
  either phone) and **Collect leads** (new; needs the visitor to have a signal to load the page).

## 3. Auth

- Google sign-in via Supabase Auth (`supabase.auth.signInWithOAuth({ provider: 'google' })`), which needs a Google OAuth
  client to be configured in the Supabase dashboard (Authentication → Providers → Google) — one more small setup step
  for the user, done once, separate from this build.
- A new "Account" section in Settings: signed-out shows a "Sign in with Google" button; signed-in shows the account's
  name/email and a Sign out button. Nothing else in the app requires being signed in — publishing a card and collecting
  leads are the only things that do, matching the product principle that local use is never held hostage.
- Session state is read from `supabase.auth.getSession()` on load and kept current via
  `supabase.auth.onAuthStateChange`. No custom session storage is built; Supabase's own client handles persistence.
- Phone OTP is designed for but not built in this pass: `Kind` stays open to a second `'phone'` option later, and the
  Account section's layout leaves room for a second button. Building it needs the user to create an SMS provider
  account first (Twilio, MSG91, or similar — India requires DLT-registered sender IDs for OTP SMS, which is its own
  setup the user must do; I will give exact steps when we get there).

## 4. Data model and security

Three new Supabase objects, defined in a single SQL migration file committed to the repo
(`supabase/migrations/0001_cloud_foundation.sql`) and run once by hand in the Supabase SQL editor (there is no CI
migration runner in this project yet, so this is a manual step during implementation, not an automated one).

### `public.cards` — a published snapshot of one digital card

```sql
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
```

**Deliberately no public SELECT policy.** RLS is row-level, not query-shape-level: a policy of `using (true)` would let
anyone list every published card in the table via the REST API, not just the one they hold a link to — the URL's slug
being secret would not stop enumeration. Instead, the public page reads through a narrow, deliberate door:

```sql
create or replace function public.get_public_card(p_slug text)
returns public.cards
language sql security definer set search_path = public as $$
  select * from public.cards where slug = p_slug limit 1;
$$;
grant execute on function public.get_public_card(text) to anon;
```

`security definer` runs with the function owner's rights, bypassing the table's RLS inside the function, but the
function itself only ever returns one row for one known slug — there is no way to ask it for "all cards." Guessing a
correct 8-character slug (drawn from a 32-character unambiguous alphabet, avoiding 0/O/1/I/l) is about 1 in 10^12,
practically the same guarantee as a normal unlisted-link scheme.

### `public.leads` — one visitor submission

```sql
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

-- The submitting visitor never sets owner_id themselves; it is derived from the card so nobody can claim
-- someone else's leads by guessing or forging a different owner_id.
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
```

No public INSERT policy on the table either, for the same reason as `cards`: the RPC is the only door, and it fills in
`owner_id` itself.

### Storage bucket `card-photos`

Public bucket (read is a plain URL, no auth needed — this is the point, the photo shows on the public page). A storage
policy restricts writes to the signed-in owner's own folder:

```sql
create policy "owner writes own photos" on storage.objects for insert
  with check (bucket_id = 'card-photos' and (storage.foldername(name))[1] = auth.uid()::text);
```

Photos are uploaded to `card-photos/<owner_id>/<local_card_id>.jpg`, so re-publishing overwrites the same object rather
than accumulating orphaned files.

## 5. Publishing and the public page

- **Publish/refresh:** the moment a user opens "Collect leads" in Stall mode, the app upserts the current card's fields
  into `cards` (matched on `owner_id, local_card_id`, so the same card always keeps the same row and the same slug once
  first published), uploads the photo if present, and builds the QR from `https://prasenjit-sharma.github.io/cardpulse/?card=<slug>`
  instead of the offline vCard. If the device is offline, this mode is disabled with a one-line explanation, and
  "Just share" is offered instead.
- **The public page:** `App.tsx` checks for `?card=` before anything else and, if present, renders a standalone
  `PublicCard` view instead of the normal app shell — no tab bar, no sign-in required to view it. It calls
  `get_public_card`, draws the card with the existing `drawCard` renderer, offers "Save contact" (the same vCard
  download already built for My Card) and "Add on Google Maps" for the address, and shows the lead form beneath: name
  (required), phone, email, company (all optional except name, though a name with neither phone nor email is of little
  use — the form nudges for at least one). Submitting calls `submit_lead` and shows a plain thank-you; nothing is
  queued or retried automatically if it fails, since it is a one-off visit — the visitor just sees an error and can tap
  Send again.

## 6. Pulling leads into contacts

- On app start, and whenever the app comes back online, if the user is signed in, it calls a query for leads owned by
  them with `pulled_at is null`, ordered oldest first.
- Each lead becomes an ordinary local `CardRecord`/`Contact`: `status: 'done'`, no photo, `corrected`/`extracted` set
  from the lead's fields, a note reading "From your stall" (plus the event name if any), and `eventId` set to
  `event_id` **only if** an event with that id still exists locally — otherwise the event name is folded into the note
  and the contact is left unfiled, rather than inventing a new event or guessing a match.
- After creating the contact, the app marks the lead `pulled_at = now()` (an update the owner is allowed to make under
  its own RLS policy) so it is not pulled twice.
- This is a plain one-way pull on a timer/foreground event, not a live subscription — no Supabase Realtime channel in
  this pass, to keep the surface small.

## 7. Files (new unless marked)

- `src/lib/supabase.ts` — creates the client from the project URL and publishable key (both safe to commit, same as the
  existing Gemini worker's URL).
- `src/lib/auth.ts` — sign in with Google, sign out, current session, a `useSession()` hook.
- `src/lib/cloudcards.ts` — publish/refresh a card, build its public URL, pure slug generation (tested).
- `src/lib/leads.ts` — submit a lead (called from the public page), pull leads and convert to contacts (called from
  `App.tsx`), pure lead-to-contact mapping (tested).
- `src/components/PublicCard.tsx` — the public, unauthenticated view.
- `src/components/AccountSection.tsx` — the Settings "Account" block.
- Modified: `src/components/StallMode.tsx` (mode toggle), `App.tsx` (the `?card=` check, wiring auth and the leads
  pull), `SettingsPage.tsx` (renders `AccountSection`).
- `supabase/migrations/0001_cloud_foundation.sql` — the SQL above, run by hand once.
- `scripts/verify-rls.mjs` (scratch, not part of `npm test`) — the manual security check from section 8, kept in the
  repo so it can be re-run after any future schema change.

## 8. Testing

Unit tests (Node, as with every prior phase): slug generation (format, uniqueness attempt/retry logic), the lead↔contact
mapping (event match/no-match, missing fields, escaping), and the publish payload shape. RLS and the RPC functions
cannot be exercised by Node's test runner, since there is no local Postgres in this environment; instead,
`scripts/verify-rls.mjs` runs against the live Supabase project with three different keys (anon, a real signed-up test
user, and a second test user) and asserts:

- anon can call `get_public_card` for a real slug and get the card back, and gets nothing for a made-up slug;
- anon cannot `select * from cards` or `select * from leads` directly (empty result, not an error);
- anon can call `submit_lead` for a real card id;
- the card's owner can read that lead; the *other* test user cannot.

This script must pass before Phase 2b is considered done, because it is the only check on data belonging to real
people. The UI itself (Stall mode toggle, the public page, Settings) is checked by the user on real phones, as with
every earlier phase.

## 9. Open questions

None outstanding — every decision above was settled in conversation on 2026-09-22.
