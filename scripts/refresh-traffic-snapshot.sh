#!/bin/bash
# Refresh data/traffic-snapshot.json from the live weekly-report edge function.
# Reads the admin PIN from FRAME_REPORT_PIN env var; falls back to ~/.config/frame-utah/.env.
#
# Usage:
#   bash scripts/refresh-traffic-snapshot.sh           # default 90 days
#   bash scripts/refresh-traffic-snapshot.sh 30        # 30-day window
#
# To set the PIN once:
#   mkdir -p ~/.config/frame-utah
#   echo "FRAME_REPORT_PIN=<your-admin-pin>" > ~/.config/frame-utah/.env
#   chmod 600 ~/.config/frame-utah/.env

set -euo pipefail

DAYS="${1:-90}"
KEY="frame-roofing-2026"
HOST="https://hdcflshhomzildwqlmwh.supabase.co"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUT="$REPO_ROOT/data/traffic-snapshot.json"

# Resolve PIN
if [ -z "${FRAME_REPORT_PIN:-}" ] && [ -f "$HOME/.config/frame-utah/.env" ]; then
  # shellcheck disable=SC1091
  source "$HOME/.config/frame-utah/.env"
fi

if [ -z "${FRAME_REPORT_PIN:-}" ]; then
  echo "ERROR: FRAME_REPORT_PIN not set." >&2
  echo "  Set inline:  FRAME_REPORT_PIN=xxx bash scripts/refresh-traffic-snapshot.sh" >&2
  echo "  Or persist:  mkdir -p ~/.config/frame-utah && echo 'FRAME_REPORT_PIN=xxx' > ~/.config/frame-utah/.env" >&2
  exit 1
fi

mkdir -p "$REPO_ROOT/data"
URL="${HOST}/functions/v1/weekly-report?key=${KEY}&pin=${FRAME_REPORT_PIN}&days=${DAYS}"

response="$(curl -sS -w '\n%{http_code}' "$URL")"
http_code="$(echo "$response" | tail -n1)"
body="$(echo "$response" | sed '$d')"

if [ "$http_code" != "200" ]; then
  echo "ERROR: weekly-report returned HTTP $http_code" >&2
  echo "$body" >&2
  exit 1
fi

echo "$body" > "$OUT"
bytes="$(wc -c < "$OUT" | tr -d ' ')"
pageviews="$(python3 -c "import json; print(json.load(open('$OUT'))['summary'].get('total_pageviews', '?'))")"
gen_at="$(python3 -c "import json; print(json.load(open('$OUT')).get('generated_at', '?'))")"

echo "✓ snapshot saved: $OUT (${bytes} bytes)"
echo "  generated_at:  $gen_at"
echo "  window:        ${DAYS} days"
echo "  pageviews:     $pageviews"
