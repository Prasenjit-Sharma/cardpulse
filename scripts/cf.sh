#!/bin/sh
# Runs one Cloudflare (wrangler) command on the Pulse account with the project token from the Mac Keychain, for that
# command only. The Mac's own `wrangler login` (the old development account, until checklist C6) is never touched.
#   npm run cf -- deploy --env dev
set -e
CLOUDFLARE_API_TOKEN=$(security find-generic-password -s cardpulse-cloudflare-token -w) || { echo "No Keychain item cardpulse-cloudflare-token (checklist C2)." >&2; exit 1; }
export CLOUDFLARE_API_TOKEN
export CLOUDFLARE_ACCOUNT_ID=caf6401c7e28c7eb7044a283ea5e96dd
cd "$(dirname "$0")/../server"
exec npx wrangler "$@"
