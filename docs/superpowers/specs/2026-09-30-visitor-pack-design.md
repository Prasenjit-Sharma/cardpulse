# Visitor pack (files and a link for stall visitors): design

Date: 2026-09-30. Status: the user chose the options (A: shown after the visitor sends their details; at most 3 files and
1 web link; general wording) and asked to go ahead with the recommendations.

## Goal

At an event, the stall's "Collect leads" QR opens a web page where a visitor leaves their details. The user can now give
each event a **visitor pack**: up to 3 files (PDF or pictures), one web link and a short note. The visitor sees it right
after sending their details, as a thank-you and a reason to fill the form in.

## Decisions

| Question | Decision | Why |
|---|---|---|
| When the visitor sees it | After sending their details (user's choice A) | An incentive to leave details |
| What it holds | Up to 3 files, 1 web link with an optional label, a note of up to 300 characters (the note is the recommended extra) | The user's limits; the note says what the files are |
| File types and size | PDF, JPEG, PNG, WebP; up to 10 MB each | Opens on any phone without an app; keeps storage and visitors' data use small |
| Per what | Per event, the same for every card shown with that event | Materials differ by event; "No event" leads get no pack |
| Wording | "What visitors get" in the app; "More from {company}" on the page | General, not "brochure" or "price list" |
| Where it lives | Server only (Supabase table `visitor_packs` + public bucket `visitor-packs`), per account, so every signed-in phone sees the same pack | Visitors need it online anyway; no sync code needed |
| Gate | Visitors get the pack only as the answer to sending their details (`submit_lead_pack`) | Leads are deleted from the server once the stall phone pulls them, so a later lookup could miss |
| Files' addresses | Public bucket, each file under an unguessable name, shown only after details are sent | Signed links would need a server secret; this matches card photos |
| Editing | In the app, signed in and online; offline shows "Needs a connection" | Files go to the server |
| Deleting | Deleting an event deletes its pack; "Delete cloud data" and "Delete account" delete every pack | Nothing left behind |

## Server (migration 0004)

- `visitor_packs (owner_id, event_id, note, link_url, link_label, files jsonb, updated_at)`, primary key (owner_id,
  event_id); checks: event_id 1–100 characters, note ≤ 300, link `http(s)://` ≤ 500, label ≤ 80, at most 3 files. Row
  level security: the owner reads and writes only their own.
- Bucket `visitor-packs`, public read, write only inside the owner's own folder (`{owner}/{event}/{random}-{name}`).
- `submit_lead_pack(...)`: the same inputs and checks as `submit_lead`, returns `{ id, pack }`, where `pack` is the pack
  for that card's owner and event (null when none). Callable by anon. `submit_lead` stays for older pages.
- `delete_my_cloud_data` also deletes the owner's packs; the app empties their storage folder first.

## App

- `src/lib/visitorpack.ts`: types, limits and checks (pure, tested), load, save (upload new files, delete removed ones,
  upsert the row) and delete.
- A full page "What visitors get" (same style as the Pulse Brief page) for one event: the note, the link and its label,
  up to 3 files (add, see name and size, remove), Save. Opened from the event's menu on the Events page ("What visitors
  get") and from the stall's Show QR setup when Collect leads has an event chosen.
- Deleting an event also deletes its pack, when signed in and online (best effort).

## Public page

After "Send", the thank-you shows, under it, "More from {company}": the note, each file as a row (type icon, name, size,
opens in a new tab), and the link as a button with its label or its host. Nothing changes for events without a pack.

## Offline

"Just share" needs no connection on either phone (the QR holds the vCard). "Collect leads" needs the visitor's mobile
data to open the page, send details and open the pack; the stall phone can be offline.

## Testing

- `test/visitorpack.test.mjs`: file checks (type, size, count), link and note checks, what a save uploads and removes.
- `scripts/check-migrations.mjs`: 0004 runs twice; limits enforced; owners isolated; `submit_lead_pack` returns the pack
  only for that card's owner and event; anon cannot read the table.
- The phone and the public page are checked by the user.
