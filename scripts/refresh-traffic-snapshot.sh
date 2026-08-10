#!/bin/bash
# Refresh data/traffic-snapshot.json from the live weekly-report edge function.
# Login credentials travel once in a POST body to lead-crm; the report request
# uses the returned workday bearer token. Nothing sensitive enters a URL.
# Reads FRAME_REPORT_ROUTING_KEY + FRAME_REPORT_PIN from the environment, with a
# user-only ~/.config/frame-utah/.env fallback.
#
# Usage:
#   bash scripts/refresh-traffic-snapshot.sh           # default 90 days
#   bash scripts/refresh-traffic-snapshot.sh 30        # 30-day window
#
# To configure once:
#   mkdir -p ~/.config/frame-utah
#   $EDITOR ~/.config/frame-utah/.env
#   # FRAME_REPORT_ROUTING_KEY=<current-routing-key>
#   # FRAME_REPORT_PIN=<your-report-pin>
#   chmod 600 ~/.config/frame-utah/.env

set -euo pipefail

DAYS="${1:-90}"
HOST="https://hdcflshhomzildwqlmwh.supabase.co"
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO_ROOT="$(dirname "$SCRIPT_DIR")"
OUT="$REPO_ROOT/data/traffic-snapshot.json"
CONFIG_FILE="${FRAME_UTAH_CONFIG_FILE:-$HOME/.config/frame-utah/.env}"

# Resolve credentials without ever printing them.
if { [ -z "${FRAME_REPORT_ROUTING_KEY:-}" ] || [ -z "${FRAME_REPORT_PIN:-}" ]; } && [ -f "$CONFIG_FILE" ]; then
  # shellcheck disable=SC1090
  source "$CONFIG_FILE"
fi

if [ -z "${FRAME_REPORT_ROUTING_KEY:-}" ] || [ -z "${FRAME_REPORT_PIN:-}" ]; then
  echo "ERROR: FRAME_REPORT_ROUTING_KEY and FRAME_REPORT_PIN must be set." >&2
  echo "  Store them in the environment or a chmod-600 $CONFIG_FILE file." >&2
  exit 1
fi
if ! [[ "$FRAME_REPORT_ROUTING_KEY" =~ ^[A-Za-z0-9._:/-]{4,240}$ ]]; then
  echo "ERROR: FRAME_REPORT_ROUTING_KEY has an invalid shape." >&2
  exit 1
fi
if ! [[ "$FRAME_REPORT_PIN" =~ ^[A-Za-z0-9_-]{4,32}$ ]]; then
  echo "ERROR: FRAME_REPORT_PIN has an invalid shape." >&2
  exit 1
fi
if ! [[ "$DAYS" =~ ^[0-9]{1,3}$ ]] || [ "$DAYS" -lt 1 ] || [ "$DAYS" -gt 365 ]; then
  echo "ERROR: days must be an integer from 1 through 365." >&2
  exit 1
fi
if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq is required to parse the short-lived login response." >&2
  exit 1
fi

umask 077
mkdir -p "$REPO_ROOT/data"
LOGIN_URL="${HOST}/functions/v1/lead-crm?action=login"
REPORT_URL="${HOST}/functions/v1/weekly-report?days=${DAYS}&detail=summary"

login_payload="$(
  jq -cn \
    --arg routing_key "$FRAME_REPORT_ROUTING_KEY" \
    --arg pin "$FRAME_REPORT_PIN" \
    '{routing_key:$routing_key,pin:$pin}'
)"
login_response="$(
  printf '%s' "$login_payload" |
    curl --silent --show-error \
      --connect-timeout 10 \
      --max-time 30 \
      --header 'Content-Type: application/json' \
      --data-binary @- \
      --write-out '\n%{http_code}' \
      "$LOGIN_URL"
)"
login_http_code="$(printf '%s\n' "$login_response" | tail -n 1)"
login_body="$(printf '%s\n' "$login_response" | sed '$d')"
unset login_payload login_response FRAME_REPORT_PIN FRAME_REPORT_ROUTING_KEY

if [ "$login_http_code" != "200" ]; then
  echo "ERROR: dashboard login returned HTTP $login_http_code" >&2
  exit 1
fi
session_token="$(printf '%s' "$login_body" | jq -er '.token | select(type == "string" and length > 0)')" || {
  echo "ERROR: dashboard login did not return a session token." >&2
  exit 1
}
unset login_body

response="$(
  printf 'header = "Authorization: Bearer %s"\n' "$session_token" |
    curl --config - --silent --show-error \
      --connect-timeout 10 \
      --max-time 30 \
      --write-out '\n%{http_code}' \
      "$REPORT_URL"
)"
unset session_token
http_code="$(printf '%s\n' "$response" | tail -n 1)"
body="$(printf '%s\n' "$response" | sed '$d')"

if [ "$http_code" != "200" ]; then
  echo "ERROR: weekly-report returned HTTP $http_code" >&2
  exit 1
fi

printf '%s\n' "$body" > "$OUT"
bytes="$(wc -c < "$OUT" | tr -d ' ')"
pageviews="$(jq -r '.summary.total_pageviews // "?"' "$OUT")"
gen_at="$(jq -r '.generated_at // "?"' "$OUT")"

echo "✓ snapshot saved: $OUT (${bytes} bytes)"
echo "  generated_at:  $gen_at"
echo "  window:        ${DAYS} days"
echo "  pageviews:     $pageviews"
