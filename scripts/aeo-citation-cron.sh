#!/bin/bash
# Cron-only replacement for the claude.ai/code "frame-roofing-aeo-citation-monitor"
# trigger. Runs the AEO check via SerpAPI, drafts action items via local
# mistral-nemo:12b, commits the report. No Claude tokens.
#
# Schedule: 5th of each month at 8:23am Mac local time (matches the original).

set -u

REPO="$HOME/projects/frame-restoration-utah"
ENV_FILE="$HOME/.config/frame-roofing-utah/.env"
LOG="$HOME/.cache/frame-roofing-aeo.log"
TODAY=$(date +%F)

mkdir -p "$(dirname "$LOG")"
log() { echo "[$(date '+%F %T')] $*" | tee -a "$LOG" >&2; }

if [ ! -f "$ENV_FILE" ]; then
  log "✗ Missing $ENV_FILE — needs SERPAPI_KEY."; exit 1
fi
# shellcheck disable=SC1090
set -a; . "$ENV_FILE"; set +a

cd "$REPO" || { log "✗ Repo not found at $REPO"; exit 1; }
current_branch=$(git rev-parse --abbrev-ref HEAD 2>/dev/null || echo "")
if [ "$current_branch" != "main" ]; then
  log "✗ Not on main (currently $current_branch). Skipping."; exit 1
fi
git fetch origin main --quiet 2>>"$LOG" || true
git pull --rebase origin main --quiet 2>>"$LOG" || true

log "→ Running AEO citation monitor"
python3 scripts/aeo-citation-monitor.py >>"$LOG" 2>&1
RUN_EXIT=$?

REPORT="$REPO/data/aeo-citations/${TODAY}.md"
if [ "$RUN_EXIT" -ne 0 ] || [ ! -f "$REPORT" ]; then
  log "✗ Monitor failed (exit=$RUN_EXIT). See $LOG."
  exit 1
fi

# Score line for the commit message
SCORE=$(grep -m1 -oE "cited in [0-9]+ of [0-9]+" "$REPORT" || echo "—")
log "✓ Report ready: $SCORE"

git config user.name 'AEO Monitor'
git config user.email 'aeo-monitor@frameroofingutah.com'
git add data/aeo-citations/ 2>>"$LOG" || true
if git diff --cached --quiet; then
  log "⚠ Nothing staged (report unchanged?)"; exit 0
fi
git commit -m "chore(aeo): citation monitor report ${TODAY} — ${SCORE}" >>"$LOG" 2>&1 || {
  log "✗ git commit failed"; exit 1; }
git push origin main >>"$LOG" 2>&1 || { log "✗ git push failed"; exit 1; }
log "✓ Pushed: ${SCORE}"
