#!/bin/zsh
# cyborg-send.sh — Send a Twilio SMS via the send-message edge function.
#
# Usage:
#   cyborg-send.sh +14353024422 "message text"             # inline message
#   cyborg-send.sh +14353024422 -f path/to/message.txt     # message from file
#   cyborg-send.sh +14353024422 --prefix "message text"    # send "I am Cyborg Ryan." first
#   cyborg-send.sh +14353024422 --prefix -f message.txt
#   cyborg-send.sh --dry-run +14353024422 "message"        # build payload, don't send
#
# Env (auto-loaded from ~/.config/frame-roofing-utah/.env):
#   SUPABASE_URL                — Frame Roofing Utah project URL
#   SUPABASE_SERVICE_ROLE_KEY   — for Supabase verify_jwt gate
#   CYBORG_SEND_TOKEN           — auth token the send-message function expects

set -eu

CONFIG="$HOME/.config/frame-roofing-utah/.env"
if [ -f "$CONFIG" ]; then
  set -a
  source "$CONFIG"
  set +a
fi

: "${SUPABASE_URL:?Set SUPABASE_URL in ~/.config/frame-roofing-utah/.env}"
: "${SUPABASE_SERVICE_ROLE_KEY:?Set SUPABASE_SERVICE_ROLE_KEY in ~/.config/frame-roofing-utah/.env}"
: "${CYBORG_SEND_TOKEN:?Set CYBORG_SEND_TOKEN in ~/.config/frame-roofing-utah/.env}"

PREFIX=false
DRY_RUN=false
TO=""
BODY=""
FROM_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --prefix)   PREFIX=true; shift ;;
    --dry-run)  DRY_RUN=true; shift ;;
    -f|--file)  FROM_FILE="$2"; shift 2 ;;
    -h|--help)
      sed -n '2,15p' "$0"
      exit 0 ;;
    +*)
      if [ -z "$TO" ]; then TO="$1"; else BODY="$1"; fi
      shift ;;
    *)
      if [ -z "$TO" ]; then
        echo "first positional arg must be an E.164 phone like +14353024422" >&2
        exit 2
      fi
      BODY="$1"; shift ;;
  esac
done

if [ -z "$TO" ]; then
  echo "Usage: $(basename "$0") +14353024422 [--prefix] (\"message\" | -f file.txt)" >&2
  exit 2
fi

if [ -n "$FROM_FILE" ]; then
  if [ ! -r "$FROM_FILE" ]; then
    echo "cannot read $FROM_FILE" >&2; exit 2
  fi
  BODY="$(cat "$FROM_FILE")"
fi

if [ -z "$BODY" ]; then
  echo "empty body — pass a message or -f file.txt" >&2; exit 2
fi

PAYLOAD=$(python3 -c '
import json, sys
print(json.dumps({
    "to": sys.argv[1],
    "body": sys.argv[2],
    "prefix": sys.argv[3] == "true",
}))
' "$TO" "$BODY" "$PREFIX")

if $DRY_RUN; then
  echo "=== DRY RUN — would POST ==="
  echo "URL: $SUPABASE_URL/functions/v1/send-message"
  echo "Payload (first 400 chars):"
  echo "$PAYLOAD" | head -c 400
  echo ""
  exit 0
fi

echo "→ sending to $TO (prefix=$PREFIX) ..."
RESP=$(curl -sS -X POST "$SUPABASE_URL/functions/v1/send-message" \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  -H "X-Cyborg-Token: $CYBORG_SEND_TOKEN" \
  -H "Content-Type: application/json" \
  -d "$PAYLOAD")

echo "$RESP" | python3 -m json.tool 2>/dev/null || echo "$RESP"
