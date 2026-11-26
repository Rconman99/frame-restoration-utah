#!/usr/bin/env bash
# Exact-target runner for the three Utah lead migrations:
#   20261027221000_lead_spam_classification.sql
#   20261027230000_ai_referrer_tagging.sql
#   20261122230000_leads_intake_zip_city_source.sql
# Same shape and the same fail-closed gates as
# scripts/run-call-tracking-migrations.sh. It never runs `supabase db push`,
# never repairs history, and never touches any other migration. Only these three
# files and the remote-history poison guard are archived from the exact release
# commit into an empty workdir, and every version already recorded in production
# gets a poison guard, so `migration up --include-all` can only apply these
# three, in timestamp order, in one guarded run. Preflight and apply are
# separate processes; receipts are kept in a mode-0700 directory. Usage, from a
# clean checkout of main:
#   RELEASE_SHA=<origin/main tip> SUPABASE_BIN=<verified 2.113.0 CLI> \
#   LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK=<same SHA> \
#   LEAD_MIGRATION_EXECUTION_MODE=preflight|apply \
#   LEAD_MIGRATION_AUTH_MODE=keychain-profile|injected-token \
#   scripts/run-lead-migrations.sh
# Operator runbook: docs/runbooks/utah-lead-migrations.md

set -euo pipefail
umask 077

fail() {
  printf 'Hard stop: %s\n' "$1" >&2
  exit 1
}

PROJECT_REF='hdcflshhomzildwqlmwh'
T1_VERSION='20261027221000'
T1_BASENAME='20261027221000_lead_spam_classification.sql'
T1_SHA256='2fecd49d87cebaa3e785a99b32294708fdc4241da0ceb3ee4863448fe512a507'
T2_VERSION='20261027230000'
T2_BASENAME='20261027230000_ai_referrer_tagging.sql'
T2_SHA256='153386fa51d487fdb58c4c926065f256913e9b1e262f15a8a6b23181eee458b8'
T3_VERSION='20261122230000'
T3_BASENAME='20261122230000_leads_intake_zip_city_source.sql'
T3_SHA256='5e4bc10232c0426cd3eac03ce6395444af6472028586610631b9c489deb46cf0'
GUARD_PATH='supabase/migration-baselines/remote-applied-history-guard.sql'
GUARD_SHA256='d770275383205c9012ad693400724e529e6dae90619d658a35b762dda8015752'
BASELINE_SHA256='bdc617f4eed447c1cdeef74709775f94cac81203925793752b933191725213f4'
CALL_TRACKING_BASELINE_SHA256='0672ba0220cb3be6195316bf148b19ba0a0f68e97f503a5319c55c6f995556ea'
CLI_SHA256='ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a'

# Production migration history read on 2026-11-25 (36 versions), the same
# reviewed baseline scripts/run-call-tracking-migrations.sh pins.
BASELINE_VERSIONS="$(cat <<'VERSIONS'
20260320023416
20260320023541
20260320202722
20260320202912
20260320210930
20260409044027
20260410182354
20260411003850
20260411004150
20260427211024
20260427211116
20260427211814
20260427214847
20260427223827
20260427223851
20260507211125
20260508000203
20260511015537
20260511220802
20260512005558
20260527064542
20260608205857
20260610
20260807000090
20260807000095
20260807000100
20260807000125
20260807000140
20260807000150
20260807000160
20260807000165
20260807000170
20260812010000
20260905200000
20260910200000
20260914200000
VERSIONS
)"

# The call-tracking pair applied by scripts/run-call-tracking-migrations.sh. The
# only accepted remote histories are the 36-version baseline, or that baseline
# plus BOTH of these (38), in either case plus any already-recorded subset of
# the three lead targets. One of the two is a hard stop: that is an interrupted
# call-tracking run, and it must finish through its own runner first.
CALL_TRACKING_VERSIONS="$(cat <<'VERSIONS'
20261027200000
20261027220000
VERSIONS
)"

test "$(printf '%s\n' "$BASELINE_VERSIONS" | shasum -a 256 | awk '{print $1}')" = \
  "$BASELINE_SHA256" || fail 'reviewed migration-history baseline digest differs'
test "$(printf '%s\n%s\n' "$BASELINE_VERSIONS" "$CALL_TRACKING_VERSIONS" \
  | sed '/^$/d' | LC_ALL=C sort | shasum -a 256 | awk '{print $1}')" = \
  "$CALL_TRACKING_BASELINE_SHA256" || \
  fail 'reviewed call-tracking migration-history baseline digest differs'

REPO_ROOT="$(git rev-parse --show-toplevel)"
RELEASE_SHA="${RELEASE_SHA:-}"
SUPABASE_BIN="${SUPABASE_BIN:-}"
EXECUTION_MODE="${LEAD_MIGRATION_EXECUTION_MODE:-}"
AUTH_MODE="${LEAD_MIGRATION_AUTH_MODE:-}"

test "${#RELEASE_SHA}" -eq 40 || fail 'RELEASE_SHA must be a full 40-character commit'
# Enumerated, not a range: under a UTF-8 collation `[!0-9a-f]` does not reject
# A-F, so a range would let an uppercase SHA through this gate.
case "$RELEASE_SHA" in
  *[!0123456789abcdef]*) fail 'RELEASE_SHA must be lowercase hexadecimal' ;;
esac
test -n "$SUPABASE_BIN" && test -x "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI'
test "${LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA" || \
  fail 'secure the exclusive migration-writer window and bind its acknowledgement to RELEASE_SHA'
case "$EXECUTION_MODE" in
  preflight|apply) ;;
  *) fail 'LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply' ;;
esac
case "$AUTH_MODE" in
  injected-token|keychain-profile) ;;
  *) fail 'LEAD_MIGRATION_AUTH_MODE must be injected-token or keychain-profile' ;;
esac
command -v jq >/dev/null || fail 'jq is required'

git -C "$REPO_ROOT" fetch --quiet origin main
test "$(git -C "$REPO_ROOT" rev-parse --verify "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA does not resolve to a commit'
test "$(git -C "$REPO_ROOT" rev-parse origin/main)" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA is not the exact current origin/main tip'

test "$(uname -s)" = 'Darwin' && test "$(uname -m)" = 'arm64' || \
  fail 'the reviewed CLI binary receipt is only valid on macOS arm64'
test "$("$SUPABASE_BIN" --version | head -n 1)" = '2.113.0' || \
  fail 'Supabase CLI 2.113.0 is required'
test "$(basename "$SUPABASE_BIN")" != 'supabase-go' || \
  fail 'the internal supabase-go compatibility binary is forbidden'
test "$(shasum -a 256 "$SUPABASE_BIN" | awk '{print $1}')" = "$CLI_SHA256" || \
  fail 'Supabase CLI binary digest differs from the reviewed official release'

RECEIPT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-lead-migrations.XXXXXX")"
RUNNER_DIR="$RECEIPT_DIR/runner"
mkdir -p "$RUNNER_DIR"
chmod 700 "$RECEIPT_DIR" "$RUNNER_DIR"

case "$AUTH_MODE" in
  injected-token)
    test -n "${SUPABASE_ACCESS_TOKEN:-}" || \
      fail 'inject SUPABASE_ACCESS_TOKEN from approved secret storage'
    export SUPABASE_NO_KEYRING=1
    ;;
  keychain-profile)
    test -z "${SUPABASE_ACCESS_TOKEN:-}" || \
      fail 'SUPABASE_ACCESS_TOKEN must be absent in keychain-profile mode'
    unset SUPABASE_NO_KEYRING
    command -v security >/dev/null || fail 'macOS security tool is unavailable'
    security find-generic-password -s 'Supabase CLI' -a supabase >/dev/null || \
      fail 'the Supabase CLI Keychain profile is unavailable'
    ;;
esac
projects_json="$("$SUPABASE_BIN" --agent no --output-format json projects list 2>/dev/null)"
jq -e --arg project "$PROJECT_REF" '
  ([.projects[]? | select(.id == $project)] | length) == 1
' <<< "$projects_json" >/dev/null || fail 'the CLI login cannot resolve the exact Utah project'
unset projects_json

"$SUPABASE_BIN" init --workdir "$RUNNER_DIR" >/dev/null
test -f "$RUNNER_DIR/supabase/config.toml" || fail 'the runner workdir has no generated config'
git -C "$REPO_ROOT" archive --format=tar "$RELEASE_SHA" -- \
  "supabase/migrations/$T1_BASENAME" "supabase/migrations/$T2_BASENAME" \
  "supabase/migrations/$T3_BASENAME" "$GUARD_PATH" \
  | tar -xf - -C "$RUNNER_DIR"

sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }
test "$(sha_of "$RUNNER_DIR/supabase/migrations/$T1_BASENAME")" = "$T1_SHA256" || \
  fail "release bytes of $T1_BASENAME differ from the reviewed target"
test "$(sha_of "$RUNNER_DIR/supabase/migrations/$T2_BASENAME")" = "$T2_SHA256" || \
  fail "release bytes of $T2_BASENAME differ from the reviewed target"
test "$(sha_of "$RUNNER_DIR/supabase/migrations/$T3_BASENAME")" = "$T3_SHA256" || \
  fail "release bytes of $T3_BASENAME differ from the reviewed target"
test "$(sha_of "$RUNNER_DIR/$GUARD_PATH")" = "$GUARD_SHA256" || \
  fail 'remote-history guard bytes differ from the reviewed template'
test "$(find "$RUNNER_DIR/supabase/migrations" -mindepth 1 -maxdepth 1 -type f -name '*.sql' \
  | wc -l | tr -d '[:space:]')" = '3' || \
  fail 'the release archive produced something other than the three reviewed targets'

cd "$RUNNER_DIR"
test ! -e supabase/.temp/project-ref || fail 'runner was linked before validation'
"$SUPABASE_BIN" link --project-ref "$PROJECT_REF" --yes >/dev/null
test "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" || fail 'runner linked to the wrong project'

baseline_json="$(printf '%s\n' "$BASELINE_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"
call_tracking_json="$(printf '%s\n' "$CALL_TRACKING_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"

# Read-only catalog probe, specific to the three targets. Same mechanism as the
# call-tracking sibling: one catalog-only SELECT through `db query --linked`.
#   20261027221000  five leads.spam_* columns + two indexes
#   20261027230000  leads.ai_referrer, phone_clicks.ai_referrer, the classifier
#                   and trigger functions, both triggers, and service_role
#                   EXECUTE on the classifier
#   20261122230000  leads.zip, leads.city_source
# Row counts size the lock window: 20261027230000 takes ACCESS EXCLUSIVE on both
# public.leads and public.phone_clicks (ALTER TABLE) and holds it through its
# in-transaction backfill UPDATE of every resolving row in both tables.
run_catalog_probe() {
  "$SUPABASE_BIN" --agent no --output-format json db query --linked <<'SQL'
select
  (select coalesce(jsonb_agg(version::text order by version::text), '[]'::jsonb)
     from supabase_migrations.schema_migrations) as history,
  (select count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
       and column_name in ('spam_label', 'spam_score', 'spam_reason',
                           'spam_classifier', 'spam_classified_at')) as spam_columns,
  (select count(*) from pg_indexes
     where schemaname = 'public' and tablename = 'leads'
       and indexname in ('leads_spam_unclassified_idx',
                         'leads_spam_label_created_idx')) as spam_indexes,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'ai_referrer') as leads_ai_referrer,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'phone_clicks' and column_name = 'ai_referrer') as phone_clicks_ai_referrer,
  to_regprocedure('public.frame_ai_referrer(text,text)') is not null as ai_referrer_function,
  to_regprocedure('public.frame_set_ai_referrer()') is not null as ai_referrer_trigger_function,
  (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
       and ((c.relname = 'leads' and t.tgname = 'leads_set_ai_referrer')
         or (c.relname = 'phone_clicks' and t.tgname = 'phone_clicks_set_ai_referrer'))) as ai_referrer_triggers,
  (case when to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else has_function_privilege('service_role',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_service_role_execute,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'zip') as leads_zip,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'city_source') as leads_city_source,
  (select count(*) from public.leads) as lead_rows,
  (select count(*) from public.phone_clicks) as phone_click_rows;
SQL
}

# Accepted remote history: the reviewed 36-version baseline, or that baseline
# plus BOTH call-tracking versions, in either case plus any already-recorded
# subset of the three lead targets. For each target the catalog must be
# all-absent when its version is not recorded and all-present when it is; a
# half-applied target without a history row is a hard stop, as is one of the two
# call-tracking versions.
validate_catalog_state() {
  jq -e --argjson baseline "$baseline_json" --argjson calltracking "$call_tracking_json" \
    --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" '
      type == "array" and length == 1
      and .[0] as $s
      | ($s.history | any(.[]; . == $t1)) as $r1
      | ($s.history | any(.[]; . == $t2)) as $r2
      | ($s.history | any(.[]; . == $t3)) as $r3
      | ($s.history | any(.[]; . == $calltracking[0])) as $c1
      | ($s.history | any(.[]; . == $calltracking[1])) as $c2
      | ($c1 == $c2)
      and (($s.history | sort) == (($baseline
            + (if $c1 then $calltracking else [] end)
            + (if $r1 then [$t1] else [] end)
            + (if $r2 then [$t2] else [] end)
            + (if $r3 then [$t3] else [] end)) | sort))
      and ($s.spam_columns == (if $r1 then 5 else 0 end))
      and ($s.spam_indexes == (if $r1 then 2 else 0 end))
      and ($s.leads_ai_referrer == $r2)
      and ($s.phone_clicks_ai_referrer == $r2)
      and ($s.ai_referrer_function == $r2)
      and ($s.ai_referrer_trigger_function == $r2)
      and ($s.ai_referrer_triggers == (if $r2 then 2 else 0 end))
      and ($s.ai_referrer_service_role_execute == $r2)
      and ($s.leads_zip == $r3)
      and ($s.leads_city_source == $r3)
      and ($s.lead_rows | type == "number")
      and ($s.phone_click_rows | type == "number")
    ' "$1" >/dev/null || fail "catalog state in $1 differs from the reviewed contract"
}

run_catalog_probe > "$RECEIPT_DIR/catalog.before.json"
validate_catalog_state "$RECEIPT_DIR/catalog.before.json"
r1="$(jq -r --arg v "$T1_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r2="$(jq -r --arg v "$T2_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r3="$(jq -r --arg v "$T3_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
lead_rows="$(jq -er '.[0].lead_rows' "$RECEIPT_DIR/catalog.before.json")"
phone_click_rows="$(jq -er '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.before.json")"

mkdir -p supabase/reviewed-targets
pending=''
add_pending() {
  pending="$(printf '%s\n%s' "$pending" "$1" | sed '/^$/d')"
}
if test "$r1" = 'true'; then
  mv "supabase/migrations/$T1_BASENAME" supabase/reviewed-targets/
else
  add_pending "$T1_BASENAME"
fi
if test "$r2" = 'true'; then
  mv "supabase/migrations/$T2_BASENAME" supabase/reviewed-targets/
else
  add_pending "$T2_BASENAME"
fi
if test "$r3" = 'true'; then
  mv "supabase/migrations/$T3_BASENAME" supabase/reviewed-targets/
else
  add_pending "$T3_BASENAME"
fi
test -n "$pending" || printf 'All three targets are already recorded; postflight checks only.\n'

jq -r '.[0].history[]' "$RECEIPT_DIR/catalog.before.json" | while IFS= read -r version; do
  test -n "$version" || continue
  cp "$GUARD_PATH" "supabase/migrations/${version}_remote_applied_history_guard.sql"
done
test -z "$(find supabase/migrations -mindepth 1 ! -type f -print -quit)" || \
  fail 'migration runner contains a symlink, directory, or special entry'
expected_files=$(( $(jq '.[0].history | length' "$RECEIPT_DIR/catalog.before.json") + $(printf '%s' "$pending" | grep -c . || true) ))
test "$(find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d '[:space:]')" = "$expected_files" || \
  fail 'migration runner file count differs from history plus pending targets'

pending_json="$(printf '%s\n' "$pending" | sed '/^$/d' | sed 's/_.*//' | jq -Rsc 'split("\n") | map(select(length > 0))')"
"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.guarded.json"
jq -e --argjson pending "$pending_json" '
  .migrations as $m
  | ([ $m[] | select(.local == "" and .remote != "") ] | length) == 0
    and ([$m[] | select(.local != "" and .remote == "") | .local] | unique | sort) == ($pending | sort)
    and all($m[]; (.local == "" or .remote == "" or .local == .remote))
' "$RECEIPT_DIR/migration-list.guarded.json" >/dev/null || \
  fail 'guarded migration list is not the matched history plus exactly the pending targets'

run_catalog_probe > "$RECEIPT_DIR/catalog.final-preflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.final-preflight.json"
test "$(jq -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.before.json")" = \
  "$(jq -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.final-preflight.json")" || \
  fail 'catalog changed between preflight and final preflight'

if test "$EXECUTION_MODE" = 'preflight'; then
  printf 'release_sha=%s\nproject_ref=%s\nmode=preflight\npending=%s\nlead_rows=%s\nphone_click_rows=%s\nreceipt_dir=%s\n' \
    "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" \
    "$lead_rows" "$phone_click_rows" "$RECEIPT_DIR"
  printf 'lock_note=20261027230000 holds ACCESS EXCLUSIVE on public.leads (%s rows) and public.phone_clicks (%s rows) through its backfill\n' \
    "$lead_rows" "$phone_click_rows"
  jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.before.json"
  exit 0
fi

if test -n "$pending"; then
  migration_exit=0
  "$SUPABASE_BIN" --agent no --output-format json \
    migration up --linked --include-all --yes \
    > "$RECEIPT_DIR/migration-up.stdout.json" \
    2> "$RECEIPT_DIR/migration-up.stderr.txt" || migration_exit=$?
  grep -Fq 'remote_applied_history_guard.sql' \
    "$RECEIPT_DIR/migration-up.stdout.json" "$RECEIPT_DIR/migration-up.stderr.txt" \
    && fail 'a remote-history poison guard was selected'
  test "$migration_exit" = '0' || \
    fail 'migration up failed; retain receipts and do not repair history'
  applied="$(jq -r '.applied[]? | split("/")[-1]' "$RECEIPT_DIR/migration-up.stdout.json")"
  test "$applied" = "$pending" || fail 'migration up did not apply exactly the pending targets in order'
fi

run_catalog_probe > "$RECEIPT_DIR/catalog.postflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.postflight.json"
jq -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" \
  '.[0].history | any(.[]; . == $t1) and any(.[]; . == $t2) and any(.[]; . == $t3)' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || fail 'postflight history lacks a target'
jq -e '.[0] | .spam_columns == 5 and .spam_indexes == 2
  and .leads_ai_referrer and .phone_clicks_ai_referrer
  and .ai_referrer_function and .ai_referrer_trigger_function
  and .ai_referrer_triggers == 2 and .ai_referrer_service_role_execute
  and .leads_zip and .leads_city_source' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || \
  fail 'postflight catalog is missing an object the three targets create'
test "$(jq -r '.[0].lead_rows' "$RECEIPT_DIR/catalog.postflight.json")" -ge "$lead_rows" || \
  fail 'leads lost rows during the migration'
test "$(jq -r '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.postflight.json")" -ge "$phone_click_rows" || \
  fail 'phone_clicks lost rows during the migration'

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.after.json"
jq -e '.migrations as $m
  | ([ $m[] | select(.local == "" or .remote == "" or .local != .remote) ] | length) == 0' \
  "$RECEIPT_DIR/migration-list.after.json" >/dev/null || \
  fail 'final migration list is not fully matched'

printf 'release_sha=%s\nproject_ref=%s\nmode=apply\napplied=%s\nreceipt_dir=%s\n' \
  "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" "$RECEIPT_DIR"
jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.postflight.json"
