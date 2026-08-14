#!/usr/bin/env bash

set -euo pipefail
umask 077

fail() {
  printf 'Hard stop: %s\n' "$1" >&2
  exit 1
}

PROJECT_REF='hdcflshhomzildwqlmwh'
TARGET_VERSION='20260812010000'
TARGET_BASENAME='20260812010000_missed_call_alerts.sql'
TARGET_SHA256='19bde86daae30de86bbeb84c27aa899925b54f00d34b3a48e6ec44750e0cb261'
GUARD_SHA256='d770275383205c9012ad693400724e529e6dae90619d658a35b762dda8015752'
BASELINE_SHA256='43bc715ec85980ffd0e491be9e90501a5050113ab0f7757e0b2dcbffb8a1527b'
PENDING_MANIFEST_SHA256='5690cee177e68514bcece844a6b1a8b15eb42cc061ea0a9af739b95691977271'
APPLIED_MANIFEST_SHA256='e182cd0f58b4208c55b92f670320f037c88563aa38e603f9f0e0435fe1f86a30'
CLI_SHA256='ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a'

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
VERSIONS
)"

test "$(printf '%s\n' "$BASELINE_VERSIONS" | shasum -a 256 | awk '{print $1}')" = \
  "$BASELINE_SHA256" || fail 'reviewed migration-history baseline digest differs'

REPO_ROOT="$(git rev-parse --show-toplevel)"
RELEASE_SHA="${RELEASE_SHA:-}"
SUPABASE_BIN="${SUPABASE_BIN:-}"
EXECUTION_MODE="${UTAH_MIGRATION_EXECUTION_MODE:-}"

test "${#RELEASE_SHA}" -eq 40 || fail 'RELEASE_SHA must be a full 40-character commit'
case "$RELEASE_SHA" in
  *[!0-9a-f]*) fail 'RELEASE_SHA must be lowercase hexadecimal' ;;
esac
test -n "$SUPABASE_BIN" && test -x "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI'
test -n "${SUPABASE_ACCESS_TOKEN:-}" || \
  fail 'inject SUPABASE_ACCESS_TOKEN from approved secret storage'
test "${UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA" || \
  fail 'secure the exclusive Utah migration-writer window and bind its acknowledgement to RELEASE_SHA'
case "$EXECUTION_MODE" in
  preflight|apply) ;;
  *) fail 'UTAH_MIGRATION_EXECUTION_MODE must be preflight or apply' ;;
esac

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

export SUPABASE_NO_KEYRING=1
RECEIPT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-missed-call-migration-receipt.XXXXXX")"
RUNNER_DIR="$RECEIPT_DIR/runner"
mkdir -p "$RUNNER_DIR"
chmod 700 "$RECEIPT_DIR" "$RUNNER_DIR"

"$SUPABASE_BIN" init --workdir "$RUNNER_DIR" >/dev/null
git -C "$REPO_ROOT" archive --format=tar "$RELEASE_SHA" -- \
  "supabase/migrations/$TARGET_BASENAME" \
  supabase/migration-baselines/remote-applied-history-guard.sql \
  | tar -xf - -C "$RUNNER_DIR"

test "$(shasum -a 256 "$RUNNER_DIR/supabase/migrations/$TARGET_BASENAME" | awk '{print $1}')" = \
  "$TARGET_SHA256" || fail 'release migration bytes differ from the reviewed target'
test "$(shasum -a 256 "$RUNNER_DIR/supabase/migration-baselines/remote-applied-history-guard.sql" | awk '{print $1}')" = \
  "$GUARD_SHA256" || fail 'remote-history guard bytes differ from the reviewed template'

cd "$RUNNER_DIR"
test ! -e supabase/.temp/project-ref || fail 'runner was linked before validation'
"$SUPABASE_BIN" link --project-ref "$PROJECT_REF" --yes >/dev/null
test "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" || fail 'runner linked to the wrong project'
test -s supabase/.temp/pooler-url || fail 'linked runner did not create a pooler URL receipt'
node <<'NODE'
const fs = require("node:fs");
const url = new URL(fs.readFileSync("supabase/.temp/pooler-url", "utf8").trim());
if (url.protocol !== "postgresql:" || url.password !== "") process.exit(1);
if (!decodeURIComponent(url.username).endsWith(".hdcflshhomzildwqlmwh")) process.exit(1);
NODE

baseline_json="$(printf '%s\n' "$BASELINE_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"
target_history_json="$(jq -cn --argjson baseline "$baseline_json" --arg target "$TARGET_VERSION" '$baseline + [$target]')"

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.before.json"
chmod 600 "$RECEIPT_DIR/migration-list.before.json"

run_catalog_probe() {
  "$SUPABASE_BIN" --agent no --output-format json db query --linked <<'SQL'
select
  (select coalesce(jsonb_agg(version::text order by version::text),'[]'::jsonb)
     from supabase_migrations.schema_migrations) as history,
  exists (
    select 1 from supabase_migrations.schema_migrations
     where version::text = '20260812010000'
  ) as target_recorded,
  (select count(*) from public.alert_suppressed_callers) as suppression_row_count,
  (select count(*) from public.alert_suppressed_callers
    where phone !~ '^\+[1-9][0-9]{7,14}$') as invalid_phone_count,
  (select relrowsecurity from pg_catalog.pg_class
    where oid = 'public.alert_suppressed_callers'::regclass) as rls_enabled,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position), '[]'::jsonb)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'alert_suppressed_callers') as suppression_columns,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'name', conname,
      'type', contype,
      'validated', convalidated
    ) order by conname), '[]'::jsonb)
     from pg_catalog.pg_constraint
    where conrelid = 'public.alert_suppressed_callers'::regclass) as suppression_constraints,
  (select count(*) from pg_catalog.pg_policies
    where schemaname = 'public' and tablename = 'alert_suppressed_callers') as policy_count,
  not (
    has_table_privilege('anon', 'public.alert_suppressed_callers', 'select')
    or has_table_privilege('anon', 'public.alert_suppressed_callers', 'insert')
    or has_table_privilege('anon', 'public.alert_suppressed_callers', 'update')
    or has_table_privilege('anon', 'public.alert_suppressed_callers', 'delete')
    or has_table_privilege('authenticated', 'public.alert_suppressed_callers', 'select')
    or has_table_privilege('authenticated', 'public.alert_suppressed_callers', 'insert')
    or has_table_privilege('authenticated', 'public.alert_suppressed_callers', 'update')
    or has_table_privilege('authenticated', 'public.alert_suppressed_callers', 'delete')
  ) as browser_crud_revoked,
  has_table_privilege('service_role', 'public.alert_suppressed_callers', 'select')
    and has_table_privilege('service_role', 'public.alert_suppressed_callers', 'insert')
    and has_table_privilege('service_role', 'public.alert_suppressed_callers', 'update')
    and has_table_privilege('service_role', 'public.alert_suppressed_callers', 'delete') as service_role_crud,
  (select coalesce(jsonb_agg(jsonb_build_object(
      'name', column_name,
      'type', data_type,
      'nullable', is_nullable,
      'default', column_default
    ) order by ordinal_position), '[]'::jsonb)
     from information_schema.columns
    where table_schema = 'public' and table_name = 'call_logs'
      and column_name in ('missed_alert_sent_at', 'missed_alert_message_sid')) as receipt_columns;
SQL
}

validate_catalog_state() {
  state_path="$1"
  required_target_state="$2"
  jq -e \
    --argjson baseline "$baseline_json" \
    --argjson target_history "$target_history_json" \
    --arg target_state "$required_target_state" '
      type == "array" and length == 1
      and .[0] as $s
      | ($s.target_recorded == true) as $recorded
      | (($target_state == "either") or (($target_state == "recorded") == $recorded))
      and ($s.history == (if $recorded then $target_history else $baseline end))
      and ($s.suppression_row_count | type == "number" and . >= 0)
      and $s.invalid_phone_count == 0
      and $s.rls_enabled == true
      and $s.suppression_columns == [
        {name:"phone", type:"text", nullable:"NO", default:null},
        {name:"reason", type:"text", nullable:"YES", default:null},
        {name:"source", type:"text", nullable:"NO", default:"\u0027operator_sms\u0027::text"},
        {name:"created_at", type:"timestamp with time zone", nullable:"NO", default:"now()"}
      ]
      and ($s.suppression_constraints | map(.name))
        == (if ($s.suppression_constraints | length) == 1
            then ["alert_suppressed_callers_pkey"]
            else ["alert_suppressed_callers_phone_e164_check", "alert_suppressed_callers_pkey"] end)
      and all($s.suppression_constraints[]; .validated == true)
      and ($s.suppression_constraints | map(select(.name == "alert_suppressed_callers_pkey" and .type == "p")) | length) == 1
      and ($s.suppression_constraints | map(select(.name == "alert_suppressed_callers_phone_e164_check" and .type == "c")) | length)
        == (if $recorded then 1 else (if ($s.suppression_constraints | length) == 2 then 1 else 0 end) end)
      and $s.policy_count == 0
      and $s.browser_crud_revoked == true
      and $s.service_role_crud == true
      and ($s.receipt_columns | length) <= 2
      and all($s.receipt_columns[];
        (.name == "missed_alert_sent_at" and .type == "timestamp with time zone" and .nullable == "YES" and .default == null)
        or (.name == "missed_alert_message_sid" and .type == "text" and .nullable == "YES" and .default == null))
      and (($s.receipt_columns | map(.name) | unique | length) == ($s.receipt_columns | length))
      and (if $recorded then
        ($s.receipt_columns | map(.name)) == ["missed_alert_sent_at", "missed_alert_message_sid"]
      else true end)
    ' "$state_path" >/dev/null || fail "catalog $required_target_state state differs from the reviewed contract"
}

run_catalog_probe > "$RECEIPT_DIR/catalog.before.json"
chmod 600 "$RECEIPT_DIR/catalog.before.json"
validate_catalog_state "$RECEIPT_DIR/catalog.before.json" either
target_recorded="$(jq -r '.[0].target_recorded' "$RECEIPT_DIR/catalog.before.json")"
case "$target_recorded" in
  true|false) ;;
  *) fail 'catalog target_recorded value is not boolean' ;;
esac
suppression_row_count="$(jq -er '.[0].suppression_row_count' "$RECEIPT_DIR/catalog.before.json")"

jq -e \
  --argjson baseline "$baseline_json" \
  --arg target "$TARGET_VERSION" \
  --argjson recorded "$target_recorded" '
    .migrations as $m
    | ([$m[] | select(.remote != "") | .remote] | unique | sort)
        == ($baseline + (if $recorded then [$target] else [] end))
      and ([$m[] | select(.local != "" and .remote == "") | .local] | unique | sort)
        == (if $recorded then [] else [$target] end)
      and ([$m[] | select(.local != "" and .remote != "" and .local == .remote) | .local] | unique | sort)
        == (if $recorded then [$target] else [] end)
      and all($m[]; (.local == "" or .remote == "" or .local == .remote))
      and (($m | length) == 33)
  ' "$RECEIPT_DIR/migration-list.before.json" >/dev/null || \
  fail 'initial migration list is not the exact 32-version baseline plus target state'

mkdir -p supabase/reviewed-targets
if test "$target_recorded" = 'true'; then
  mv "supabase/migrations/$TARGET_BASENAME" "supabase/reviewed-targets/$TARGET_BASENAME"
fi

guard_template='supabase/migration-baselines/remote-applied-history-guard.sql'
guard_versions="$BASELINE_VERSIONS"
if test "$target_recorded" = 'true'; then
  guard_versions="$(printf '%s\n%s\n' "$BASELINE_VERSIONS" "$TARGET_VERSION")"
fi
while IFS= read -r version; do
  test -n "$version" || continue
  cp "$guard_template" "supabase/migrations/${version}_remote_applied_history_guard.sql"
done <<< "$guard_versions"

verify_runner_manifest() {
  expected_digest="$1"
  test -z "$(find supabase/migrations -mindepth 1 ! -type f -print -quit)" || \
    fail 'migration runner contains a symlink, directory, or special entry'
  test "$(find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d '[:space:]')" = '33' || \
    fail 'migration runner must contain exactly 33 regular SQL files'
  actual_manifest="$(
    find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' -print \
      | LC_ALL=C sort \
      | while IFS= read -r migration_file; do shasum -a 256 "$migration_file"; done
  )"
  test "$(printf '%s\n' "$actual_manifest" | shasum -a 256 | awk '{print $1}')" = "$expected_digest" || \
    fail 'exact 33-file migration runner manifest differs from reviewed main'
}

if test "$target_recorded" = 'true'; then
  verify_runner_manifest "$APPLIED_MANIFEST_SHA256"
else
  verify_runner_manifest "$PENDING_MANIFEST_SHA256"
fi

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.guarded.json"
chmod 600 "$RECEIPT_DIR/migration-list.guarded.json"
jq -e \
  --argjson baseline "$baseline_json" \
  --arg target "$TARGET_VERSION" \
  --argjson recorded "$target_recorded" '
    .migrations as $m
    | (($m | length) == 33)
      and ([ $m[] | select(.local == "" and .remote != "") ] | length) == 0
      and ([$m[] | select(.local != "" and .remote == "") | .local] | unique | sort)
        == (if $recorded then [] else [$target] end)
      and ([$m[] | select(.local != "" and .remote != "" and .local == .remote) | .local] | unique | sort)
        == ($baseline + (if $recorded then [$target] else [] end))
      and all($m[]; (.local == "" or .remote == "" or .local == .remote))
  ' "$RECEIPT_DIR/migration-list.guarded.json" >/dev/null || \
  fail 'guarded migration list is not the exact matched baseline plus target state'

run_catalog_probe > "$RECEIPT_DIR/catalog.final-preflight.json"
chmod 600 "$RECEIPT_DIR/catalog.final-preflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.final-preflight.json" either
test "$(jq -Sc . "$RECEIPT_DIR/catalog.before.json")" = \
  "$(jq -Sc . "$RECEIPT_DIR/catalog.final-preflight.json")" || \
  fail 'catalog changed between preflight and final preflight'

if test "$EXECUTION_MODE" = 'preflight'; then
  printf 'release_sha=%s\nproject_ref=%s\nmode=preflight\ntarget_recorded=%s\nsuppression_rows_observed=%s\nreceipt_dir=%s\n' \
    "$RELEASE_SHA" "$PROJECT_REF" "$target_recorded" "$suppression_row_count" "$RECEIPT_DIR"
  exit 0
fi

if test "$target_recorded" = 'false'; then
  migration_exit=0
  "$SUPABASE_BIN" --agent no --output-format json \
    migration up --linked --include-all --yes \
    > "$RECEIPT_DIR/migration-up.stdout.json" \
    2> "$RECEIPT_DIR/migration-up.stderr.txt" || migration_exit=$?
  test "$migration_exit" = '0' || \
    fail 'migration up failed; retain receipts and do not repair history'
  jq -e --arg basename "$TARGET_BASENAME" '
    type == "object"
    and .message == "Migrations applied"
    and (.applied | type == "array" and length == 1)
    and (.applied[0] | split("/")[-1]) == $basename
  ' "$RECEIPT_DIR/migration-up.stdout.json" >/dev/null || \
    fail 'migration up did not return the exact one-file structured receipt'
  test "$(sed -n 's/^Applying migration \([^[:space:]]*\)\.\.\.$/\1/p' "$RECEIPT_DIR/migration-up.stderr.txt")" = \
    "$TARGET_BASENAME" || fail 'migration stderr receipt differs from the reviewed target'
  grep -Fq 'remote_applied_history_guard.sql' \
    "$RECEIPT_DIR/migration-up.stdout.json" "$RECEIPT_DIR/migration-up.stderr.txt" \
    && fail 'a remote-history poison guard was selected'

  mv "supabase/migrations/$TARGET_BASENAME" "supabase/reviewed-targets/$TARGET_BASENAME"
  cp "$guard_template" "supabase/migrations/${TARGET_VERSION}_remote_applied_history_guard.sql"
  verify_runner_manifest "$APPLIED_MANIFEST_SHA256"
fi

run_catalog_probe > "$RECEIPT_DIR/catalog.postflight.json"
chmod 600 "$RECEIPT_DIR/catalog.postflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.postflight.json" recorded
test "$(jq -er '.[0].suppression_row_count' "$RECEIPT_DIR/catalog.postflight.json")" = \
  "$suppression_row_count" || fail 'the migration changed the suppression-row count'

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.after.json"
chmod 600 "$RECEIPT_DIR/migration-list.after.json"
jq -e --argjson history "$target_history_json" '
  .migrations as $m
  | (($m | length) == 33)
    and ([ $m[] | select(.local == "" or .remote == "" or .local != .remote) ] | length) == 0
    and ([$m[].remote] | unique | sort) == $history
' "$RECEIPT_DIR/migration-list.after.json" >/dev/null || \
  fail 'final migration list is not the exact fully matched 33-version history'

printf 'release_sha=%s\nproject_ref=%s\nmigration=%s\nsuppression_rows_preserved=%s\nreceipt_dir=%s\n' \
  "$RELEASE_SHA" "$PROJECT_REF" "$TARGET_BASENAME" "$suppression_row_count" "$RECEIPT_DIR"
