#!/bin/sh
# Builds the web app for one environment and publishes it as that environment's website Worker (server/site.wrangler.toml), with the
# project token (scripts/cf.sh). dev and staging are kept out of search engines; production waits for the website (E).
#   npm run cf:site -- dev
set -e
env="$1"
case "$env" in dev|staging) ;; *) echo "Usage: npm run cf:site -- dev|staging" >&2; exit 1 ;; esac
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root" && npx tsc -b && npx vite build --mode "$env"
printf '/*\n  X-Robots-Tag: noindex, nofollow\n' > dist/_headers
sh "$root/scripts/cf.sh" deploy -c site.wrangler.toml --env "$env"
