#!/usr/bin/env bash
# Pull the deployed-only Utah edge functions (reddit-monitor, lead-report) into
# supabase/functions/ so they can be reviewed and fixed in git.
#
# Owner-run, read-only against Supabase: uses `supabase functions download`
# with whatever CLI auth already exists. It does not log in, deploy, change
# secrets, or commit. After download it scans the source for hardcoded keys and
# reports file:line ONLY (never the value).
#
#   bash scripts/import-deployed-functions.sh            # both functions
#   bash scripts/import-deployed-functions.sh lead-report
#
# Next step after a clean download: replace the hardcoded check with
#   import { functionKeyOk, REDDIT_MONITOR_KEY } from "../_shared/function-key.ts";
#   if (!functionKeyOk(req, REDDIT_MONITOR_KEY)) return new Response("Unauthorized", { status: 401 });
# (LEAD_REPORT_KEY for lead-report), then run tests/test_no_shared_routing_key.py.
set -euo pipefail

PROJECT_REF="hdcflshhomzildwqlmwh" # Frame Utah only
REPO_ROOT="$(cd "$(dirname "$0")/.." && pwd)"
cd "$REPO_ROOT"

if [ "$#" -gt 0 ]; then FUNCS=("$@"); else FUNCS=(reddit-monitor lead-report); fi
for f in "${FUNCS[@]}"; do
  case "$f" in reddit-monitor|lead-report) ;; *) echo "ERROR: unexpected function '$f'" >&2; exit 2 ;; esac
done

command -v supabase >/dev/null 2>&1 || { echo "ERROR: supabase CLI not found." >&2; exit 1; }

status=0
for f in "${FUNCS[@]}"; do
  dir="supabase/functions/$f"
  if [ -e "$dir" ]; then
    echo "SKIP $f: $dir already exists (remove it first to re-import)."
    continue
  fi
  echo "Downloading $f from $PROJECT_REF ..."
  supabase functions download "$f" --project-ref "$PROJECT_REF" >/dev/null
  [ -d "$dir" ] || { echo "ERROR: $dir not created." >&2; status=1; continue; }

  # Report locations only. -n prints line numbers; cut drops the matched text.
  legacy="frame-roofing-""2026"
  if grep -rnF "$legacy" "$dir" | cut -d: -f1,2 | sed 's/^/  HARDCODED legacy key at /'; then status=3; fi
  if grep -rnE '(key|KEY|secret|SECRET|token|TOKEN)[A-Za-z_]*[[:space:]]*(=|===|!==|:)[[:space:]]*["'"'"'][A-Za-z0-9_-]{8,}["'"'"']' "$dir" \
       | cut -d: -f1,2 | sed 's/^/  POSSIBLE hardcoded secret at /'; then status=3; fi
done

if [ "$status" -eq 3 ]; then
  echo "Hardcoded key(s) found. Do NOT commit until they read from env via _shared/function-key.ts." >&2
fi
exit "$status"
