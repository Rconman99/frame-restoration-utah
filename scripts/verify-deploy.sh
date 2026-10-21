#!/usr/bin/env bash
# verify-deploy.sh — confirm Vercel actually deployed our latest public JS.
#
# Compares the sha256 of a local public file with the production-served copy
# (HTTP 200 required, redirects not followed).
# The default probe is /global-modal.js (loaded by every page). /dashboard is
# login-only since 2026-10-18 (middleware.js), so an anonymous probe of
# /dashboard/dashboard.js now gets 401 and must not be used here.
# Fails loud if drift detected — catches the silent-deploy-failure bug
# discovered 2026-04-28 where PR squash-merge to main didn't trigger
# Vercel's webhook reliably.
#
# Usage:
#   scripts/verify-deploy.sh                            # default: 60s wait + production URL
#   scripts/verify-deploy.sh https://www.framerestorationutah.com/track-clicks.js 90
#                                                       # custom public file + wait
#   The local file is the repo file at the same path as the URL.
#
# Exit codes:
#   0 — production matches local (deploy successful)
#   1 — drift detected (production stale)
#   2 — local file missing or unreadable
#   3 — production unreachable, redirected, or not HTTP 200

set -euo pipefail

PROD_URL="${1:-https://www.framerestorationutah.com/global-modal.js}"
WAIT_SECONDS="${2:-60}"
URL_PATH="/${PROD_URL#*://*/}"
URL_PATH="${URL_PATH%%[?#]*}"
case "$URL_PATH" in
  /dashboard|/dashboard/*|/seo-report*)
    echo "❌ $URL_PATH is login-only; probe a public file instead." >&2
    exit 2
    ;;
esac
LOCAL_FILE="$(cd "$(dirname "$0")/.." && pwd)${URL_PATH}"

if [[ ! -r "$LOCAL_FILE" ]]; then
  echo "❌ Local file not readable: $LOCAL_FILE" >&2
  exit 2
fi

hash_file() {
  if command -v sha256sum >/dev/null 2>&1; then
    sha256sum "$1" | cut -d' ' -f1
  else
    shasum -a 256 "$1" | cut -d' ' -f1
  fi
}

LOCAL_HASH=$(hash_file "$LOCAL_FILE")

echo "[verify-deploy] waiting ${WAIT_SECONDS}s for Vercel to propagate…"
sleep "$WAIT_SECONDS"

# Cache-bust with a UUID query string so we hit fresh CDN nodes.
# Redirects are NOT followed: a redirect (or a login page behind one) is a
# failure, not a deploy.
BUST=$(uuidgen 2>/dev/null || date +%s)
BODY_FILE=$(mktemp)
trap 'rm -f "$BODY_FILE"' EXIT
STATUS=$(curl -s --max-time 30 --proto '=https' -o "$BODY_FILE" -w '%{http_code}' "${PROD_URL}?bust=${BUST}" || true)

if [[ "$STATUS" != "200" ]]; then
  echo "❌ Production did not return HTTP 200 for $PROD_URL (got ${STATUS:-000}; redirects are not followed)." >&2
  exit 3
fi

PROD_HASH=$(hash_file "$BODY_FILE")

echo ""
echo "Local:      sha256 $LOCAL_HASH"
echo "Production: sha256 $PROD_HASH"
echo ""

if [[ "$PROD_HASH" != "$LOCAL_HASH" ]]; then
  echo "❌ Drift detected: production content differs from the local file." >&2
  echo "   Vercel deploy didn't propagate. Options:" >&2
  echo "   1. Push another commit to force a fresh deploy" >&2
  echo "   2. Promote the latest preview manually via Vercel UI" >&2
  echo "   3. Use 'vercel promote <preview-url>' from project root" >&2
  exit 1
fi

echo "✅ Production matches local (sha256). Deploy successful."
exit 0
