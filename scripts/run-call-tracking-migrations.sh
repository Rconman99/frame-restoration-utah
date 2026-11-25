#!/usr/bin/env bash
# Exact-target runner for the Utah call-tracking migrations:
#   20261027200000_call_logs_caller_location.sql
#   20261027220000_call_logs_answered.sql
# It never runs `supabase db push` or touches any other migration. Only these
# two files and the remote-history poison guard are archived from the exact
# release commit into an empty workdir, and every version already recorded in
# production gets a poison guard, so `migration up --include-all` can only
# apply these two. Preflight and apply are separate processes; receipts are
# kept in a mode-0700 directory. Usage, from a clean checkout of main:
#   RELEASE_SHA=<origin/main tip> SUPABASE_BIN=<verified 2.113.0 CLI> \
#   CALL_MIGRATION_EXCLUSIVE_WRITER_ACK=<same SHA> \
#   CALL_MIGRATION_EXECUTION_MODE=preflight|apply \
#   CALL_MIGRATION_AUTH_MODE=keychain-profile|injected-token \
#   scripts/run-call-tracking-migrations.sh

set -euo pipefail
umask 077

fail() {
  printf 'Hard stop: %s\n' "$1" >&2
  exit 1
}

PROJECT_REF='hdcflshhomzildwqlmwh'
T1_VERSION='20261027200000'
T1_BASENAME='20261027200000_call_logs_caller_location.sql'
T1_SHA256='3d38180d599cc7fe7a26deb6cbabd8e192c906a4023432a9175ec1100e0e9fbb'
T2_VERSION='20261027220000'
T2_BASENAME='20261027220000_call_logs_answered.sql'
T2_SHA256='8bd82cbfa299ed839f80f2c83c5cb1a15dd4375eb965728543f8dcb06363fd4c'
GUARD_PATH='supabase/migration-baselines/remote-applied-history-guard.sql'
GUARD_SHA256='d770275383205c9012ad693400724e529e6dae90619d658a35b762dda8015752'
BASELINE_SHA256='bdc617f4eed447c1cdeef74709775f94cac81203925793752b933191725213f4'
CLI_SHA256='ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a'

# Production migration history read on 2026-11-25 (36 versions).
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

test "$(printf '%s\n' "$BASELINE_VERSIONS" | shasum -a 256 | awk '{print $1}')" = \
  "$BASELINE_SHA256" || fail 'reviewed migration-history baseline digest differs'

REPO_ROOT="$(git rev-parse --show-toplevel)"
RELEASE_SHA="${RELEASE_SHA:-}"
SUPABASE_BIN="${SUPABASE_BIN:-}"
EXECUTION_MODE="${CALL_MIGRATION_EXECUTION_MODE:-}"
AUTH_MODE="${CALL_MIGRATION_AUTH_MODE:-}"

test "${#RELEASE_SHA}" -eq 40 || fail 'RELEASE_SHA must be a full 40-character commit'
case "$RELEASE_SHA" in
  *[!0-9a-f]*) fail 'RELEASE_SHA must be lowercase hexadecimal' ;;
esac
test -n "$SUPABASE_BIN" && test -x "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI'
test "${CALL_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA" || \
  fail 'secure the exclusive migration-writer window and bind its acknowledgement to RELEASE_SHA'
case "$EXECUTION_MODE" in
  preflight|apply) ;;
  *) fail 'CALL_MIGRATION_EXECUTION_MODE must be preflight or apply' ;;
esac
case "$AUTH_MODE" in
  injected-token|keychain-profile) ;;
  *) fail 'CALL_MIGRATION_AUTH_MODE must be injected-token or keychain-profile' ;;
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

RECEIPT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-call-tracking-migrations.XXXXXX")"
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
git -C "$REPO_ROOT" archive --format=tar "$RELEASE_SHA" -- \
  "supabase/migrations/$T1_BASENAME" "supabase/migrations/$T2_BASENAME" "$GUARD_PATH" \
  | tar -xf - -C "$RUNNER_DIR"

sha_of() { shasum -a 256 "$1" | awk '{print $1}'; }
test "$(sha_of "$RUNNER_DIR/supabase/migrations/$T1_BASENAME")" = "$T1_SHA256" || \
  fail "release bytes of $T1_BASENAME differ from the reviewed target"
test "$(sha_of "$RUNNER_DIR/supabase/migrations/$T2_BASENAME")" = "$T2_SHA256" || \
  fail "release bytes of $T2_BASENAME differ from the reviewed target"
test "$(sha_of "$RUNNER_DIR/$GUARD_PATH")" = "$GUARD_SHA256" || \
  fail 'remote-history guard bytes differ from the reviewed template'

cd "$RUNNER_DIR"
test ! -e supabase/.temp/project-ref || fail 'runner was linked before validation'
"$SUPABASE_BIN" link --project-ref "$PROJECT_REF" --yes >/dev/null
test "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" || fail 'runner linked to the wrong project'

baseline_json="$(printf '%s\n' "$BASELINE_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"

run_catalog_probe() {
  "$SUPABASE_BIN" --agent no --output-format json db query --linked <<'SQL'
select
  (select coalesce(jsonb_agg(version::text order by version::text), '[]'::jsonb)
     from supabase_migrations.schema_migrations) as history,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'call_logs' and column_name = 'from_zip') as from_zip_present,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'call_logs' and column_name = 'answered') as answered_present,
  to_regclass('public.call_screenings') is not null as call_screenings_exists,
  (select count(*) from public.call_logs) as call_rows,
  (select jsonb_build_object(
     'answered_true', count(*) filter (where to_jsonb(c) ->> 'answered' = 'true'),
     'answered_false', count(*) filter (where to_jsonb(c) ->> 'answered' = 'false'),
     'answered_unknown', count(*) filter (where to_jsonb(c) ->> 'answered' is null),
     'outbound_command_calls', count(*) filter (where coalesce(c.notes, '') = 'Outbound call via SMS command'),
     'outbound_command_calls_marked', count(*) filter (where coalesce(c.notes, '') = 'Outbound call via SMS command'
                                                      and to_jsonb(c) ->> 'answered' is not null),
     'with_zip', count(*) filter (where to_jsonb(c) ->> 'from_zip' is not null))
     from public.call_logs c) as live;
SQL
}

# Applied prefix of the two targets: none, the first only, or both.
validate_catalog_state() {
  jq -e --argjson baseline "$baseline_json" \
    --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" '
      type == "array" and length == 1
      and .[0] as $s
      | ($s.history | any(.[]; . == $t1)) as $r1
      | ($s.history | any(.[]; . == $t2)) as $r2
      | (($r1 or ($r2 | not)))
      and (($s.history | sort) == (($baseline
            + (if $r1 then [$t1] else [] end)
            + (if $r2 then [$t2] else [] end)) | sort))
      and (($s.from_zip_present) == $r1)
      and (($s.answered_present) == $r2)
      and $s.call_screenings_exists == true
      and ($s.call_rows | type == "number")
    ' "$1" >/dev/null || fail "catalog state in $1 differs from the reviewed contract"
}

run_catalog_probe > "$RECEIPT_DIR/catalog.before.json"
validate_catalog_state "$RECEIPT_DIR/catalog.before.json"
r1="$(jq -r --arg v "$T1_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r2="$(jq -r --arg v "$T2_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
call_rows="$(jq -er '.[0].call_rows' "$RECEIPT_DIR/catalog.before.json")"

mkdir -p supabase/reviewed-targets
pending=''
if test "$r1" = 'true'; then
  mv "supabase/migrations/$T1_BASENAME" supabase/reviewed-targets/
else
  pending="$T1_BASENAME"
fi
if test "$r2" = 'true'; then
  mv "supabase/migrations/$T2_BASENAME" supabase/reviewed-targets/
else
  pending="$(printf '%s\n%s' "$pending" "$T2_BASENAME" | sed '/^$/d')"
fi
test -n "$pending" || printf 'Both targets are already recorded; postflight checks only.\n'

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
test "$(jq -Sc '.[0] | del(.call_rows, .live)' "$RECEIPT_DIR/catalog.before.json")" = \
  "$(jq -Sc '.[0] | del(.call_rows, .live)' "$RECEIPT_DIR/catalog.final-preflight.json")" || \
  fail 'catalog changed between preflight and final preflight'

if test "$EXECUTION_MODE" = 'preflight'; then
  printf 'release_sha=%s\nproject_ref=%s\nmode=preflight\npending=%s\ncall_rows=%s\nreceipt_dir=%s\n' \
    "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" "$call_rows" "$RECEIPT_DIR"
  jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.before.json"
  exit 0
fi

if test -n "$pending"; then
  migration_exit=0
  "$SUPABASE_BIN" --agent no --output-format json \
    migration up --linked --include-all --yes \
    > "$RECEIPT_DIR/migration-up.stdout.json" \
    2> "$RECEIPT_DIR/migration-up.stderr.txt" || migration_exit=$?
  test "$migration_exit" = '0' || \
    fail 'migration up failed; retain receipts and do not repair history'
  applied="$(jq -r '.applied[]? | split("/")[-1]' "$RECEIPT_DIR/migration-up.stdout.json")"
  test "$applied" = "$pending" || fail 'migration up did not apply exactly the pending targets'
  grep -Fq 'remote_applied_history_guard.sql' \
    "$RECEIPT_DIR/migration-up.stdout.json" "$RECEIPT_DIR/migration-up.stderr.txt" \
    && fail 'a remote-history poison guard was selected'
fi

run_catalog_probe > "$RECEIPT_DIR/catalog.postflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.postflight.json"
jq -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" \
  '.[0].history | any(.[]; . == $t1) and any(.[]; . == $t2)' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || fail 'postflight history lacks a target'
test "$(jq -r '.[0].call_rows' "$RECEIPT_DIR/catalog.postflight.json")" -ge "$call_rows" || \
  fail 'call_logs lost rows during the migration'

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.after.json"
jq -e '.migrations as $m
  | ([ $m[] | select(.local == "" or .remote == "" or .local != .remote) ] | length) == 0' \
  "$RECEIPT_DIR/migration-list.after.json" >/dev/null || \
  fail 'final migration list is not fully matched'

printf 'release_sha=%s\nproject_ref=%s\nmode=apply\napplied=%s\nreceipt_dir=%s\n' \
  "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" "$RECEIPT_DIR"
jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.postflight.json"
