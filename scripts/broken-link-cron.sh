#!/bin/bash
# Frame Restoration Utah — broken-link loop, Mac launchd entrypoint.
#
# Two halves, both report-only:
#   1. static   scripts/audit-links.mjs         every local href in the checkout resolves
#   2. live     scripts/check-broken-links.mjs  every link on the live sitemap pages answers
#
# This job NEVER commits, pushes, deploys, or touches GBP/Twilio/Vercel. It
# writes a JSON report + a log outside the repo and exits non-zero when a
# broken link is found, so launchd/the watchdog can see a red run. Fixing the
# link stays a human-reviewed draft PR.
#
# Market isolation: the live half refuses any --site that is not this market's
# host and never fetches a URL on another host (see check-broken-links.mjs).
#
# Usage:
#   bash scripts/broken-link-cron.sh                 # full run, report to $OUT_DIR
#   bash scripts/broken-link-cron.sh --dry-run       # read-only: prints results, writes no report
#   bash scripts/broken-link-cron.sh --urls list.txt # one public URL list instead of the live sitemap
#   bash scripts/broken-link-cron.sh --static-only | --live-only
#
# Env (all optional):
#   FRAME_UTAH_REPO   checkout to audit            default: the repo this script lives in
#   FRAME_UTAH_SITE   origin to crawl              default: https://www.framerestorationutah.com
#   FRAME_UTAH_LINK_LOG   log file                 default: ~/.cache/frame-roofing-links.log
#   FRAME_UTAH_LINK_OUT   report directory         default: ~/.cache/frame-roofing-links
#
# launchd notes (why earlier Mac runs died): launchd starts jobs with cwd `/`
# and a minimal PATH that has no Homebrew node. This script resolves its own
# repo path, puts the usual node locations on PATH, and fails loudly with the
# reason in the log instead of a bare "command not found".

set -u

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
REPO="${FRAME_UTAH_REPO:-$(cd "$SCRIPT_DIR/.." && pwd)}"
SITE="${FRAME_UTAH_SITE:-https://www.framerestorationutah.com}"
LOG="${FRAME_UTAH_LINK_LOG:-$HOME/.cache/frame-roofing-links.log}"
OUT_DIR="${FRAME_UTAH_LINK_OUT:-$HOME/.cache/frame-roofing-links}"
TODAY="$(date +%F)"
STARTED="$(date +%s)"

export PATH="/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:$PATH"

DRY_RUN=0
RUN_STATIC=1
RUN_LIVE=1
URL_LIST=""
EXTRA_ARGS=()
while [ $# -gt 0 ]; do
  case "$1" in
    --dry-run) DRY_RUN=1 ;;
    --static-only) RUN_LIVE=0 ;;
    --live-only) RUN_STATIC=0 ;;
    --urls) URL_LIST="${2:-}"; shift ;;
    --max-pages|--max-links|--timeout|--concurrency) EXTRA_ARGS+=("$1" "${2:-}"); shift ;;
    --quiet) EXTRA_ARGS+=("--quiet") ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    *) echo "unknown argument: $1" >&2; exit 2 ;;
  esac
  shift
done

mkdir -p "$(dirname "$LOG")" "$OUT_DIR" 2>/dev/null || true
# Keep the log from growing without bound (launchd jobs run for months).
if [ -f "$LOG" ] && [ "$(wc -c <"$LOG" | tr -d ' ')" -gt 5000000 ]; then
  tail -c 1000000 "$LOG" >"$LOG.tmp" && mv "$LOG.tmp" "$LOG"
fi

log() { echo "[$(date '+%F %T')] [link-loop] $*" | tee -a "$LOG" >&2; }
finish() {
  local status="$1"
  log "$status runtime=$(( $(date +%s) - STARTED ))s"
}

if ! command -v node >/dev/null 2>&1; then
  log "x node not on PATH ($PATH). Install node (brew install node) or set PATH in the plist."
  finish "failed"; exit 2
fi
if [ ! -f "$REPO/index.html" ] || [ ! -f "$REPO/scripts/check-broken-links.mjs" ]; then
  log "x $REPO is not a Frame Restoration Utah checkout (set FRAME_UTAH_REPO)."
  finish "failed"; exit 2
fi

case "$SITE" in
  https://www.framerestorationutah.com|https://framerestorationutah.com|http://127.0.0.1:*|http://localhost:*) ;;
  *) log "x FRAME_UTAH_SITE=$SITE is not this market's host; refusing (no cross-market crawls)."; finish "failed"; exit 2 ;;
esac

[ "$DRY_RUN" -eq 1 ] && log "DRY RUN — read-only, nothing written to $OUT_DIR"
log "-> repo=$REPO site=$SITE node=$(node --version)"

FAILED=0

if [ "$RUN_STATIC" -eq 1 ]; then
  log "-> static: audit-links.mjs"
  if node "$REPO/scripts/audit-links.mjs" --root "$REPO" --strict 2>&1 | tee -a "$LOG"; then
    log "ok static: all local hrefs resolve"
  else
    log "x static: unresolved local links (see above)"
    FAILED=1
  fi
fi

if [ "$RUN_LIVE" -eq 1 ]; then
  LIVE_ARGS=(--site "$SITE" --strict)
  if [ -n "$URL_LIST" ]; then
    LIVE_ARGS+=(--urls "$URL_LIST")
  else
    LIVE_ARGS+=(--sitemap)   # fetch <site>/sitemap.xml — what search engines see, not the checkout
  fi
  if [ "$DRY_RUN" -eq 1 ]; then
    LIVE_ARGS+=(--dry-run)
  else
    LIVE_ARGS+=(--out "$OUT_DIR/$TODAY.json")
  fi
  log "-> live: check-broken-links.mjs ${LIVE_ARGS[*]} ${EXTRA_ARGS[*]:-}"
  node "$REPO/scripts/check-broken-links.mjs" "${LIVE_ARGS[@]}" "${EXTRA_ARGS[@]}" 2>&1 | tee -a "$LOG"
  LIVE_EXIT=${PIPESTATUS[0]}
  case "$LIVE_EXIT" in
    0) log "ok live: no broken links" ;;
    1) log "x live: broken links found (report: $OUT_DIR/$TODAY.json)"; FAILED=1 ;;
    *) log "x live: run could not complete (exit $LIVE_EXIT)"; FAILED=1 ;;
  esac
fi

if [ "$FAILED" -eq 1 ] && [ "$DRY_RUN" -eq 0 ]; then
  finish "failed"; exit 1
fi
finish "ok"
exit 0
