# Pulse Brief and Share my card (contact page): design

Date: 2026-09-29. Status: agreed in conversation on 2026-09-29, written spec awaiting the user's review.

## Goal

Two buttons on a contact's page, modelled on another card app the user showed (its "Instant Bio" and "Share my card"):

1. **Pulse Brief**: a short, factual brief on the person and their company, researched on the web, with conversation
   starters and links worth saving. It is for getting ready before calling or meeting a lead met at an exhibition.
   Most contacts are small and mid-size Indian businesses, which a model knows nothing about on its own, so the brief
   must come from a live web search and say plainly when little is public, never pad with generic praise.
2. **Share my card**: one tap puts the user's own digital card, as a vCard file, into this contact's WhatsApp chat.

## Decisions

| Question | Decision | Why |
|---|---|---|
| Name | **Pulse Brief** (user's choice) | Ties to CardPulse; says what it is. "Instant Bio" is the other app's name |
| Where facts come from | **Gemini with Grounding with Google Search** (user's choice, "plan A") | Real facts with sources; a model alone invents filler for small firms |
| Shared cache across users | **None for now** | Gemini API terms: grounded results are shown "to the end user who submitted the prompt" and may not be cached or syndicated. The user's own history may be kept up to 2 years |
| Other search providers | Researched (Tavily, Exa, Brave, Serper, LangSearch); **deferred** | Tavily + our own Gemini + a shared Cloudflare KV cache is the path if costs grow |
| Who can use it | Signed-in users only | The daily limit is counted per account |
| Daily limit | **10 fresh briefs per account per day** (UTC day, like scans) | ~₹3 per grounded search after 1,500 free/day; stops one account running up the bill |
| Where a brief is kept | On the contact itself, so it syncs to the user's own phones | Allowed as the user's own history; opens instantly and offline |
| Share my card delivery | **vCard file straight into the contact's WhatsApp chat** (user's choice) | How contacts are normally sent in WhatsApp; the file goes alone (26 Sept field test: text beside it broke it) |
| Loading state | A pulse animation with captions and shimmering placeholder cards, **no progress bar** (user's choice) | |

## Part 1: Pulse Brief, how it works

### Request

The app posts to a new Worker route `POST /v1/brief` with the user's Supabase token and only what the card says about
who they are: `name`, `title`, `company`, `address` (for the city and PIN code), `website`, email **domains** (not full
addresses), `gstin`. Never phone numbers, notes, tags, the log, or anything else the user wrote.

### Server (`server/worker.ts`)

1. Origin check as today. Body validated: every field a string, each at most 300 characters, name or company
   required.
2. **Sign-in required.** No token: 401 `sign_in`. With a token, `consume_brief` (new RPC, migration 0003) counts one
   brief. Over the limit: 429 `daily_limit`, with the limit in the message. If the quota check itself fails (Supabase
   slow or down), fall back to the per-IP brake, as scans do today: an outage never blocks a user.
3. One Gemini `generateContent` call with the `google_search` tool, model `env.BRIEF_MODEL || env.GEMINI_MODEL ||
   DEFAULT_MODEL`. Timeout 40 s, as for reading.
4. The prompt (kept on the server, like the reading prompt) asks for JSON with:
   - `person`: 2 to 4 sentences of facts about this person in this company: role, time there, anything public.
   - `company`: 2 to 5 sentences: what they make or trade, where, since when, size or group companies, if public.
   - `starters`: 2 or 3 short, specific openers tied to what was found (a product line, a recent expansion, a trade
     fair), phrased as something the user could say.
   - `links`: at most 5 `{ kind, url }` with `kind` one of `linkedin`, `website`, `indiamart`, `facebook`,
     `instagram`, `justdial`, `tradeindia`, `other`.
   - Rules in the prompt: facts only from the search results; if little or nothing is public about the person or the
     company, say so in one sentence ("Little public information found about this person."); no adjectives of
     praise; no guessed URLs; Indian English.
   JSON is asked for in the prompt and parsed leniently (first `{` to last `}`), because search grounding and a strict
   response schema are not reliably combinable across models. Unparseable output is a 502 `bad_output`.
5. From the response's `groundingMetadata` the server takes:
   - `sources`: the grounding chunks, as `{ title, uri }` (title is the site's domain; the uri is Google's redirect link,
     which opens the page).
   - `suggestions`: `searchEntryPoint.renderedContent`, the HTML Google requires to be shown with the result.
6. **Links are checked, never trusted**: a link from the model is kept only if its domain (lower-cased, without
   `www.`) equals the title of one of the grounding sources. LinkedIn profile links are kept only on
   `linkedin.com/in/...` or `linkedin.com/company/...`. So a LinkedIn link is offered only when the search actually
   found that page.
7. Reply: `{ person, company, starters, links, sources, suggestions, model }`. Nothing is stored on the server and
   nothing is logged beyond what Cloudflare logs by default.

### Migration `supabase/migrations/0003_brief_quota.sql`

A `brief_usage` table and a `consume_brief()` function, the same shape as `scan_usage` and `consume_scan()` in 0002, with
`v_limit constant integer := 10`. The owner can read their own row; only the function writes. `delete_my_account`
already cascades from `auth.users`.

### On the phone

- `src/lib/brief.ts` (new): the `Brief` type, the request builder (what is sent, from a `Contact`), the call to the
  Worker with the user's token, and the text used for Copy and Share.
- A brief is kept on the contact as `Contact.brief?: Brief`:
  `{ at: number; person: string; company: string; starters: string[]; links: {kind, url}[]; sources: {title, uri}[];
  suggestions: string; model: string }`. It syncs with the card like every other contact field.
- It is **not** exported: not in the vCard, not in the CSV export, not in "Save to phone".
- A brief older than 2 years is dropped when the contact is next opened (the terms' limit on keeping it).
- Opening Pulse Brief with a brief already kept shows it at once, with no network call. **Refresh** (⋮ menu) runs a new
  search and counts towards the day's limit.
- The search keeps going if the user leaves the page; the result is saved to the contact when it arrives, whether or
  not the page is still open.

## Part 2: Pulse Brief, the screens

### Contact page

Below the Call / WhatsApp / Save row, two buttons side by side in the page's soft tinted style: **✦ Pulse Brief** and
**Share my card**.

### Pulse Brief page

A full-screen page (back arrow, the contact's name in the title bar, ⋮ menu).

- **Loading** (no progress bar):
  - The ✦ icon in a soft circle that sends out slow, fading rings, like a radar ping.
  - Beneath it, captions that change on a timer: "Searching the web…", "Reading what we found…",
    "Writing the brief…". The captions are timed, since the search does not report its steps.
  - The three section cards already in place as shimmering grey lines, so nothing jumps when the text arrives.
  - On arrival each card fades up in turn, about 80 ms apart, and the rings stop.
  - With the phone's "reduce motion" setting: a still icon and the captions only.
- **Three cards**: *About the person*, *About the company*, *Conversation starters* (a bulleted list). Each card has a
  small **Share** and **Copy** button, and under it "Sources: vivacitygroup.in, indiamart.com": the source domains,
  each opening its page.
- **Google Search suggestions**: Google's `renderedContent` chips, shown as Google provides them, in a sandboxed frame
  below the cards. Tapping a chip opens the Google search in the browser. Required by the grounding terms.
- **Add to profile**: each checked link with its kind ("LinkedIn profile", "Website", "IndiaMART") and a **+**.
  Tapping **+** adds it: a website to `website` if that is empty, anything else to `social`, and the + turns into ✓.
  A link the contact already has shows ✓ from the start.
- **⋮ menu**: *Copy all*, *Share all*, *Refresh*.
- **Footer**: "Found on the web on 29 Sept 2026 with Google Search. Public information; check before relying on it."
- **Errors**, each as a calm message in place of the cards:
  - Not signed in: "Sign in to use Pulse Brief", with a Sign in button.
  - Daily limit: "You've used today's 10 fresh searches. Saved briefs still open. Resets at 5:30 am." (midnight UTC,
    in Indian time).
  - Offline: "Pulse Brief needs a connection."
  - Anything else: "Couldn't make the brief. Try again.", with a Try again button.

### Shared text

Share all (WhatsApp-friendly plain text):

```
*Abhishek Jain*, Vivacity Woven Sack Pvt. Ltd., Surat

*About the person*
…

*About the company*
…

*Conversation starters*
• …
• …

Sources: vivacitygroup.in, indiamart.com
via CardPulse Pulse Brief
```

A single card's Share sends that section only, with the same first line, heading and sources lines. Copy puts the
same text on the clipboard.

## Part 3: Share my card, from a contact

- Tap **Share my card**:
  - One digital card: used directly. Several: a small sheet asks which, by card name. None: "Make your card first",
    which opens the card editor.
- **In the Android app**, a new native plugin `WhatsAppCard` (next to `SaveContactPlugin`):
  - Writes the vCard (the same file "Send contact file" makes, `buildCardVcf`) to the cache, and shares it through the
    existing `FileProvider` with `ACTION_SEND`, type `text/x-vcard`, `EXTRA_STREAM`, read permission granted,
    `setPackage` to WhatsApp, and the extra `jid` = the number's digits + `@s.whatsapp.net`. That opens this contact's
    chat with the vCard ready; the user presses send. The file goes alone, no text.
  - The number is `whatsAppNumber(contact)` (phones.ts): the main number if WhatsApp can reach it, else the first
    mobile. Ten digits get 91 in front.
  - Package: `com.whatsapp`, else `com.whatsapp.w4b` (WhatsApp Business). With both installed, a sheet asks once
    ("WhatsApp" / "WhatsApp Business") and the choice is remembered on the phone. `AndroidManifest.xml` gains a
    `<queries>` entry for both packages (Android 11 package visibility).
  - The `jid` extra is undocumented by WhatsApp, and widely used. If WhatsApp is not installed or refuses the hand-off,
    the plugin reports it and the app falls back (below).
- **Falls back to the normal share sheet with the vCard** (the existing `shareVcf`, file only) when there is no
  WhatsApp-able number, no WhatsApp, the hand-off fails, or on the website.
- Counted in "Recent sharing" on My Card as `file`, like "Send contact file".

## Privacy policy

`public/privacy.html` gains a paragraph: Pulse Brief sends the person's name, title, company, city, website, email
domain and GSTIN (never phone numbers or notes) through the CardPulse server to Google's Gemini API, which searches
Google. The brief is kept with the contact on the user's phones and synced to their account. It is not shared with
other users.

## Testing

- `test/brief.test.mjs`: the request carries only the allowed fields (no phones, no full emails, no notes); the shared
  text for all and for each section; links are added to `website` or `social` without duplicates; a brief older than
  2 years is dropped.
- `server/test/worker.test.mjs` (upstream faked, as for reading): sign-in required; over the limit gives 429; a quota
  outage falls back to the per-IP brake; lenient JSON parsing; links whose domain is not among the sources are dropped;
  LinkedIn links other than profile or company pages are dropped; sources and suggestions are passed through.
- `scripts/check-migrations.mjs` covers 0003 (the function is callable by `authenticated` only; the count stops at 10).
- The screens and the WhatsApp hand-off have no automated tests; the user checks them on the phone: the loading animation, reduce motion, Add to
  profile, Share all into WhatsApp, and Share my card into a contact's chat with WhatsApp, WhatsApp Business, both,
  and neither installed.

## Out of scope

- A shared cache across users, and any provider other than Gemini with Google Search (see Decisions).
- Native Google sign-in (recorded separately; not part of this work).
- Pulse Brief on the website without sign-in.
