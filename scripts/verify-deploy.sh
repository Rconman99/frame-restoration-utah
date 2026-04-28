#!/usr/bin/env bash
# verify-deploy.sh — confirm Vercel actually deployed our latest dashboard.js.
#
# Compares the local dashboard.js byte size to the production-served version.
# Fails loud if drift detected — catches the silent-deploy-failure bug
# discovered 2026-04-28 where PR squash-merge to main didn't trigger
# Vercel's webhook reliably.
#
# Usage:
#   scripts/verify-deploy.sh                            # default: 60s wait + production URL
#   scripts/verify-deploy.sh https://example.com 90    # custom URL + custom wait
#
# Exit codes:
#   0 — production matches local (deploy successful)
#   1 — drift detected (production stale)
#   2 — local file missing or unreadable
#   3 — production unreachable

set -euo pipefail

PROD_URL="${1:-https://www.frameroofingutah.com/dashboard/dashboard.js}"
WAIT_SECONDS="${2:-60}"
LOCAL_FILE="$(cd "$(dirname "$0")/.." && pwd)/dashboard/dashboard.js"

if [[ ! -r "$LOCAL_FILE" ]]; then
  echo "❌ Local file not readable: $LOCAL_FILE" >&2
  exit 2
fi

LOCAL_SIZE=$(wc -c < "$LOCAL_FILE")

echo "[verify-deploy] waiting ${WAIT_SECONDS}s for Vercel to propagate…"
sleep "$WAIT_SECONDS"

# Cache-bust with a UUID query string so we hit fresh CDN nodes
BUST=$(uuidgen 2>/dev/null || date +%s)
PROD_BYTES=$(curl -sL --max-time 30 "${PROD_URL}?bust=${BUST}" | wc -c)

if [[ "$PROD_BYTES" -eq 0 ]]; then
  echo "❌ Production unreachable: $PROD_URL" >&2
  exit 3
fi

echo ""
echo "Local:      $LOCAL_SIZE bytes"
echo "Production: $PROD_BYTES bytes"
echo ""

if [[ "$PROD_BYTES" -ne "$LOCAL_SIZE" ]]; then
  echo "❌ Drift detected: production is $((PROD_BYTES - LOCAL_SIZE)) bytes off." >&2
  echo "   Vercel deploy didn't propagate. Options:" >&2
  echo "   1. Push another commit to force a fresh deploy" >&2
  echo "   2. Promote the latest preview manually via Vercel UI" >&2
  echo "   3. Use 'vercel promote <preview-url>' from project root" >&2
  exit 1
fi

echo "✅ Production matches local. Deploy successful."
exit 0
