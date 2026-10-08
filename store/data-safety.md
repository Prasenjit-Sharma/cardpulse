# Google Play Data safety: answers (draft, check before submitting)

## Before submitting: two blockers

1. **Move Pulse's Gemini API key to the paid tier.** On the free tier, Google may use submitted content to improve
   its products (privacy policy, "Card photos you scan"). That's Google using the data for its own purposes, so Play's
   service-provider exception doesn't apply, and card photos and Pulse Brief fields would have to be declared as
   **shared**. PRODUCT.md already says a paid tier is needed before real customers. The answers below assume the paid
   tier. On the free tier, change Photos and Contacts to "Shared: Yes, with Google", and update the privacy policy.
2. **Choose a private contact address for deletion requests** and add it to `public/delete-account.html` ("Can't open
   the app?") and to the privacy policy. Today the only route outside the app is a public GitHub issue.

These answers are taken from the privacy policy, `public/privacy.html` (last updated 6 October 2026). Each one cites the
line it rests on. Check them against the app and the policy as they stand on the day you submit; the form and the
policy must say the same thing.

Play Console → App content → Data safety.

## Overview questions

| Question | Answer | Policy line |
|---|---|---|
| Does your app collect or share any of the required user data types? | Yes | "With an account (Google sign-in)" |
| Is all of the user data collected by your app encrypted in transit? | Yes. Every request goes over HTTPS: Supabase, the Pulse reading service (a Cloudflare Worker) and Google | Not stated in the policy. Checked in the app's configuration (`.env.android`: HTTPS URLs only). Consider adding a line to the policy |
| Do you provide a way for users to request that their data is deleted? | Yes, in the app (Settings → Account → Delete cloud data / Delete account) | "Deleting your data" |

## Data collected

"Collected" means it leaves the phone for Pulse's servers. Data that stays on the phone is not collected in Play's sense.

| Data type (Play's name) | Collected? | Shared? | Optional? | Purpose | Policy line |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Required to read cards (sign-in) | Account management | "We receive your name and email address from Google." |
| Personal info → **Email address** | Yes | No | Required to read cards (sign-in) | Account management | same |
| Personal info → **User IDs** | Yes (the account's ID at Supabase, which ties the plan, synced data and published cards to the account) | No | Required with an account | Account management | "The account, and anything stored with it, is held by Supabase" |
| Photos and videos → **Photos** | Yes: card photos sent for reading (not stored or logged); card photos stored with the account when sync is on; a published card's photo | No (processed by Google Gemini as a service provider, on the paid tier; see blocker 1) | Reading: required. Sync and publishing: optional | App functionality | "Card photos you scan …", "Sync, only if you turn it on", "A published card …" |
| **Contacts** | When the user makes a Pulse Brief (the contact's name, title, company, address, website, email domain and GSTIN go through our server to Gemini; company findings are kept for 30 days and reused); with sync on; a published card; leads collected at a stall | No (Gemini as a service provider, paid tier) | Optional | App functionality | "Pulse Brief (a short brief on a contact) …", "Sync …", "A published card …", "If you sent your details through someone's card" |
| App activity → **App interactions** | Yes (how many cards read and briefs used, and when; nothing about the cards or people) | No | Required with an account | App functionality, account management (the plan balance) | "Your plan and what it has left" |
| Files and docs → **Files and docs** | Only files the user adds to an event's visitor pack | No | Optional | App functionality | "What visitors get" |
| Audio → **Voice or sound recordings** | No (dictation uses the phone's own speech recogniser; Pulse records nothing) | — | — | — | "Voice notes … Pulse records nothing." |
| Location, Financial info, Health, Messages, Web browsing, Device or other IDs | No | — | — | — | Not mentioned in the policy; the app collects none |

Purchases (part 4) will go through Google Play Billing. Play handles the payment details. When billing ships, check
whether the purchase record needs "Financial info → Purchase history".

## Data shared

None, in Play's sense. Card photos, and for Pulse Brief the name, title, company, address, website, email domain and
GSTIN, are sent to Google's Gemini API, which processes them on Pulse's behalf. Play treats a service provider that
processes data for the app as not "sharing". Policy lines: "passes them to Google's Gemini API", "Pulse Brief …".

## Security practices

- Data is encrypted in transit: yes.
- Users can request deletion: yes, in the app. Questions or requests otherwise go to GitHub issues:
  https://github.com/Prasenjit-Sharma/cardpulse/issues (the policy's "Changes and contact").
- Independent security review: no.

## Deletion

- **On the phone:** Settings → Delete all data, or uninstall the app. ("Deleting your data", "On this phone")
- **On the server:** Settings → Account → Delete cloud data removes synced contacts and photos, published cards and
  any details not yet received. The plan, packs and their record are kept, since they are what was paid for. ("On the server")
- **The account:** Settings → Account → Delete account removes all of the above, including the plan and its record,
  and the account itself. ("The account")

## Other App content answers

- **Ads:** the app contains no ads. ("There is no analytics, advertising or tracking")
- **Target audience:** adults (18+). It's a business tool. ("Pulse is a business tool and is not directed at children.")
- **Privacy policy URL:** https://prasenjit-sharma.github.io/cardpulse/privacy.html. Open it in a browser and check
  it loads before submitting.
- **Data deletion URL**, which Play requires for apps with accounts: https://prasenjit-sharma.github.io/cardpulse/delete-account.html
  (`public/delete-account.html`). Add the contact address first (blocker 2).
