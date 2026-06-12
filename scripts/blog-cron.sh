#!/bin/bash
# Frame Roofing Utah blog draft runner.
#
# This stage is intentionally draft-first: it creates the next manifest and logs
# the render command. The scheduled launchd entrypoint is blog-publish-cron.sh,
# which runs this draft stage first, then auto-publishes only clean `drafted`
# manifests through scripts/blog-publish.py --push.
#
# Optional: set FRAME_UTAH_BLOG_AUTO_RENDER=1 to render with the fallback Heber
# project image after drafting. The script still does not commit or push.

set -u

REPO="${FRAME_UTAH_REPO:-$HOME/projects/frame-restoration-utah-blogbot}"
LOG="${FRAME_UTAH_BLOG_LOG:-$HOME/.cache/frame-roofing-blog.log}"
OLLAMA_BASE="${OLLAMA_URL:-http://127.0.0.1:11434}"
OLLAMA_MODEL="${OLLAMA_MODEL:-nemotron-3-nano:30b}"
AUTO_RENDER="${FRAME_UTAH_BLOG_AUTO_RENDER:-0}"
RECENT_CITY_DAYS="${FRAME_UTAH_BLOG_RECENT_CITY_DAYS:-21}"
TARGET_TOP="${FRAME_UTAH_BLOG_TARGET_TOP:-80}"
USE_WEATHER="${FRAME_UTAH_BLOG_USE_WEATHER:-1}"
STARTED=$(date +%s)

mkdir -p "$(dirname "$LOG")"

log() {
  echo "[$(date '+%F %T')] $*" >&2
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

if ! curl -fsS "$OLLAMA_BASE/api/tags" >/dev/null 2>&1; then
  log "x Ollama unreachable at $OLLAMA_BASE. Start with: brew services start ollama"
  finish "failed"
  exit 1
fi

if ! git diff --quiet || ! git diff --cached --quiet; then
  log "x Worktree has uncommitted changes; refusing to draft on a dirty tree."
  git status --short >>"$LOG" 2>&1 || true
  finish "failed"
  exit 1
fi

git fetch origin main --quiet >>"$LOG" 2>&1 || log "! git fetch origin main failed; continuing with local refs"

upstream="$(git rev-parse --abbrev-ref --symbolic-full-name '@{u}' 2>/dev/null || true)"
if [ "$upstream" = "origin/main" ]; then
  git pull --rebase origin main --quiet >>"$LOG" 2>&1 || {
    log "x git pull --rebase origin main failed"
    finish "failed"
    exit 1
  }
else
  log "! Current branch does not track origin/main (upstream=${upstream:-none}); drafting on current checked-out branch."
fi

export FRAME_UTAH_BLOG_RECENT_CITY_DAYS="$RECENT_CITY_DAYS"
export FRAME_UTAH_BLOG_TARGET_TOP="$TARGET_TOP"
export FRAME_UTAH_BLOG_USE_WEATHER="$USE_WEATHER"

target=$(
  python3 - <<'PY'
import json
import os
import pathlib
import subprocess
import sys

repo = pathlib.Path.cwd()
recent_days = os.environ.get("FRAME_UTAH_BLOG_RECENT_CITY_DAYS", "21")
target_top = os.environ.get("FRAME_UTAH_BLOG_TARGET_TOP", "80")
use_weather = os.environ.get("FRAME_UTAH_BLOG_USE_WEATHER", "1")
cmd = [
    sys.executable,
    "scripts/blog-target-prioritizer.py",
    "--json",
    "--top",
    target_top,
    "--exclude-recent-city-days",
    recent_days,
]
if use_weather in {"0", "false", "False", "no", "NO"}:
    cmd.append("--no-weather")
proc = subprocess.run(
    cmd,
    cwd=repo,
    text=True,
    capture_output=True,
)
if proc.stderr:
    print(proc.stderr, file=sys.stderr, end="")
if proc.returncode:
    print(proc.stdout, file=sys.stderr, end="")
    sys.exit(proc.returncode)

data = json.loads(proc.stdout)
pending_keywords = set()
for path in (repo / "data" / "blog-pending").glob("*.json"):
    try:
        manifest = json.loads(path.read_text())
    except Exception:
        continue
    if manifest.get("status") in {"drafted", "needs-review", "pending"}:
        keyword = (manifest.get("keyword") or "").strip().lower()
        if keyword:
            pending_keywords.add(keyword)

for item in data.get("top", []):
    keyword = item.get("keyword", "").strip()
    if keyword and keyword.lower() not in pending_keywords:
        style = "storm" if item.get("service_slug") in {"storm-damage", "roof-repair", "insurance-claims"} else "atmospheric"
        print(json.dumps({
            "keyword": keyword,
            "city": item["city_slug"],
            "city_name": item["city_name"],
            "service": item["service_name"],
            "service_slug": item["service_slug"],
            "style": style,
            "score": item["score"],
            "weather_event": item.get("weather_event"),
        }))
        sys.exit(0)

sys.exit("no-new-target")
PY
)
target_exit=$?

if [ "$target_exit" -ne 0 ] || [ -z "$target" ]; then
  log "x No available blog target found. Check existing pending manifests."
  finish "failed"
  exit 1
fi

keyword=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["keyword"])' "$target")
city=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["city"])' "$target")
city_name=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["city_name"])' "$target")
service=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["service"])' "$target")
service_slug=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("service_slug",""))' "$target")
style=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["style"])' "$target")
score=$(python3 -c 'import json,sys; print(json.loads(sys.argv[1])["score"])' "$target")
event_context=$(python3 -c 'import json,sys; print(((json.loads(sys.argv[1]).get("weather_event") or {}).get("event_context") or ""))' "$target")
event_source_url=$(python3 -c 'import json,sys; print(((json.loads(sys.argv[1]).get("weather_event") or {}).get("source_url") or ""))' "$target")
weather_hazard=$(python3 -c 'import json,sys; print(((json.loads(sys.argv[1]).get("weather_event") or {}).get("hazard") or ""))' "$target")

log "-> Drafting blog target: $city_name x $service (score=$score)"
log "-> Keyword: $keyword"
if [ -n "$weather_hazard" ]; then
  log "-> Weather/current hook: $weather_hazard"
fi

before=$(mktemp)
after=$(mktemp)
find data/blog-pending -type f -name '*.json' -print | sort >"$before" 2>/dev/null || true

draft_cmd=(
  python3 scripts/generate-blog-post.py
  --keyword "$keyword" \
  --city "$city" \
  --style "$style" \
  --ollama-model "$OLLAMA_MODEL"
)
if [ -n "$event_context" ]; then
  draft_cmd+=(--event-context "$event_context")
fi
if [ -n "$event_source_url" ]; then
  draft_cmd+=(--event-source-url "$event_source_url")
fi

"${draft_cmd[@]}" >>"$LOG" 2>&1
draft_exit=$?

if [ "$draft_exit" -ne 0 ]; then
  rm -f "$before" "$after"
  log "x Blog draft failed (exit=$draft_exit). See $LOG."
  finish "failed"
  exit 1
fi

find data/blog-pending -type f -name '*.json' -print | sort >"$after" 2>/dev/null || true
manifest=$(comm -13 "$before" "$after" | tail -1)
rm -f "$before" "$after"

if [ -z "$manifest" ]; then
  manifest=$(find data/blog-pending -type f -name '*.json' -mmin -30 -print0 | xargs -0 stat -f '%m %N' 2>/dev/null | sort -nr | head -1 | cut -d' ' -f2-)
fi

if [ -z "$manifest" ] || [ ! -f "$manifest" ]; then
  log "x Draft completed but no manifest was found."
  finish "failed"
  exit 1
fi

log "✓ Draft manifest: $manifest"

if [ "$AUTO_RENDER" = "1" ]; then
  log "-> Rendering draft with fallback project image"
  python3 scripts/generate-blog-post.py \
    --render \
    --manifest "$manifest" \
    --image-local /images/projects/cities/heber-valley-drone-poster.webp >>"$LOG" 2>&1
  render_exit=$?
  if [ "$render_exit" -ne 0 ]; then
    log "x Render failed (exit=$render_exit). Manifest remains at $manifest."
    finish "failed"
    exit 1
  fi
  log "✓ Rendered HTML for $manifest"
else
  log "Next render command:"
  log "  cd $REPO && python3 scripts/generate-blog-post.py --render --manifest $manifest --image-local /images/projects/cities/heber-valley-drone-poster.webp"
fi

finish "ok"
