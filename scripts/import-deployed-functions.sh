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
# A function directory that already exists is not downloaded again, but it IS validated (index.ts
# present and non-empty) and scanned, so a rerun over an interrupted download cannot report success.
# Exit: 0 clean · 1 a download failed or an import is partial · 3 a hardcoded key was found (3 wins).
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

failed=0
keyfound=0
for f in "${FUNCS[@]}"; do
  dir="supabase/functions/$f"
  if [ -e "$dir" ]; then
    # Never trust what is already there: an interrupted download can leave a directory without index.ts,
    # and a rerun must validate and scan it rather than skip it and exit 0 over a partial import.
    echo "SKIP download for $f: $dir already exists (remove it first to re-download); validating it instead."
  else
    echo "Downloading $f from $PROJECT_REF ..."
    # Guarded so one failed download is reported and the next function still runs (set -e would abort here).
    if ! supabase functions download "$f" --project-ref "$PROJECT_REF" >/dev/null; then
      echo "ERROR: download failed for $f." >&2; failed=1; continue
    fi
    [ -d "$dir" ] || { echo "ERROR: $dir not created." >&2; failed=1; continue; }
  fi
  if [ ! -s "$dir/index.ts" ]; then
    echo "ERROR: $dir/index.ts is missing or empty (partial import). Remove $dir and re-run." >&2
    failed=1; continue
  fi

  # Report locations only. -n prints line numbers; cut drops the matched text.
  legacy="frame-roofing-""2026"
  hit=0
  if grep -rnF "$legacy" "$dir" | cut -d: -f1,2 | sed 's/^/  HARDCODED legacy key at /'; then hit=1; fi
  if grep -rnE '(key|KEY|secret|SECRET|token|TOKEN)[A-Za-z_]*[[:space:]]*(=|===|!==|:)[[:space:]]*["'"'"'][A-Za-z0-9_-]{8,}["'"'"']' "$dir" \
       | cut -d: -f1,2 | sed 's/^/  POSSIBLE hardcoded secret at /'; then hit=1; fi
  if [ "$hit" -eq 1 ]; then keyfound=1; else echo "OK $f: $dir/index.ts present, no hardcoded key found."; fi
done

status=0
[ "$failed" -eq 0 ] || status=1
if [ "$keyfound" -eq 1 ]; then
  status=3
  echo "Hardcoded key(s) found. Do NOT commit until they read from env via _shared/function-key.ts." >&2
fi
exit "$status"
