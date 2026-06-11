#!/bin/bash
# Frame Roofing Utah — twice-weekly blog DRAFT + AUTO-PUBLISH runner.
#
# New launchd entrypoint for the dedicated blogbot worktree
# (~/projects/frame-restoration-utah-blogbot). Supersedes calling
# blog-cron.sh directly: this runs the existing draft stage, then pushes the
# oldest clean drafted manifest live via scripts/blog-publish.py --push.
#
# The blogbot worktree is dedicated to the bot, so a hard reset to
# origin/main at the top of every run is safe — NEVER point this script at
# the main shared checkout.

set -u

REPO="${FRAME_UTAH_REPO:-$HOME/projects/frame-restoration-utah-blogbot}"
LOG="${FRAME_UTAH_BLOG_LOG:-$HOME/.cache/frame-roofing-blog.log}"
STARTED=$(date +%s)

mkdir -p "$(dirname "$LOG")"

log() {
  echo "[$(date '+%F %T')] [publish-cron] $*" >>"$LOG" 2>&1
}

finish() {
  local status="$1"
  local runtime=$(( $(date +%s) - STARTED ))
  log "$status runtime=${runtime}s"
}

# -e not -d: in a git worktree (the blogbot's normal home) .git is a FILE.
if [ ! -e "$REPO/.git" ]; then
  log "x Repo not found at $REPO"
  finish "failed"
  exit 1
fi

cd "$REPO" || {
  log "x Could not cd to $REPO"
  finish "failed"
  exit 1
}

# Dedicated bot worktree: start every run from a clean origin/main.
log "-> Syncing blogbot worktree to origin/main"
if ! git fetch origin >>"$LOG" 2>&1; then
  log "x git fetch origin failed"
  finish "failed"
  exit 1
fi
if ! git reset --hard origin/main >>"$LOG" 2>&1; then
  log "x git reset --hard origin/main failed"
  finish "failed"
  exit 1
fi

# Stage 1 — draft (existing twice-weekly draft runner). Tolerate failure:
# "no-new-target" is normal when the pending queue already has items, and a
# draft miss should never block publishing the existing queue.
log "-> Stage 1: draft (blog-cron.sh)"
if FRAME_UTAH_REPO="$REPO" bash scripts/blog-cron.sh >>"$LOG" 2>&1; then
  log "✓ Draft stage ok"
else
  log "! Draft stage failed or found no new target (continuing to publish stage)"
fi

# Stage 2 — auto-publish the oldest clean drafted manifest.
log "-> Stage 2: publish (blog-publish.py --push)"
if python3 scripts/blog-publish.py --push >>"$LOG" 2>&1; then
  log "✓ Publish stage ok"
  finish "ok"
  exit 0
else
  log "x Publish stage failed (see lines above)"
  finish "failed"
  exit 1
fi
