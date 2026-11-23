#!/usr/bin/env bash
# Submit a list of IndexNow URLs, skipping blank and whitespace-only lines.
# When the list has no real URLs, log that and exit 0 so CI stays green.
# Never treat a 1-byte newline file as a URL to submit.
set -euo pipefail

usage() {
  cat <<'USAGE'
Usage: scripts/indexnow-submit.sh --urls-file FILE [--dry-run]

Reads FILE, drops blank and whitespace-only lines, and submits each remaining
URL with scripts/indexnow-submit.py. Exits 0 when there is nothing to send.

Options:
  --urls-file FILE   Path to a newline-separated URL list (required)
  --dry-run          Pass --dry-run to indexnow-submit.py (no live request)
  -h, --help         Show this help

Environment:
  INDEXNOW_SUBMITTER   Optional executable used instead of indexnow-submit.py.
                       Called as: $INDEXNOW_SUBMITTER [--dry-run] <url>
                       Use this in tests so no live IndexNow request is made.
USAGE
}

DRY_RUN=0
URLS_FILE=""

while [ $# -gt 0 ]; do
  case "$1" in
    --urls-file)
      URLS_FILE="${2:-}"
      shift 2
      ;;
    --dry-run)
      DRY_RUN=1
      shift
      ;;
    -h|--help)
      usage
      exit 0
      ;;
    *)
      echo "Unknown argument: $1" >&2
      usage >&2
      exit 2
      ;;
  esac
done

if [ -z "$URLS_FILE" ]; then
  echo "error: --urls-file is required" >&2
  usage >&2
  exit 2
fi

if [ ! -f "$URLS_FILE" ]; then
  echo "error: urls file not found: $URLS_FILE" >&2
  exit 2
fi

ROOT="$(cd "$(dirname "$0")/.." && pwd)"
FILTERED="$(mktemp)"
trap 'rm -f "$FILTERED"' EXIT

# grep exits 1 when every line is filtered out; that is a valid empty list.
if ! grep -v '^[[:space:]]*$' "$URLS_FILE" > "$FILTERED"; then
  :
fi

if [ ! -s "$FILTERED" ]; then
  echo "No changed page is in the sitemap; nothing to submit."
  exit 0
fi

COUNT="$(wc -l < "$FILTERED" | tr -d ' ')"
echo "Submitting ${COUNT} changed URL(s):"
cat "$FILTERED"

submit_one() {
  local url="$1"
  if [ -n "${INDEXNOW_SUBMITTER:-}" ]; then
    if [ "$DRY_RUN" -eq 1 ]; then
      "$INDEXNOW_SUBMITTER" --dry-run "$url"
    else
      "$INDEXNOW_SUBMITTER" "$url"
    fi
    return
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    python3 "$ROOT/scripts/indexnow-submit.py" --dry-run --url "$url"
  else
    python3 "$ROOT/scripts/indexnow-submit.py" --url "$url"
  fi
}

# Use if/then so a skipped blank line cannot become the loop's last status
# under `set -e` (the failure that broke run 43074212567).
while IFS= read -r url || [ -n "$url" ]; do
  if [ -n "$url" ]; then
    submit_one "$url"
  fi
done < "$FILTERED"
