#!/bin/sh
# Puts each environment's Gemini key into its Worker as an encrypted secret, straight from the Mac Keychain (never shown,
# never written to disk): dev and staging get cardpulse-gemini-test, prod gets cardpulse-gemini-prod.
#   npm run cf:secrets            (all three)      npm run cf:secrets -- dev   (one)
set -e
here="$(dirname "$0")"
for env in ${1:-dev staging prod}; do
  item=cardpulse-gemini-test; [ "$env" = prod ] && item=cardpulse-gemini-prod
  security find-generic-password -s "$item" -w | "$here/cf.sh" secret put GEMINI_API_KEY --env "$env"
done
