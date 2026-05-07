#!/bin/bash
# Cron-only replacement for the claude.ai/code "frame-roofing-google-reviews"
# scheduled trigger. Runs the existing Python scraper, branches on exit code,
# commits + pushes when the count/rating changes. No LLM in the loop.
#
# Why this exists: the original Claude trigger spent tokens on a session that
# really only needed bash + git. This script does the exact same work for $0.
#
# Schedule: 1st and 15th of each month at 7:17am Denver (via launchd).
# Secrets:  ~/.config/frame-roofing-utah/.env (SERPAPI_KEY)
# Logs:     ~/.cache/frame-roofing-reviews.log

set -u

REPO="$HOME/projects/frame-restoration-utah"
ENV_FILE="$HOME/.config/frame-roofing-utah/.env"
LOG="$HOME/.cache/frame-roofing-reviews.log"
STARTED=$(date +%s)

mkdir -p "$(dirname "$LOG")"

log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG" >&2; }

# Helper: log run to local-llm-toolkit telemetry. Silent fail — telemetry must
# never break the cron.
log_telemetry() {
  local status="$1" tokens="$2" usd="$3"
  local runtime=$(( $(date +%s) - STARTED ))
  python3 -c "
import sys, pathlib
sys.path.insert(0, str(pathlib.Path.home() / 'projects/local-llm-toolkit/scripts'))
try:
    from llm_telemetry import log_run
    log_run('frame-roofing-reviews', status='$status', tokens_saved=$tokens,
            est_usd_saved=$usd, runtime_sec=$runtime)
except Exception:
    pass
" 2>/dev/null || true
}

# Load secrets
if [ ! -f "$ENV_FILE" ]; then
  log "✗ Missing $ENV_FILE — set SERPAPI_KEY there and retry."
  exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

if [ -z "${SERPAPI_KEY:-}" ]; then
  log "✗ SERPAPI_KEY empty in $ENV_FILE."
  exit 1
fi

cd "$REPO" || { log "✗ Repo not found at $REPO"; exit 1; }

# Make sure we're on main and up to date — refusing to run on a feature branch
# avoids accidentally pushing review updates onto unrelated work.
current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$current_branch" != "main" ]; then
  log "✗ Not on main (currently on $current_branch). Skipping run."
  exit 1
fi
git fetch origin main --quiet 2>>"$LOG" || log "⚠ git fetch failed (continuing)"
git pull --rebase origin main --quiet 2>>"$LOG" || log "⚠ git pull failed (continuing)"

log "→ Running update-google-reviews.py"
python3 scripts/update-google-reviews.py 2>>"$LOG"
exit_code=$?

# Estimated savings vs. the original Claude trigger that did script-orchestration
# in-session: ~8K input + 1K output. If 0 changes today, slightly less.
SAVED_TOKENS=9000
SAVED_USD="0.04"

case "$exit_code" in
  0)
    count=$(python3 -c "import json; print(json.load(open('data/google-reviews.json'))[-1]['count'])" 2>/dev/null || echo "?")
    rating=$(python3 -c "import json; print(json.load(open('data/google-reviews.json'))[-1].get('rating','?'))" 2>/dev/null || echo "?")
    log "✓ Files changed — count=$count rating=$rating"

    git config user.name 'Review Bot'
    git config user.email 'review-bot@frameroofingutah.com'
    git add index.html pages/about.html data/google-reviews.json reviews.json 2>>"$LOG" || true
    if git diff --cached --quiet; then
      log "⚠ Script reported change but no files staged — skipping commit."
      exit 0
    fi
    git commit -m "chore: google reviews → ${count} (auto-update)" >>"$LOG" 2>&1 || {
      log "✗ git commit failed"; exit 1; }
    git push origin main >>"$LOG" 2>&1 || { log "✗ git push failed"; exit 1; }
    log "✓ Pushed: count=$count rating=$rating"

    # Anomaly flag — rating below 5.0 is worth surfacing.
    if [ "$rating" != "?" ] && awk -v r="$rating" 'BEGIN{exit !(r+0 < 5.0)}'; then
      log "⚠ ANOMALY: rating dropped below 5.0 (now $rating) — review GBP."
    fi
    log_telemetry "ok" "$SAVED_TOKENS" "$SAVED_USD"
    ;;
  2)
    log "✓ No change — live count matches site."
    log_telemetry "no-change" "$SAVED_TOKENS" "$SAVED_USD"
    ;;
  *)
    log "✗ Script error (exit=$exit_code). Did NOT commit. See $LOG for details."
    log_telemetry "failed" "0" "0.0"
    exit 1
    ;;
esac
