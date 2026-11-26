#!/usr/bin/env bash
# Exact-target runner for the three Utah lead migrations:
#   20261027221000_lead_spam_classification.sql
#   20261027230000_ai_referrer_tagging.sql
#   20261122230000_leads_intake_zip_city_source.sql
#
# It never runs `supabase db push`, never repairs history, and never touches any
# other migration. Only these three files and the remote-history poison guard
# are archived from the exact release commit into an empty workdir, and every
# version already recorded in production gets a poison guard, so
# `migration up --include-all` can only apply these three, in timestamp order,
# in one guarded run. Preflight and apply are separate processes; receipts and
# every CLI stderr stream are kept in a mode-0700 directory.
#
# ⚠️ PREFLIGHT IS NOT READ-ONLY. `db query --linked` resolves a live database
# connection before it runs the query over the Management API, and that
# resolution has project-visible side effects. Verified against supabase/cli
# v2.113.0 (commit 03880bb1):
#   * apps/cli/src/legacy/shared/legacy-db-config.layer.ts:101-117 mints a
#     TEMPORARY POSTGRES LOGIN ROLE via POST /v1/projects/<ref>/cli/login-role
#     with read_only:false, and prints "Initialising login role..." to stderr;
#   * the same file, 119-127 and 157-161: from the THIRD pooler connect failure
#     onward it calls listAllNetworkBans and then deleteNetworkBans — it LISTS
#     AND REMOVES the project's IPv4 network bans;
#   * apps/cli/src/legacy/commands/db/query/query.handler.ts:283-289 does this
#     purely for pre-run parity and then DISCARDS the connection.
# `db query` exposes no --password flag (apps/cli/src/legacy/commands/db/query/
# query.command.ts), and this runner refuses SUPABASE_DB_PASSWORD, so the
# passwordless login-role path is always taken. That is a deliberate trade:
# holding a database password in the runner's environment is worse. The operator
# acknowledges these effects through LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK.
# `migration up --linked` has no --password flag either, so the same mint
# happens on the apply step regardless.
#
# Usage, from a clean checkout of main:
#   RELEASE_SHA=<origin/main tip> SUPABASE_BIN=<absolute path to the 2.113.0 CLI> \
#   LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK=<same SHA> \
#   LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK=<same SHA> \
#   LEAD_MIGRATION_EXECUTION_MODE=preflight|apply \
#   LEAD_MIGRATION_AUTH_MODE=keychain-profile|injected-token \
#   scripts/run-lead-migrations.sh
#
# ORDER: scripts/run-call-tracking-migrations.sh MUST run first. Its validator
# accepts only the 36-version baseline plus a prefix of its own two versions, so
# once a lead target is recorded it can never run again. Apply mode here REFUSES
# to run until both call-tracking versions are recorded; preflight still reports
# on the bare baseline so the state can be inspected.
#
# RECEIPTS CONTAIN CLI DIAGNOSTICS AND THE LINKED WORKDIR, including
# supabase/.temp/pooler-url and raw CLI stderr (the CLI puts server response
# bodies into login-role errors). Sanitise before sharing a receipt anywhere.

set -euo pipefail
umask 077

fail() {
  printf 'Hard stop: %s\n' "$1" >&2
  exit 1
}

warn() {
  printf 'WARNING: %s\n' "$1" >&2
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

# The call-tracking pair applied by scripts/run-call-tracking-migrations.sh.
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
EXECUTION_MODE="${LEAD_MIGRATION_EXECUTION_MODE:-}"
AUTH_MODE="${LEAD_MIGRATION_AUTH_MODE:-}"
RECOVER_ACK="${LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER:-}"
RECOVER_RECEIPT_DIR="${LEAD_MIGRATION_RECOVER_RECEIPT_DIR:-}"

# --- hostile environment ----------------------------------------------------
# Verified against supabase/cli v2.113.0 (commit 03880bb1):
#   * apps/cli/src/legacy/config/legacy-cli-config.layer.ts:38-80 — with no
#     --profile flag and no SUPABASE_PROFILE, the CLI falls back to the
#     PERSISTED ~/.supabase/profile file, and that token may itself be a path to
#     a viper config file (apps/cli/src/legacy/shared/legacy-profile-load.ts:
#     101-145). A profile supplies api_url, project_host and pooler_host
#     (same file, 215-221), so every ref check can agree while the CLI talks to
#     another endpoint entirely.
#   * the same layer, 98-126 — an explicit --workdir beats SUPABASE_WORKDIR.
#   * legacy-cli-config.layer.ts:31-33 and 49-52 — an explicit
#     `--profile supabase` shadows BOTH the env var and the persisted file even
#     though `supabase` is the default value, and legacy-profile-load.ts:
#     106-117 resolves the built-in name without reading any file.
# So: refuse a hostile environment AND pin --profile/--workdir on every call.
while IFS= read -r env_name; do
  test -n "$env_name" || continue
  case "$env_name" in
    SUPABASE_BIN|SUPABASE_ACCESS_TOKEN|SUPABASE_NO_KEYRING) continue ;;
    SUPABASE_*|PG*)
      fail "unset $env_name before running: it can redirect the pinned CLI away from the reviewed project" ;;
  esac
done < <(compgen -e || true)
case "$-" in
  *x*) fail 'shell tracing is on; it would copy the access token into the trace' ;;
esac
# bash initialises PS4 to '+ ' itself, so only a value inherited from the
# environment is rejected.
case "${PS4:-+ }" in
  '+ ') ;;
  *) fail 'unset PS4: a custom trace prompt can execute a command substitution' ;;
esac

# --- operator inputs --------------------------------------------------------
test "${#RELEASE_SHA}" -eq 40 || fail 'RELEASE_SHA must be a full 40-character commit'
# Enumerated, not a range: under a UTF-8 collation `[!0-9a-f]` does not reject
# A-F, so a range would let an uppercase SHA through this gate.
case "$RELEASE_SHA" in
  *[!0123456789abcdef]*) fail 'RELEASE_SHA must be lowercase hexadecimal' ;;
esac
test "${LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA" || \
  fail 'secure the exclusive migration-writer window and bind its acknowledgement to RELEASE_SHA'
test "${LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK:-}" = "$RELEASE_SHA" || \
  fail 'preflight is NOT read-only: db query --linked mints a temporary postgres login role (POST /v1/projects/<ref>/cli/login-role, read_only:false) and, from the third pooler connect failure onward, lists and DELETES the IPv4 network bans on this project. Read docs/runbooks/utah-lead-migrations.md, then bind LEAD_MIGRATION_DB_QUERY_SIDE_EFFECT_ACK to RELEASE_SHA'
case "$EXECUTION_MODE" in
  preflight|apply) ;;
  *) fail 'LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply' ;;
esac
case "$AUTH_MODE" in
  injected-token|keychain-profile) ;;
  *) fail 'LEAD_MIGRATION_AUTH_MODE must be injected-token or keychain-profile' ;;
esac
RECOVER_UNRECORDED_T2='false'
if test -n "$RECOVER_ACK"; then
  test "$RECOVER_ACK" = "$RELEASE_SHA" || \
    fail 'LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER must be bound to RELEASE_SHA'
  test -n "$RECOVER_RECEIPT_DIR" || \
    fail 'recovery requires LEAD_MIGRATION_RECOVER_RECEIPT_DIR: the receipt directory of the run that left 20261027230000 unrecorded'
  test -d "$RECOVER_RECEIPT_DIR" || fail 'LEAD_MIGRATION_RECOVER_RECEIPT_DIR is not a directory'
  RECOVER_UNRECORDED_T2='true'
fi
command -v jq >/dev/null || fail 'jq is required'

# --- the CLI binary, resolved and hashed BEFORE it is ever executed ---------
# One absolute path, every component checked for a symlink, hashed, then used
# for every invocation. A bare command name is refused outright: it would be
# resolved through PATH at execution time while `shasum` read something else.
case "${SUPABASE_BIN:-}" in
  '') fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI' ;;
  /*) ;;
  *) fail 'SUPABASE_BIN must be an absolute path, never a PATH-resolved command name' ;;
esac
# Resolve the directory part to its PHYSICAL path (`pwd -P` follows and discards
# every symlinked component, so the resolved directory contains none), then
# refuse a symlink as the final component and use that one resolved path for the
# digest and for every execution. A whole-path symlink ban is not usable here:
# on macOS /var is itself a symlink to /private/var, so every mktemp path and
# many install paths would be rejected. Residual, documented in the runbook: if
# a directory component is re-pointed between the digest and the run, no shell
# script can detect it — the path is the operator's own and the writer window is
# exclusive.
supabase_bin_dir="$(cd "$(dirname "$SUPABASE_BIN")" >/dev/null 2>&1 && pwd -P)" || \
  fail 'the directory holding SUPABASE_BIN does not exist'
SUPABASE_BIN="$supabase_bin_dir/$(basename "$SUPABASE_BIN")"
unset supabase_bin_dir
test ! -L "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must be the reviewed file itself, not a symlink whose target can change'
test -f "$SUPABASE_BIN" && test -x "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI'
test "$(basename "$SUPABASE_BIN")" != 'supabase-go' || \
  fail 'the internal supabase-go compatibility binary is forbidden'
test "$(uname -s)" = 'Darwin' && test "$(uname -m)" = 'arm64' || \
  fail 'the reviewed CLI binary receipt is only valid on macOS arm64'
test "$(shasum -a 256 "$SUPABASE_BIN" | awk '{print $1}')" = "$CLI_SHA256" || \
  fail 'Supabase CLI binary digest differs from the reviewed official release'

# --- the release commit -----------------------------------------------------
# FETCH_HEAD, not origin/main: the remote-tracking ref can be stale or have been
# set by hand, while FETCH_HEAD is what this fetch received.
git -C "$REPO_ROOT" fetch --quiet origin main
test "$(git -C "$REPO_ROOT" rev-parse --verify "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA does not resolve to a commit'
test "$(git -C "$REPO_ROOT" rev-parse --verify 'FETCH_HEAD^{commit}')" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA is not the main tip this fetch received'
test "$(git -C "$REPO_ROOT" rev-parse origin/main)" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA is not the exact current origin/main tip'

RECEIPT_DIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-lead-migrations.XXXXXX")"
RUNNER_DIR="$RECEIPT_DIR/runner"
mkdir -p "$RUNNER_DIR"
chmod 700 "$RECEIPT_DIR" "$RUNNER_DIR"
# Printed before anything can mutate, so a crashed run is still recoverable.
printf 'receipt_dir=%s\nmode=%s\n' "$RECEIPT_DIR" "$EXECUTION_MODE"

# The release is a Bun single-file executable (apps/cli/scripts/build.ts:144-156
# at v2.113.0 — `bun build --compile`, with no --env control), and Bun loads a
# dotenv file from the process working directory at runtime. So the CLI is never
# executed while the working directory is the repository checkout: cd into the
# private 0700 receipt directory FIRST, before the very first invocation.
cd "$RUNNER_DIR"

# Every CLI call is pinned to the built-in profile and to this absolute workdir,
# and every call's stderr is captured in the receipt directory. Nothing from a
# CLI stream is echoed: the CLI puts server response bodies into login-role
# errors.
cli() {
  local label="$1"
  shift
  "$SUPABASE_BIN" --profile supabase --workdir "$RUNNER_DIR" "$@" \
    2> "$RECEIPT_DIR/cli.${label}.stderr.txt"
}

cli_version="$("$SUPABASE_BIN" --version 2> "$RECEIPT_DIR/cli.version.stderr.txt" | head -n 1)"
test "$cli_version" = '2.113.0' || fail 'Supabase CLI 2.113.0 is required'

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

printf 'side_effects=a temporary postgres login role is minted for every db query --linked and for migration up --linked; on repeated pooler failures the CLI deletes the IPv4 network bans on this project\n'

projects_exit=0
projects_json="$(cli projects-list --agent no --output-format json projects list)" || \
  projects_exit=$?
test "$projects_exit" = '0' || \
  fail "the pinned CLI could not list projects (exit $projects_exit). Its stderr is in $RECEIPT_DIR/cli.projects-list.stderr.txt and is NOT reproduced here: the CLI puts server response bodies into its errors. Re-authenticate and retry."
jq -e --arg project "$PROJECT_REF" '
  ([.projects[]? | select(.id == $project)] | length) == 1
' <<< "$projects_json" >/dev/null || fail 'the CLI login cannot resolve the exact Utah project'
unset projects_json

cli init init --workdir "$RUNNER_DIR" >/dev/null
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

test ! -e supabase/.temp/project-ref || fail 'runner was linked before validation'
cli link link --project-ref "$PROJECT_REF" --yes >/dev/null
test "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" || fail 'runner linked to the wrong project'

baseline_json="$(printf '%s\n' "$BASELINE_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"
call_tracking_json="$(printf '%s\n' "$CALL_TRACKING_VERSIONS" | jq -Rsc 'split("\n") | map(select(length > 0))')"

# Catalog probe, specific to the three targets, through the one `db query
# --linked` statement the reviewed rollout permits. The SELECT itself reads only
# catalogs and two row counts; the CLI's connection resolution around it is what
# has the side effects documented at the top of this file.
#   20261027221000  five leads.spam_* columns + two indexes, matched by EXACT
#                   pg_get_indexdef, valid and ready
#   20261027230000  leads.ai_referrer, phone_clicks.ai_referrer, the classifier
#                   and trigger functions, both triggers with tgtype EXACTLY 7
#                   (row-level BEFORE INSERT and nothing else), no WHEN clause,
#                   bound to the reviewed function and enabled; service_role
#                   EXECUTE on the classifier; and NO EXECUTE for
#                   anon/authenticated on either function
#   20261122230000  leads.zip, leads.city_source
# Row counts size the lock window: 20261027230000 takes ACCESS EXCLUSIVE on both
# public.leads and public.phone_clicks (ALTER TABLE) and holds it through its
# in-transaction backfill. No lock_timeout is set — see the runbook.
run_catalog_probe() {
  cli "db-query-$1" --agent no --output-format json db query --linked <<'SQL'
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
  (select count(*) from pg_index i
      join pg_class ic on ic.oid = i.indexrelid
      join pg_class tc on tc.oid = i.indrelid
      join pg_namespace n on n.oid = tc.relnamespace
     where n.nspname = 'public' and tc.relname = 'leads'
       and i.indisvalid and i.indisready
       and pg_get_indexdef(i.indexrelid) in (
         'CREATE INDEX leads_spam_unclassified_idx ON public.leads USING btree (created_at DESC) WHERE (spam_label IS NULL)',
         'CREATE INDEX leads_spam_label_created_idx ON public.leads USING btree (spam_label, created_at DESC)'
       )) as spam_indexes_exact,
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
  (select count(*) from pg_trigger t
      join pg_class c on c.oid = t.tgrelid
      join pg_namespace n on n.oid = c.relnamespace
      join pg_proc p on p.oid = t.tgfoid
      join pg_namespace fn on fn.oid = p.pronamespace
     where n.nspname = 'public' and not t.tgisinternal
       and t.tgenabled = 'O'
       and t.tgtype = 7
       and t.tgqual is null
       and fn.nspname = 'public' and p.proname = 'frame_set_ai_referrer'
       and ((c.relname = 'leads' and t.tgname = 'leads_set_ai_referrer')
         or (c.relname = 'phone_clicks' and t.tgname = 'phone_clicks_set_ai_referrer'))) as ai_referrer_triggers_armed,
  (case when to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else has_function_privilege('service_role',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_service_role_execute,
  (case when to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else has_function_privilege('anon',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_anon_execute,
  (case when to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else has_function_privilege('authenticated',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_authenticated_execute,
  (case when to_regprocedure('public.frame_set_ai_referrer()') is null then false
        else has_function_privilege('anon',
               'public.frame_set_ai_referrer()', 'EXECUTE') end) as ai_referrer_trigger_anon_execute,
  (case when to_regprocedure('public.frame_set_ai_referrer()') is null then false
        else has_function_privilege('authenticated',
               'public.frame_set_ai_referrer()', 'EXECUTE') end) as ai_referrer_trigger_authenticated_execute,
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
#
# The one exception, and it has to be opted into with evidence: 20261027230000
# contains an explicit `begin; … commit;`. CLI 2.113.0 executes the file's COMMIT
# and only then inserts the schema_migrations row, so a failure in that gap
# leaves the AI-referrer objects present with NO history row. $recover_t2 is the
# operator's acknowledgement of exactly that state; nothing else is relaxed, and
# the FULL strengthened AI-referrer catalog is still required.
#
# The `if … then … else … end` wrapper is deliberate. `a and b and .[0] as $s |
# …` — the shape scripts/run-call-tracking-migrations.sh uses — changed meaning
# in jq 1.8: `as` now takes the whole `and` chain instead of just `.[0]`, so $s
# is a boolean and every field read dies with "Cannot index boolean with
# string". Verified: that shape returns true/false under jq 1.6, 1.7, 1.7.1 and
# jq-1.7.1-apple, and errors under 1.8.0 and 1.8.1.
validate_catalog_state() {
  jq -e --argjson baseline "$baseline_json" --argjson calltracking "$call_tracking_json" \
    --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" \
    --argjson recover_t2 "$RECOVER_UNRECORDED_T2" '
      if type != "array" or length != 1 then false else
      .[0]
      | . as $s
      | ($s.history | any(.[]; . == $t1)) as $r1
      | ($s.history | any(.[]; . == $t2)) as $r2
      | ($s.history | any(.[]; . == $t3)) as $r3
      | ($s.history | any(.[]; . == $calltracking[0])) as $c1
      | ($s.history | any(.[]; . == $calltracking[1])) as $c2
      | ($r2 or ($recover_t2 and $r1 and $s.leads_ai_referrer)) as $p2
      | ($c1 == $c2)
      and (($s.history | sort) == (($baseline
            + (if $c1 then $calltracking else [] end)
            + (if $r1 then [$t1] else [] end)
            + (if $r2 then [$t2] else [] end)
            + (if $r3 then [$t3] else [] end)) | sort))
      and ($s.spam_columns == (if $r1 then 5 else 0 end))
      and ($s.spam_indexes == (if $r1 then 2 else 0 end))
      and ($s.spam_indexes_exact == (if $r1 then 2 else 0 end))
      and ($s.leads_ai_referrer == $p2)
      and ($s.phone_clicks_ai_referrer == $p2)
      and ($s.ai_referrer_function == $p2)
      and ($s.ai_referrer_trigger_function == $p2)
      and ($s.ai_referrer_triggers == (if $p2 then 2 else 0 end))
      and ($s.ai_referrer_triggers_armed == (if $p2 then 2 else 0 end))
      and ($s.ai_referrer_service_role_execute == $p2)
      and ($s.ai_referrer_anon_execute == false)
      and ($s.ai_referrer_authenticated_execute == false)
      and ($s.ai_referrer_trigger_anon_execute == false)
      and ($s.ai_referrer_trigger_authenticated_execute == false)
      and ($s.leads_zip == $r3)
      and ($s.leads_city_source == $r3)
      and ($s.lead_rows | type == "number")
      and ($s.phone_click_rows | type == "number")
      end
    ' "$1" >/dev/null || fail "catalog state in $1 differs from the reviewed contract"
}

# The COMMIT-before-history state, recognised narrowly: 20261027221000 recorded
# (migration up applies in timestamp order, so 20261027230000 can only have run
# after its predecessor was recorded), 20261027230000 NOT recorded, and the FULL
# strengthened AI-referrer catalog present. 20261122230000 may be recorded or
# not — a resumed run can have reached it.
is_unrecorded_t2_state() {
  jq -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" '
    if type != "array" or length != 1 then false else
    .[0] | . as $s
    | ($s.history | any(.[]; . == $t1)) as $r1
    | ($s.history | any(.[]; . == $t2)) as $r2
    | $r1 and ($r2 | not)
      and $s.leads_ai_referrer and $s.phone_clicks_ai_referrer
      and $s.ai_referrer_function and $s.ai_referrer_trigger_function
      and $s.ai_referrer_triggers == 2 and $s.ai_referrer_triggers_armed == 2
      and $s.ai_referrer_service_role_execute
      and ($s.ai_referrer_anon_execute | not)
      and ($s.ai_referrer_authenticated_execute | not)
      and ($s.ai_referrer_trigger_anon_execute | not)
      and ($s.ai_referrer_trigger_authenticated_execute | not)
    end
  ' "$1" >/dev/null 2>&1
}

run_catalog_probe before > "$RECEIPT_DIR/catalog.before.json"

if test "$RECOVER_UNRECORDED_T2" != 'true'; then
  if is_unrecorded_t2_state "$RECEIPT_DIR/catalog.before.json"; then
    fail "20261027230000 is applied but NOT recorded: 20261027221000 is recorded, the full AI-referrer catalog is present, and there is no history row for 20261027230000. This is the COMMIT-before-history gap (the file contains an explicit begin/commit, so CLI 2.113.0 commits the schema change before it inserts the history row). Sanctioned recovery, and the only one: find the receipt directory of the run that left it this way, confirm its cli.migration-up.stderr.txt names 20261027230000, then re-run with LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER=RELEASE_SHA and LEAD_MIGRATION_RECOVER_RECEIPT_DIR set to that directory. The replay re-runs the migration's DDL and backfill and RE-TAKES ACCESS EXCLUSIVE on public.leads and public.phone_clicks, so treat it as a second apply window. Never use migration repair."
  fi
fi

validate_catalog_state "$RECEIPT_DIR/catalog.before.json"
r1="$(jq -r --arg v "$T1_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r2="$(jq -r --arg v "$T2_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r3="$(jq -r --arg v "$T3_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
lead_rows="$(jq -er '.[0].lead_rows' "$RECEIPT_DIR/catalog.before.json")"
phone_click_rows="$(jq -er '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.before.json")"
matched_json="$(jq -c '.[0].history' "$RECEIPT_DIR/catalog.before.json")"
call_tracking_recorded="$(jq -r --argjson ct "$call_tracking_json" \
  '.[0].history | (any(.[]; . == $ct[0]) and any(.[]; . == $ct[1]))' \
  "$RECEIPT_DIR/catalog.before.json")"

if test "$EXECUTION_MODE" = 'apply' && test "$call_tracking_recorded" != 'true'; then
  fail 'scripts/run-call-tracking-migrations.sh must be applied first. Its own validator accepts only the 36-version baseline plus a prefix of its two versions, so once a lead target is recorded it can never run again. Finish 20261027200000 + 20261027220000 through that runner, then re-run this one.'
fi

if test "$RECOVER_UNRECORDED_T2" = 'true'; then
  is_unrecorded_t2_state "$RECEIPT_DIR/catalog.before.json" || \
    fail 'LEAD_MIGRATION_RECOVER_UNRECORDED_AI_REFERRER is set but the catalog is not in the COMMIT-before-history state (20261027221000 recorded, 20261027230000 unrecorded, full AI-referrer catalog armed). Unset it and re-run.'
  # The previous attempt has to be the same release, and its own receipt has to
  # name this target. A failed `migration up` never emits an `applied` list, so
  # the evidence required is the CLI's stderr for that run plus the run record
  # this runner writes before it mutates anything.
  prev_run="$RECOVER_RECEIPT_DIR/run.json"
  test -f "$prev_run" || \
    fail "LEAD_MIGRATION_RECOVER_RECEIPT_DIR has no run.json; that is not a receipt directory from this runner"
  jq -e --arg sha "$RELEASE_SHA" --arg t2 "$T2_BASENAME" '
    .release_sha == $sha and .mode == "apply" and (.pending | index($t2) != null)
  ' "$prev_run" >/dev/null || \
    fail "the previous run recorded in $prev_run is not an apply of this RELEASE_SHA with 20261027230000 pending"
  prev_stderr="$RECOVER_RECEIPT_DIR/cli.migration-up.stderr.txt"
  test -f "$prev_stderr" || \
    fail "$prev_stderr is missing: without the failed run's own CLI stderr there is no evidence that 20261027230000 was the statement that committed"
  grep -Fq "$T2_VERSION" "$prev_stderr" || \
    fail "$prev_stderr does not name 20261027230000; the AI-referrer objects did not come from that run"
  warn "replaying 20261027230000 onto present objects to record its missing history row. Every statement in it is idempotent, but the replay RE-RUNS the DDL and the backfill and RE-TAKES ACCESS EXCLUSIVE on public.leads and public.phone_clicks."
fi

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

pending_json="$(printf '%s\n' "$pending" | sed '/^$/d' | sed 's/_.*//' | jq -Rsc 'split("\n") | map(select(length > 0))')"
pending_files_json="$(printf '%s\n' "$pending" | sed '/^$/d' | jq -Rsc 'split("\n") | map(select(length > 0))')"
# The run record a later recovery must be able to match, written BEFORE any
# mutation.
jq -n --arg sha "$RELEASE_SHA" --arg ref "$PROJECT_REF" --arg mode "$EXECUTION_MODE" \
  --argjson pending "$pending_files_json" --argjson recover "$RECOVER_UNRECORDED_T2" \
  '{release_sha: $sha, project_ref: $ref, mode: $mode, pending: $pending, recover_unrecorded_ai_referrer: $recover}' \
  > "$RECEIPT_DIR/run.json"

jq -r '.[0].history[]' "$RECEIPT_DIR/catalog.before.json" | while IFS= read -r version; do
  test -n "$version" || continue
  cp "$GUARD_PATH" "supabase/migrations/${version}_remote_applied_history_guard.sql"
done
test -z "$(find supabase/migrations -mindepth 1 ! -type f -print -quit)" || \
  fail 'migration runner contains a symlink, directory, or special entry'
expected_files=$(( $(jq '.[0].history | length' "$RECEIPT_DIR/catalog.before.json") + $(printf '%s' "$pending" | grep -c . || true) ))
test "$(find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' | wc -l | tr -d '[:space:]')" = "$expected_files" || \
  fail 'migration runner file count differs from history plus pending targets'
# The exact staged set, not just its size.
find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' -exec basename {} \; \
  | LC_ALL=C sort > "$RECEIPT_DIR/staged-migrations.txt"
jq -r --argjson matched "$matched_json" -n \
  '($matched | map(. + "_remote_applied_history_guard.sql"))[]' \
  > "$RECEIPT_DIR/staged-migrations.expected.txt"
printf '%s\n' "$pending" | sed '/^$/d' >> "$RECEIPT_DIR/staged-migrations.expected.txt"
LC_ALL=C sort -o "$RECEIPT_DIR/staged-migrations.expected.txt" \
  "$RECEIPT_DIR/staged-migrations.expected.txt"
cmp -s "$RECEIPT_DIR/staged-migrations.txt" "$RECEIPT_DIR/staged-migrations.expected.txt" || \
  fail 'the staged migration set is not exactly one guard per recorded version plus the pending targets'

cli migration-list-guarded --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.guarded.json"
# The COMPLETE expected set, both directions, no duplicates: an empty list and a
# list that merely lacks contradictions both fail here.
jq -e --argjson pending "$pending_json" --argjson matched "$matched_json" '
  .migrations as $m
  | ([$m[] | select(.local != "" and .remote != "" and .local == .remote) | .local] | sort)
      == ($matched | sort)
    and ([$m[] | select(.local == "" and .remote != "")] | length) == 0
    and ([$m[] | select(.local != "" and .remote == "") | .local] | sort) == ($pending | sort)
    and all($m[]; (.local == "" or .remote == "" or .local == .remote))
    and ($m | length) == (($matched | length) + ($pending | length))
    and (([$m[] | .local] | map(select(. != ""))) | length) == (([$m[] | .local] | map(select(. != "")) | unique) | length)
    and (([$m[] | .remote] | map(select(. != ""))) | length) == (([$m[] | .remote] | map(select(. != "")) | unique) | length)
' "$RECEIPT_DIR/migration-list.guarded.json" >/dev/null || \
  fail 'guarded migration list is not the complete matched history plus exactly the pending targets'

run_catalog_probe final-preflight > "$RECEIPT_DIR/catalog.final-preflight.json"
validate_catalog_state "$RECEIPT_DIR/catalog.final-preflight.json"
test "$(jq -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.before.json")" = \
  "$(jq -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.final-preflight.json")" || \
  fail 'catalog changed between preflight and final preflight'

if test "$EXECUTION_MODE" = 'preflight'; then
  printf 'release_sha=%s\nproject_ref=%s\nmode=preflight\npending=%s\nlead_rows=%s\nphone_click_rows=%s\ncall_tracking_recorded=%s\nreceipt_dir=%s\n' \
    "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" \
    "$lead_rows" "$phone_click_rows" "$call_tracking_recorded" "$RECEIPT_DIR"
  printf 'lock_note=20261027230000 holds ACCESS EXCLUSIVE on public.leads (%s rows) and public.phone_clicks (%s rows) through its backfill; no lock_timeout is set, so run off-peak\n' \
    "$lead_rows" "$phone_click_rows"
  jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.before.json"
  exit 0
fi

if test -n "$pending"; then
  migration_exit=0
  cli migration-up --agent no --output-format json \
    migration up --linked --include-all --yes \
    > "$RECEIPT_DIR/migration-up.stdout.json" || migration_exit=$?
  # A grep read error is a hard stop, not a clean scan.
  guard_scan=0
  grep -Fq 'remote_applied_history_guard.sql' \
    "$RECEIPT_DIR/migration-up.stdout.json" \
    "$RECEIPT_DIR/cli.migration-up.stderr.txt" || guard_scan=$?
  case "$guard_scan" in
    0) fail 'a remote-history poison guard was selected' ;;
    1) ;;
    *) fail "could not scan the CLI output for a selected poison guard (grep exit $guard_scan)" ;;
  esac
  test "$migration_exit" = '0' || \
    fail "migration up failed; retain receipts and do not repair history. If $RECEIPT_DIR/cli.migration-up.stderr.txt names 20261027230000, see the COMMIT-before-history recovery in docs/runbooks/utah-lead-migrations.md and pass this directory as LEAD_MIGRATION_RECOVER_RECEIPT_DIR"
  applied="$(jq -r '.applied[]? | split("/")[-1]' "$RECEIPT_DIR/migration-up.stdout.json")"
  test "$applied" = "$pending" || fail 'migration up did not apply exactly the pending targets in order'
fi

run_catalog_probe postflight > "$RECEIPT_DIR/catalog.postflight.json"
jq -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" \
  '.[0].history | any(.[]; . == $t1) and any(.[]; . == $t2) and any(.[]; . == $t3)' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || \
  fail "postflight history lacks a target. If the catalog shows the AI-referrer objects present, this is the COMMIT-before-history gap; see the recovery in docs/runbooks/utah-lead-migrations.md and pass $RECEIPT_DIR as LEAD_MIGRATION_RECOVER_RECEIPT_DIR"
RECOVER_UNRECORDED_T2='false'
validate_catalog_state "$RECEIPT_DIR/catalog.postflight.json"
jq -e '.[0] | .spam_columns == 5 and .spam_indexes == 2 and .spam_indexes_exact == 2
  and .leads_ai_referrer and .phone_clicks_ai_referrer
  and .ai_referrer_function and .ai_referrer_trigger_function
  and .ai_referrer_triggers == 2 and .ai_referrer_triggers_armed == 2
  and .ai_referrer_service_role_execute
  and (.ai_referrer_anon_execute | not) and (.ai_referrer_authenticated_execute | not)
  and (.ai_referrer_trigger_anon_execute | not)
  and (.ai_referrer_trigger_authenticated_execute | not)
  and .leads_zip and .leads_city_source' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || \
  fail 'postflight catalog is missing, disabled, mis-shaped, or over-granted on an object the three targets create'

cli migration-list-after --agent no --output-format json migration list --linked \
  > "$RECEIPT_DIR/migration-list.after.json"
expected_json="$(jq -cn --argjson matched "$matched_json" --argjson pending "$pending_json" \
  '($matched + $pending) | sort')"
jq -e --argjson expected "$expected_json" '
  .migrations as $m
  | ([$m[] | select(.local != "" and .remote != "" and .local == .remote) | .local] | sort)
      == ($expected | sort)
    and ([$m[] | select(.local == "" or .remote == "" or .local != .remote)] | length) == 0
    and ($m | length) == ($expected | length)
    and (([$m[] | .local]) | length) == (([$m[] | .local] | unique) | length)
' "$RECEIPT_DIR/migration-list.after.json" >/dev/null || \
  fail 'final migration list is not the complete expected version set, fully matched'

# The three migrations are additive; nothing in them deletes a row. After a
# committed and recorded apply, a lower count is a concurrent delete from
# outside the exclusive window, not a failed migration — so it is reported as
# exactly that and does not masquerade as a migration failure.
row_count_warning=0
postflight_lead_rows="$(jq -er '.[0].lead_rows' "$RECEIPT_DIR/catalog.postflight.json")"
postflight_phone_click_rows="$(jq -er '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.postflight.json")"
if test "$postflight_lead_rows" -lt "$lead_rows"; then
  row_count_warning=1
  warn "public.leads fell from $lead_rows to $postflight_lead_rows rows. The applied migrations are additive and are recorded, so this is a concurrent delete from outside the exclusive writer window, NOT a failed migration. Investigate the writer; do not roll back on this alone."
fi
if test "$postflight_phone_click_rows" -lt "$phone_click_rows"; then
  row_count_warning=1
  warn "public.phone_clicks fell from $phone_click_rows to $postflight_phone_click_rows rows. Same reading as above: additive migrations, recorded; look for a concurrent delete."
fi

printf 'release_sha=%s\nproject_ref=%s\nmode=apply\napplied=%s\nrow_count_warning=%s\nreceipt_dir=%s\n' \
  "$RELEASE_SHA" "$PROJECT_REF" "$(printf '%s' "$pending" | tr '\n' ' ')" \
  "$row_count_warning" "$RECEIPT_DIR"
jq -c '.[0] | del(.history)' "$RECEIPT_DIR/catalog.postflight.json"
printf 'receipts_contain_cli_diagnostics=1 sanitise_before_sharing=%s\n' "$RECEIPT_DIR"
