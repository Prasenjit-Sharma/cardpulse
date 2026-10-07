# Google Play Data safety: answers (draft, check before submitting)

These answers are taken from the privacy policy, `public/privacy.html` (last updated 6 October 2026). Each one cites the
line it rests on. Check them against the app and the policy as they stand on the day you submit; the form and the
policy must say the same thing.

Play Console → App content → Data safety.

## Overview questions

| Question | Answer | Policy line |
|---|---|---|
| Does your app collect or share any of the required user data types? | Yes | "With an account (Google sign-in)" |
| Is all of the user data collected by your app encrypted in transit? | Yes (HTTPS to Supabase, the Pulse reading service and Google) | Supabase and the Cloudflare Worker are HTTPS only |
| Do you provide a way for users to request that their data is deleted? | Yes, in the app (Settings → Account → Delete cloud data / Delete account) | "Deleting your data" |

## Data collected

"Collected" means it leaves the phone for Pulse's servers. Data that stays on the phone is not collected in Play's sense.

| Data type (Play's name) | Collected? | Shared? | Optional? | Purpose | Policy line |
|---|---|---|---|---|---|
| Personal info → **Name** | Yes | No | Required to read cards (sign-in) | Account management | "We receive your name and email address from Google." |
| Personal info → **Email address** | Yes | No | Required to read cards (sign-in) | Account management | same |
| Photos and videos → **Photos** | Yes (card photos sent for reading; not stored or logged) | No (processed by Google Gemini as a service provider) | Required to read a card | App functionality | "Card photos you scan … are sent to the Pulse reading service … They are not stored or logged by us." |
| **Contacts** | Only if the user turns on sync, publishes a card, or collects leads at a stall | No | Optional | App functionality | "Sync, only if you turn it on", "A published card …", "If you sent your details through someone's card" |
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
- **Data deletion URL**, which Play asks for apps with accounts: point to the privacy policy's "Deleting your data"
  section, or add a short page. Decide before submitting.
