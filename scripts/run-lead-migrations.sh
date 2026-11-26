#!/usr/bin/env bash
# Exact-target runner for the three Utah lead migrations:
#   20261027221000_lead_spam_classification.sql
#   20261027230000_ai_referrer_tagging.sql
#   20261122230000_leads_intake_zip_city_source.sql
#
# PREFLIGHT IS READ-ONLY, FOR REAL. Every preflight read — migration history,
# catalog state, row counts — goes to the Supabase Management API read-only
# query endpoint, POST /v1/projects/<ref>/database/query/read-only with
# {"read_only": true}. That is the same surface
# .github/workflows/deploy-edge-function.yml already uses in production, and its
# own query selects from supabase_migrations.schema_migrations, which is the
# evidence that the read-only role can see the history table. The Supabase CLI
# is NOT used for any read: `db query --linked` resolves a live database
# connection first, and that resolution mints a temporary postgres login role
# (POST /v1/projects/<ref>/cli/login-role, read_only:false) and, from the third
# pooler connect failure onward, lists and DELETES the project's IPv4 network
# bans — verified in supabase/cli v2.113.0 (commit 03880bb1),
# apps/cli/src/legacy/shared/legacy-db-config.layer.ts:101-127 and 157-161, with
# apps/cli/src/legacy/commands/db/query/query.handler.ts:283-289 doing it purely
# for pre-run parity and then discarding the connection. Preflight does not
# `link` and does not run any CLI migration subcommand, so none of that happens.
#
# APPLY IS NOT READ-ONLY AND CANNOT BE. `migration up --linked` needs a database
# connection, has no --password flag at this tag, and therefore mints the same
# temporary login role and can remove the same network bans. Those are
# unavoidable apply-time effects; the apply banner names them and the runbook
# records them. Apply uses the CLI only for `init`, `link` and `migration up`;
# its pre-mutation re-probe and its postflight both use the read-only endpoint.
#
# The CLI binary is copied into a private 0700 directory under a fixed trusted
# root, the COPY is hashed with /usr/bin/shasum, and only the copy is executed —
# always under `env -i` with an explicit variable allowlist, `--profile
# supabase` and an absolute `--workdir`. The runner also refuses to run unless
# its own bytes match `git show <RELEASE_SHA>:scripts/run-lead-migrations.sh`.
#
# Usage, from a CLEAN CHECKOUT OF THE RELEASE COMMIT (the self-check requires
# it):
#   RELEASE_SHA=<origin/main tip> SUPABASE_BIN=<absolute path to the 2.113.0 CLI> \
#   SUPABASE_ACCESS_TOKEN=<injected from approved secret storage> \
#   LEAD_MIGRATION_EXCLUSIVE_WRITER_ACK=<same SHA> \
#   LEAD_MIGRATION_EXECUTION_MODE=preflight|apply \
#   LEAD_MIGRATION_AUTH_MODE=injected-token \
#   scripts/run-lead-migrations.sh
#
# ORDER: scripts/run-call-tracking-migrations.sh MUST run first. Its validator
# accepts only the 36-version baseline plus a prefix of its own two versions, so
# once a lead target is recorded it can never run again. Apply mode REFUSES
# until both call-tracking versions are recorded; preflight still reports.
#
# RECEIPTS CONTAIN CLI DIAGNOSTICS AND, IN APPLY MODE, THE LINKED WORKDIR
# (including supabase/.temp/pooler-url). Sanitise before sharing.

# shellcheck disable=SC2016
# Every single-quoted jq program below is deliberate: a `$name` inside one is a
# jq variable bound with --arg/--argjson, not a shell expansion. shellcheck
# recognises a literal `jq` command and stays quiet, but jq is invoked here
# through "$JQ" — one trusted absolute path — so it cannot tell.

set -euo pipefail
umask 077

# Fixed PATH for every utility this script calls, plus absolute paths for the
# four that matter. TMPDIR is never read: the private directory is created under
# a fixed trusted root instead, so a caller-supplied TMPDIR has no effect.
PATH='/usr/bin:/bin:/usr/sbin:/sbin'
export PATH
SHASUM='/usr/bin/shasum'
GIT='/usr/bin/git'
CURL='/usr/bin/curl'
ENV='/usr/bin/env'
AWK='/usr/bin/awk'
BASH='/bin/bash'
TRUSTED_TMP_ROOT='/private/tmp'
API_BASE='https://api.supabase.com'

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
T2_SHA256='d9dbc7c8d1ada8244301ff2b72a12838610e5f3d60314ac2420f1ed330470fda'
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

cli_calls_made=''
RELEASE_SHA="${RELEASE_SHA:-}"
EXECUTION_MODE="${LEAD_MIGRATION_EXECUTION_MODE:-}"
AUTH_MODE="${LEAD_MIGRATION_AUTH_MODE:-}"
# jq is not in the fixed system PATH on macOS, so it is the one tool named by a
# short list of absolute candidates rather than one literal: Homebrew's path
# first, then the system path. Nothing about it is configurable.
JQ=''
for jq_candidate in /opt/homebrew/bin/jq /usr/bin/jq; do
  if test -x "$jq_candidate"; then JQ="$jq_candidate"; break; fi
done

# --- hostile environment ----------------------------------------------------
# Deny-list pre-check, kept in front of the env -i allowlist. Verified against
# supabase/cli v2.113.0: with no --profile flag and no SUPABASE_PROFILE the CLI
# falls back to the persisted ~/.supabase/profile file, whose token may be a
# path to a viper config file, and a profile supplies api_url, project_host and
# pooler_host — so clearing the environment is necessary but not sufficient, and
# --profile supabase is pinned on every call as well
# (legacy-cli-config.layer.ts:31-33,38-80,98-126; legacy-profile-load.ts:
# 101-145,215-221).
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
# bash initialises PS4 to '+ ' itself, so only an inherited value is rejected.
case "${PS4:-+ }" in
  '+ ') ;;
  *) fail 'unset PS4: a custom trace prompt can execute a command substitution' ;;
esac

test -n "$JQ" || \
  fail 'jq must be installed at /opt/homebrew/bin/jq or /usr/bin/jq; this runner accepts no path override'
# jq's `as` binding changed in 1.8 and the catalog validator is written for both,
# but a version outside the reviewed range is still a stop.
jq_version="$("$JQ" --version 2>/dev/null || true)"
case "$jq_version" in
  jq-1.6*|jq-1.7*|jq-1.8*) ;;
  *) fail "jq version '$jq_version' is outside the reviewed range (jq-1.6 to jq-1.8)" ;;
esac

for trusted_tool in "$SHASUM" "$GIT" "$CURL" "$ENV" "$AWK" "$BASH"; do
  test -x "$trusted_tool" || \
    fail "$trusted_tool is missing; this runner only uses trusted absolute utilities"
done

# The access token is handled by this script, so it must be a single clean line:
# anything else could break out of the curl config document or the launcher's
# `read`.
case "${SUPABASE_ACCESS_TOKEN:-}" in
  *[!0-9A-Za-z._-]*)
    fail 'SUPABASE_ACCESS_TOKEN contains a character outside [0-9A-Za-z._-]; refusing to pass it through a curl config or a shell read' ;;
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
case "$EXECUTION_MODE" in
  preflight|apply) ;;
  *) fail 'LEAD_MIGRATION_EXECUTION_MODE must be preflight or apply' ;;
esac
# injected-token only. The read-only endpoint needs a bearer token in both
# modes, and the only other source is the macOS Keychain, which would mean
# running `security find-generic-password -w` to print the operator's token into
# a shell variable — the exact thing this repository's rules forbid, and it can
# raise an interactive Keychain prompt in a non-interactive run. So
# keychain-profile mode is refused outright rather than half-supported.
case "$AUTH_MODE" in
  injected-token) ;;
  keychain-profile)
    fail 'keychain-profile mode is not supported: every read now goes through the Management API read-only endpoint, which needs a bearer token, and extracting it from the Keychain would mean printing it. Use LEAD_MIGRATION_AUTH_MODE=injected-token with SUPABASE_ACCESS_TOKEN from approved secret storage' ;;
  *) fail 'LEAD_MIGRATION_AUTH_MODE must be injected-token' ;;
esac
test -n "${SUPABASE_ACCESS_TOKEN:-}" || \
  fail 'inject SUPABASE_ACCESS_TOKEN from approved secret storage'

test "$("$SHASUM" -a 256 <<< "$BASELINE_VERSIONS" | "$AWK" '{print $1}')" = \
  "$BASELINE_SHA256" || fail 'reviewed migration-history baseline digest differs'
test "$(printf '%s\n%s\n' "$BASELINE_VERSIONS" "$CALL_TRACKING_VERSIONS" \
  | sed '/^$/d' | LC_ALL=C sort | "$SHASUM" -a 256 | "$AWK" '{print $1}')" = \
  "$CALL_TRACKING_BASELINE_SHA256" || \
  fail 'reviewed call-tracking migration-history baseline digest differs'

REPO_ROOT="$("$GIT" rev-parse --show-toplevel)"

# --- the release commit -----------------------------------------------------
# FETCH_HEAD, not origin/main: the remote-tracking ref can be stale or set by
# hand, while FETCH_HEAD is what this fetch received.
"$GIT" -C "$REPO_ROOT" fetch --quiet origin main
test "$("$GIT" -C "$REPO_ROOT" rev-parse --verify "${RELEASE_SHA}^{commit}")" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA does not resolve to a commit'
test "$("$GIT" -C "$REPO_ROOT" rev-parse --verify 'FETCH_HEAD^{commit}')" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA is not the main tip this fetch received'
test "$("$GIT" -C "$REPO_ROOT" rev-parse origin/main)" = "$RELEASE_SHA" || \
  fail 'RELEASE_SHA is not the exact current origin/main tip'

# --- self-verification ------------------------------------------------------
# The bytes that are executing must be the reviewed bytes of the release. Run
# this from a clean checkout of RELEASE_SHA; a local edit, a stale checkout or a
# copied script all stop here.
SELF_PATH="$(cd "$(dirname "${BASH_SOURCE[0]}")" >/dev/null 2>&1 && pwd -P)/$(basename "${BASH_SOURCE[0]}")"
self_digest="$("$SHASUM" -a 256 "$SELF_PATH" | "$AWK" '{print $1}')"
release_digest="$("$GIT" -C "$REPO_ROOT" show "${RELEASE_SHA}:scripts/run-lead-migrations.sh" \
  | "$SHASUM" -a 256 | "$AWK" '{print $1}')"
test "$self_digest" = "$release_digest" || \
  fail "the running script is not the reviewed release bytes ($SELF_PATH). Run it from a clean checkout of RELEASE_SHA"

# --- the private working root ----------------------------------------------
test -d "$TRUSTED_TMP_ROOT" || fail "$TRUSTED_TMP_ROOT is missing"
test ! -L "$TRUSTED_TMP_ROOT" || fail "$TRUSTED_TMP_ROOT is a symlink"
RECEIPT_DIR="$(mktemp -d "$TRUSTED_TMP_ROOT/utah-lead-migrations.XXXXXX")"
chmod 700 "$RECEIPT_DIR"
RUNNER_DIR="$RECEIPT_DIR/runner"
CLI_HOME="$RECEIPT_DIR/cli-home"
CURL_HOME="$RECEIPT_DIR/curl-home"
BIN_DIR="$RECEIPT_DIR/bin"
mkdir -p "$RUNNER_DIR" "$CLI_HOME" "$CURL_HOME" "$BIN_DIR"
chmod 700 "$RUNNER_DIR" "$CLI_HOME" "$CURL_HOME" "$BIN_DIR"
# `find -perm` rather than stat: BSD and GNU stat disagree on flags, and this
# suite runs the real script on Linux as well as on the macOS it targets.
test -n "$(find "$RECEIPT_DIR" -maxdepth 0 -type d -perm 700 -print)" || \
  fail 'the private directory is not mode 0700'
# Printed before anything else can happen, so a crashed run is still recoverable.
printf 'receipt_dir=%s\nmode=%s\n' "$RECEIPT_DIR" "$EXECUTION_MODE"

# The CLI release is a Bun single-file executable and Bun reads a dotenv file
# from the process working directory at runtime, so no CLI process may ever have
# the repository checkout as its cwd. Every git call below names $REPO_ROOT
# explicitly, so moving now is safe.
cd "$RUNNER_DIR"

# --- the CLI binary: copy first, hash the copy, execute only the copy -------
case "${SUPABASE_BIN:-}" in
  '') fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI' ;;
  /*) ;;
  *) fail 'SUPABASE_BIN must be an absolute path, never a PATH-resolved command name' ;;
esac
test ! -L "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must be the reviewed file itself, not a symlink whose target can change'
test -f "$SUPABASE_BIN" && test -x "$SUPABASE_BIN" || \
  fail 'SUPABASE_BIN must name the reviewed executable Supabase CLI'
test "$(basename "$SUPABASE_BIN")" != 'supabase-go' || \
  fail 'the internal supabase-go compatibility binary is forbidden'
test "$(uname -s)" = 'Darwin' && test "$(uname -m)" = 'arm64' || \
  fail 'the reviewed CLI binary receipt is only valid on macOS arm64'
CLI="$BIN_DIR/supabase"
cp "$SUPABASE_BIN" "$CLI"
chmod 500 "$CLI"
test ! -L "$CLI" || fail 'the private CLI copy is a symlink'
test "$("$SHASUM" -a 256 "$CLI" | "$AWK" '{print $1}')" = "$CLI_SHA256" || \
  fail 'the private copy of the Supabase CLI does not match the reviewed official release digest'

# Every CLI invocation: the private copy, under env -i with an explicit
# allowlist, pinned to the built-in profile and an absolute workdir, both
# streams retained. HOME is passed but redirected into the private directory on
# purpose: the CLI reads ~/.supabase/access-token and ~/.supabase/profile
# (apps/cli/src/legacy/commands/migration/up/SIDE_EFFECTS.md, and
# legacy-cli-config.layer.ts:58-76) and may write config there, so a private
# HOME stops it reading the operator's persisted profile or token and keeps any
# write inside the receipt directory. Omitting HOME entirely is worse: tools
# then fall back to the passwd entry, i.e. the real home.
# The token is NEVER an argument. `env -i VAR=secret …` would put it in env's
# own argv, where `ps` shows it to every user on the machine; instead it is
# piped in and exported inside a one-line launcher that reads it from stdin and
# then re-points stdin at /dev/null. printf is a shell builtin, so the value
# never appears in any process's argv and is never written to a file.
cli() {
  local label="$1"
  shift
  cli_calls_made="${cli_calls_made:+$cli_calls_made,}$label"
  printf '%s' "$SUPABASE_ACCESS_TOKEN" | "$ENV" -i \
    HOME="$CLI_HOME" \
    PATH='/usr/bin:/bin:/usr/sbin:/sbin' \
    LANG=C \
    LC_ALL=C \
    SUPABASE_NO_KEYRING=1 \
    "$BASH" -c 'IFS= read -r injected_token
export SUPABASE_ACCESS_TOKEN="$injected_token"
unset injected_token
exec 0</dev/null
exec "$@"' lead-migration-launcher \
    "$CLI" --profile supabase --workdir "$RUNNER_DIR" "$@" \
    > "$RECEIPT_DIR/cli.${label}.stdout.txt" \
    2> "$RECEIPT_DIR/cli.${label}.stderr.txt"
}

cli version --version
test "$(head -n 1 "$RECEIPT_DIR/cli.version.stdout.txt")" = '2.113.0' || \
  fail 'Supabase CLI 2.113.0 is required'

projects_exit=0
cli projects-list --agent no --output-format json projects list || projects_exit=$?
test "$projects_exit" = '0' || \
  fail "the pinned CLI could not list projects (exit $projects_exit). Its streams are in $RECEIPT_DIR/cli.projects-list.std*.txt and are NOT reproduced here: the CLI puts server response bodies into its errors. Re-authenticate and retry."
"$JQ" -e -s --arg project "$PROJECT_REF" '
  length == 1
  and (.[0] | type == "object")
  and (.[0].projects | type == "array")
  and (([.[0].projects[] | select(.id == $project)] | length) == 1)
' "$RECEIPT_DIR/cli.projects-list.stdout.txt" >/dev/null || \
  fail 'the CLI login cannot resolve the exact Utah project'

# --- the read-only query path ----------------------------------------------
# POST /v1/projects/<ref>/database/query/read-only with {"read_only": true}, the
# same surface .github/workflows/deploy-edge-function.yml uses in production —
# and that workflow's own query reads supabase_migrations.schema_migrations,
# which is the evidence that the read-only role can see the history table. The
# project ref is a literal in the URL, so this cannot be redirected by a profile
# or an environment variable.
#
# The bearer token never appears in argv and is never written to a file: curl
# reads its configuration from stdin (`--config -`), and the config is produced
# by a shell builtin, so the value exists only in that pipe. The SQL body goes
# in a 0600 file, which holds no secret.
# Request body is exactly {"query": "<sql>"} — the documented schema for this
# endpoint (Supabase API reference, "Run a sql query as supabase_read_only_user":
# `query` required string, `parameters` optional array, and NO `read_only`
# member; the read-only behaviour comes from the path). An earlier revision sent
# an undocumented `read_only: true`; it is removed. Documented success is 201;
# 200 is accepted too because the reference shows only 201 and the endpoint is
# marked Beta, and anything else is a hard stop.
#
# curl runs isolated: `env -i` drops HTTPS_PROXY, ALL_PROXY, CURL_CA_BUNDLE,
# SSL_CERT_FILE and everything else from the caller; HOME points at an empty
# private directory; and `-q` is the FIRST argument, so no ~/.curlrc or
# $CURL_HOME/.curlrc is read. The token reaches curl only through the config
# document on stdin, produced by a shell builtin — never an argv, never a file.
ro_query() {
  local label="$1" sql_file="$2" out_file="$3" status_file raw_file
  status_file="$RECEIPT_DIR/ro.${label}.status.txt"
  raw_file="$RECEIPT_DIR/ro.${label}.raw.json"
  "$JQ" -Rs '{query: .}' < "$sql_file" > "$RECEIPT_DIR/ro.${label}.body.json"
  printf '%s\n' \
    "request = \"POST\"" \
    "url = \"$API_BASE/v1/projects/$PROJECT_REF/database/query/read-only\"" \
    "header = \"Authorization: Bearer $SUPABASE_ACCESS_TOKEN\"" \
    "header = \"Content-Type: application/json\"" \
    "header = \"User-Agent: SupabaseCLI/2.113.0\"" \
    "data-binary = \"@$RECEIPT_DIR/ro.${label}.body.json\"" \
    "output = \"$raw_file\"" \
    "write-out = \"%{http_code}\"" \
    "fail-with-body" \
    "silent" \
    "show-error" \
    "retry = \"3\"" \
    | "$ENV" -i HOME="$CURL_HOME" PATH='/usr/bin:/bin:/usr/sbin:/sbin' \
        LANG=C LC_ALL=C \
        "$CURL" -q --config - \
        > "$status_file" 2> "$RECEIPT_DIR/ro.${label}.stderr.txt" || {
      fail "the read-only query ($label) failed. Its streams are in $RECEIPT_DIR/ro.${label}.* and are NOT reproduced here: a Management API error body can echo request content."
    }
  case "$(cat "$status_file")" in
    200|201) ;;
    *) fail "the read-only query ($label) returned HTTP $(cat "$status_file"); only 200 and 201 are accepted. See $RECEIPT_DIR/ro.${label}.*" ;;
  esac
  # Fail closed on the response shape before anything reads a field. `-s` makes
  # an empty body or an empty stream a zero-length slurp, which fails length==1
  # on jq 1.6 through 1.8 instead of silently yielding null. Flags must be JSON
  # booleans and counts non-negative integers: a string "false" is a hard stop,
  # and nothing is coerced.
  "$JQ" -e -s --argjson bools "$RO_BOOLEAN_FIELDS" --argjson counts "$RO_COUNT_FIELDS" '
    length == 1
    and (.[0] | type == "array")
    and (.[0] | length == 1)
    and (.[0][0] | type == "object")
    and (.[0][0] as $row
         | ($row.history | type == "array")
         and ($row.history | all(type == "string"))
         and (all($bools[]; . as $f | ($row | has($f)) and ($row[$f] | type == "boolean")))
         and (all($counts[]; . as $f
                  | ($row | has($f))
                    and ($row[$f] | type == "number")
                    and ($row[$f] >= 0)
                    and ($row[$f] | floor == .))))
  ' "$raw_file" >/dev/null || \
    fail "the read-only query ($label) did not return exactly one array of one row object with JSON booleans and non-negative integer counts; see $raw_file"
  # Normalise to the one-row array every later program expects.
  "$JQ" -s '.[0]' "$raw_file" > "$out_file"
}

# Catalog probe, specific to the three targets. Read-only by construction: it
# selects from catalogs, from supabase_migrations.schema_migrations, and two row
# counts, and the endpoint runs it in a read-only transaction.
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
# public.leads and public.phone_clicks and holds it through its in-transaction
# backfill. No lock_timeout is set — see the runbook.
# The exact fields the probe returns, split by JSON type. The shape gate above
# requires every one of them to be present with the right type.
RO_BOOLEAN_FIELDS='["leads_ai_referrer","phone_clicks_ai_referrer","ai_referrer_function","ai_referrer_trigger_function","ai_referrer_service_role_execute","ai_referrer_anon_execute","ai_referrer_authenticated_execute","ai_referrer_trigger_anon_execute","ai_referrer_trigger_authenticated_execute","leads_zip","leads_city_source"]'
RO_COUNT_FIELDS='["spam_columns","spam_indexes","spam_indexes_exact","ai_referrer_triggers","ai_referrer_triggers_armed","lead_rows","phone_click_rows"]'

write_probe_sql() {
  cat > "$RECEIPT_DIR/probe.sql" <<'SQL'
select
  (select coalesce(pg_catalog.jsonb_agg(version::text order by version::text), '[]'::jsonb)
     from supabase_migrations.schema_migrations) as history,
  (select pg_catalog.count(*) from information_schema.columns
     where table_schema = 'public' and table_name = 'leads'
       and column_name in ('spam_label', 'spam_score', 'spam_reason',
                           'spam_classifier', 'spam_classified_at')) as spam_columns,
  (select pg_catalog.count(*) from pg_catalog.pg_indexes
     where schemaname = 'public' and tablename = 'leads'
       and indexname in ('leads_spam_unclassified_idx',
                         'leads_spam_label_created_idx')) as spam_indexes,
  (select pg_catalog.count(*) from pg_catalog.pg_index i
      join pg_catalog.pg_class ic on ic.oid = i.indexrelid
      join pg_catalog.pg_class tc on tc.oid = i.indrelid
      join pg_catalog.pg_namespace n on n.oid = tc.relnamespace
     where n.nspname = 'public' and tc.relname = 'leads'
       and i.indisvalid and i.indisready
       and pg_catalog.pg_get_indexdef(i.indexrelid) in (
         'CREATE INDEX leads_spam_unclassified_idx ON public.leads USING btree (created_at DESC) WHERE (spam_label IS NULL)',
         'CREATE INDEX leads_spam_label_created_idx ON public.leads USING btree (spam_label, created_at DESC)'
       )) as spam_indexes_exact,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'ai_referrer') as leads_ai_referrer,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'phone_clicks' and column_name = 'ai_referrer') as phone_clicks_ai_referrer,
  pg_catalog.to_regprocedure('public.frame_ai_referrer(text,text)') is not null as ai_referrer_function,
  pg_catalog.to_regprocedure('public.frame_set_ai_referrer()') is not null as ai_referrer_trigger_function,
  (select pg_catalog.count(*) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
     where n.nspname = 'public' and not t.tgisinternal
       and ((c.relname = 'leads' and t.tgname = 'leads_set_ai_referrer')
         or (c.relname = 'phone_clicks' and t.tgname = 'phone_clicks_set_ai_referrer'))) as ai_referrer_triggers,
  (select pg_catalog.count(*) from pg_catalog.pg_trigger t
      join pg_catalog.pg_class c on c.oid = t.tgrelid
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      join pg_catalog.pg_proc p on p.oid = t.tgfoid
      join pg_catalog.pg_namespace fn on fn.oid = p.pronamespace
     where n.nspname = 'public' and not t.tgisinternal
       and t.tgenabled = 'O'
       and t.tgtype = 7
       and t.tgqual is null
       and fn.nspname = 'public' and p.proname = 'frame_set_ai_referrer'
       and ((c.relname = 'leads' and t.tgname = 'leads_set_ai_referrer')
         or (c.relname = 'phone_clicks' and t.tgname = 'phone_clicks_set_ai_referrer'))) as ai_referrer_triggers_armed,
  (case when pg_catalog.to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else pg_catalog.has_function_privilege('service_role',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_service_role_execute,
  (case when pg_catalog.to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else pg_catalog.has_function_privilege('anon',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_anon_execute,
  (case when pg_catalog.to_regprocedure('public.frame_ai_referrer(text,text)') is null then false
        else pg_catalog.has_function_privilege('authenticated',
               'public.frame_ai_referrer(text,text)', 'EXECUTE') end) as ai_referrer_authenticated_execute,
  (case when pg_catalog.to_regprocedure('public.frame_set_ai_referrer()') is null then false
        else pg_catalog.has_function_privilege('anon',
               'public.frame_set_ai_referrer()', 'EXECUTE') end) as ai_referrer_trigger_anon_execute,
  (case when pg_catalog.to_regprocedure('public.frame_set_ai_referrer()') is null then false
        else pg_catalog.has_function_privilege('authenticated',
               'public.frame_set_ai_referrer()', 'EXECUTE') end) as ai_referrer_trigger_authenticated_execute,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'zip') as leads_zip,
  exists (select 1 from information_schema.columns where table_schema = 'public'
           and table_name = 'leads' and column_name = 'city_source') as leads_city_source,
  (select pg_catalog.count(*) from public.leads) as lead_rows,
  (select pg_catalog.count(*) from public.phone_clicks) as phone_click_rows
SQL
}
write_probe_sql

run_catalog_probe() {
  ro_query "catalog-$1" "$RECEIPT_DIR/probe.sql" "$RECEIPT_DIR/catalog.$1.json"
}

baseline_json="$(printf '%s\n' "$BASELINE_VERSIONS" | "$JQ" -Rsc 'split("\n") | map(select(length > 0))')"
call_tracking_json="$(printf '%s\n' "$CALL_TRACKING_VERSIONS" | "$JQ" -Rsc 'split("\n") | map(select(length > 0))')"

# Accepted remote history: the reviewed 36-version baseline, or that baseline
# plus BOTH call-tracking versions, in either case plus any already-recorded
# subset of the three lead targets. For each target the catalog must be
# all-absent when its version is not recorded and all-present AND ARMED when it
# is; a half-applied target without a history row is a hard stop, as is one of
# the two call-tracking versions.
#
# There is no recovery mode. 20261027230000 contains an explicit begin/commit,
# so its schema change can commit before the history row is inserted — but CLI
# 2.113.0 gives no way to tell that apart from any other failure: exit codes are
# only 0 and 1 for both a connection failure and a SQL error
# (apps/cli/src/legacy/commands/migration/up/SIDE_EFFECTS.md), the
# `Applying migration <file>...` line is printed BEFORE the file executes, and
# the structured `applied` list is emitted only on success. So "objects present,
# history row absent" is indistinguishable from a hand-applied migration or a
# partial manual run, and the runner stops and says to escalate instead of
# offering a replay.
#
# The `if … then … else … end` wrapper is deliberate: `a and b and .[0] as $s |
# …` — the shape scripts/run-call-tracking-migrations.sh uses — changed meaning
# in jq 1.8, where `as` takes the whole `and` chain, so every field read dies
# with "Cannot index boolean with string". Verified across 1.6, 1.7, 1.7.1,
# 1.7.1-apple, 1.8.0 and 1.8.1.
validate_catalog_state() {
  "$JQ" -e --argjson baseline "$baseline_json" --argjson calltracking "$call_tracking_json" \
    --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" '
      if type != "array" or length != 1 then false else
      .[0]
      | . as $s
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
      and ($s.spam_indexes_exact == (if $r1 then 2 else 0 end))
      and ($s.leads_ai_referrer == $r2)
      and ($s.phone_clicks_ai_referrer == $r2)
      and ($s.ai_referrer_function == $r2)
      and ($s.ai_referrer_trigger_function == $r2)
      and ($s.ai_referrer_triggers == (if $r2 then 2 else 0 end))
      and ($s.ai_referrer_triggers_armed == (if $r2 then 2 else 0 end))
      and ($s.ai_referrer_service_role_execute == $r2)
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

# The COMMIT-before-history shape, recognised only to produce a better message.
is_unrecorded_t2_state() {
  "$JQ" -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" '
    if type != "array" or length != 1 then false else
    .[0] | . as $s
    | ($s.history | any(.[]; . == $t1)) as $r1
    | ($s.history | any(.[]; . == $t2)) as $r2
    | $r1 and ($r2 | not)
      and $s.leads_ai_referrer and $s.phone_clicks_ai_referrer
      and $s.ai_referrer_function and $s.ai_referrer_trigger_function
    end
  ' "$1" >/dev/null 2>&1
}

run_catalog_probe before

if is_unrecorded_t2_state "$RECEIPT_DIR/catalog.before.json"; then
  fail "STOP AND ESCALATE. 20261027230000 looks applied but is NOT recorded: 20261027221000 is recorded, the AI-referrer objects are present, and there is no history row for 20261027230000. This runner will not repair it. CLI 2.113.0 cannot prove a history-write failure (exit codes 0/1 only, the Applying-migration line prints before the file runs, and the applied list is emitted only on success), so this state is indistinguishable from a hand-applied migration or a partial manual run. Escalate with $RECEIPT_DIR; never use migration repair."
fi

validate_catalog_state "$RECEIPT_DIR/catalog.before.json"
r1="$("$JQ" -r --arg v "$T1_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r2="$("$JQ" -r --arg v "$T2_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
r3="$("$JQ" -r --arg v "$T3_VERSION" '.[0].history | any(.[]; . == $v)' "$RECEIPT_DIR/catalog.before.json")"
lead_rows="$("$JQ" -er '.[0].lead_rows' "$RECEIPT_DIR/catalog.before.json")"
phone_click_rows="$("$JQ" -er '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.before.json")"
matched_json="$("$JQ" -c '.[0].history' "$RECEIPT_DIR/catalog.before.json")"
call_tracking_recorded="$("$JQ" -r --argjson ct "$call_tracking_json" \
  '.[0].history | (any(.[]; . == $ct[0]) and any(.[]; . == $ct[1]))' \
  "$RECEIPT_DIR/catalog.before.json")"

if test "$EXECUTION_MODE" = 'apply' && test "$call_tracking_recorded" != 'true'; then
  fail 'scripts/run-call-tracking-migrations.sh must be applied first. Its own validator accepts only the 36-version baseline plus a prefix of its two versions, so once a lead target is recorded it can never run again. Finish 20261027200000 + 20261027220000 through that runner, then re-run this one.'
fi

# --- stage exactly the reviewed targets plus one guard per recorded version --
"$GIT" -C "$REPO_ROOT" archive --format=tar "$RELEASE_SHA" -- \
  "supabase/migrations/$T1_BASENAME" "supabase/migrations/$T2_BASENAME" \
  "supabase/migrations/$T3_BASENAME" "$GUARD_PATH" \
  | tar -xf - -C "$RUNNER_DIR"

sha_of() { "$SHASUM" -a 256 "$1" | "$AWK" '{print $1}'; }
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

pending_json="$(printf '%s\n' "$pending" | sed '/^$/d' | sed 's/_.*//' | "$JQ" -Rsc 'split("\n") | map(select(length > 0))')"
pending_files_json="$(printf '%s\n' "$pending" | sed '/^$/d' | "$JQ" -Rsc 'split("\n") | map(select(length > 0))')"
"$JQ" -n --arg sha "$RELEASE_SHA" --arg ref "$PROJECT_REF" --arg mode "$EXECUTION_MODE" \
  --argjson pending "$pending_files_json" \
  '{release_sha: $sha, project_ref: $ref, mode: $mode, pending: $pending}' \
  > "$RECEIPT_DIR/run.json"

"$JQ" -r '.[0].history[]' "$RECEIPT_DIR/catalog.before.json" | while IFS= read -r version; do
  test -n "$version" || continue
  cp "$GUARD_PATH" "supabase/migrations/${version}_remote_applied_history_guard.sql"
done
test -z "$(find supabase/migrations -mindepth 1 ! -type f -print -quit)" || \
  fail 'migration runner contains a symlink, directory, or special entry'

# The local-vs-remote comparison, rebuilt from the history read plus the staged
# file set. `migration list --linked` is deliberately NOT used: it needs a
# database connection, which is what mints the login role. The cmp below is the
# whole check in both directions — exactly one guard per recorded version, plus
# exactly the pending targets, and nothing else.
find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' -exec basename {} \; \
  | LC_ALL=C sort > "$RECEIPT_DIR/staged-migrations.txt"
"$JQ" -r --argjson matched "$matched_json" -n \
  '($matched | map(. + "_remote_applied_history_guard.sql"))[]' \
  > "$RECEIPT_DIR/staged-migrations.expected.txt"
printf '%s\n' "$pending" | sed '/^$/d' >> "$RECEIPT_DIR/staged-migrations.expected.txt"
LC_ALL=C sort -o "$RECEIPT_DIR/staged-migrations.expected.txt" \
  "$RECEIPT_DIR/staged-migrations.expected.txt"
cmp -s "$RECEIPT_DIR/staged-migrations.txt" "$RECEIPT_DIR/staged-migrations.expected.txt" || \
  fail 'the staged migration set is not exactly one guard per recorded version plus the pending targets'

run_catalog_probe final-preflight
validate_catalog_state "$RECEIPT_DIR/catalog.final-preflight.json"
test "$("$JQ" -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.before.json")" = \
  "$("$JQ" -Sc '.[0] | del(.lead_rows, .phone_click_rows)' "$RECEIPT_DIR/catalog.final-preflight.json")" || \
  fail 'catalog changed between the first and the final read'

# --- summary: an explicit field allowlist -----------------------------------
# Only these fields are ever printed. The catalog JSON is NOT echoed; it stays
# in the receipt directory.
print_summary() {
  printf 'release_sha=%s\nproject_ref=%s\nmode=%s\npending=%s\nlead_rows=%s\nphone_click_rows=%s\ncall_tracking_recorded=%s\nrow_count_warning=%s\nreceipt_dir=%s\n' \
    "$RELEASE_SHA" "$PROJECT_REF" "$EXECUTION_MODE" \
    "$(printf '%s' "$pending" | tr '\n' ' ')" \
    "$lead_rows" "$phone_click_rows" "$call_tracking_recorded" "$1" "$RECEIPT_DIR"
  printf 'lock_note=20261027230000 holds ACCESS EXCLUSIVE on public.leads (%s rows) and public.phone_clicks (%s rows) through its backfill; no lock_timeout is set, so run off-peak\n' \
    "$lead_rows" "$phone_click_rows"
  printf 'receipts_contain_cli_diagnostics=1\n'
}

if test "$EXECUTION_MODE" = 'preflight'; then
  print_summary 0
  printf 'reads=management-api-read-only\ncli_calls=%s\n' "$cli_calls_made"
  exit 0
fi

# --- apply ------------------------------------------------------------------
printf 'apply_side_effects=migration up --linked opens a database connection, so the CLI mints a temporary postgres login role (POST /v1/projects/<ref>/cli/login-role, read_only:false) and, from the third pooler connect failure onward, lists and DELETES this project IPv4 network bans. Both are unavoidable at apply time: migration up has no --password flag at 2.113.0.\n'

if test -n "$pending"; then
  cli init init --workdir "$RUNNER_DIR"
  test -f "$RUNNER_DIR/supabase/config.toml" || fail 'the runner workdir has no generated config'
  test ! -e supabase/.temp/project-ref || fail 'runner was linked before validation'
  cli link link --project-ref "$PROJECT_REF" --yes
  test "$(cat supabase/.temp/project-ref)" = "$PROJECT_REF" || fail 'runner linked to the wrong project'

  migration_exit=0
  cli migration-up --agent no --output-format json \
    migration up --linked --include-all --yes || migration_exit=$?
  # A grep read error is a hard stop, not a clean scan.
  guard_scan=0
  grep -Fq 'remote_applied_history_guard.sql' \
    "$RECEIPT_DIR/cli.migration-up.stdout.txt" \
    "$RECEIPT_DIR/cli.migration-up.stderr.txt" || guard_scan=$?
  case "$guard_scan" in
    0) fail 'a remote-history poison guard was selected' ;;
    1) ;;
    *) fail "could not scan the CLI output for a selected poison guard (grep exit $guard_scan)" ;;
  esac
  test "$migration_exit" = '0' || \
    fail "migration up failed; retain $RECEIPT_DIR, release nothing, and do not repair history. If the catalog now shows the AI-referrer objects present without their history row, STOP AND ESCALATE — this runner has no replay path."
  # Same fail-closed shape gate for the CLI's JSON: exactly one document, an
  # object, with `applied` an array of strings. An empty stdout slurps to [] and
  # fails length==1.
  "$JQ" -e -s '
    length == 1
    and (.[0] | type == "object")
    and (.[0] | has("applied"))
    and (.[0].applied | type == "array")
    and (.[0].applied | all(type == "string"))
  ' "$RECEIPT_DIR/cli.migration-up.stdout.txt" >/dev/null || \
    fail "migration up did not return one JSON object with an applied string array; see $RECEIPT_DIR/cli.migration-up.stdout.txt"
  applied="$("$JQ" -r -s '.[0].applied[] | split("/")[-1]' "$RECEIPT_DIR/cli.migration-up.stdout.txt")"
  test "$applied" = "$pending" || fail 'migration up did not apply exactly the pending targets in order'
else
  printf 'All three targets are already recorded; postflight checks only.\n'
fi

run_catalog_probe postflight
"$JQ" -e --arg t1 "$T1_VERSION" --arg t2 "$T2_VERSION" --arg t3 "$T3_VERSION" \
  '.[0].history | any(.[]; . == $t1) and any(.[]; . == $t2) and any(.[]; . == $t3)' \
  "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || \
  fail "postflight history lacks a target. If the catalog shows the AI-referrer objects present, STOP AND ESCALATE with $RECEIPT_DIR; there is no replay path."
validate_catalog_state "$RECEIPT_DIR/catalog.postflight.json"
"$JQ" -e '.[0] | .spam_columns == 5 and .spam_indexes == 2 and .spam_indexes_exact == 2
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
# The complete expected history, rebuilt locally: what was matched before plus
# exactly what was pending.
expected_json="$("$JQ" -cn --argjson matched "$matched_json" --argjson pending "$pending_json" \
  '($matched + $pending) | sort')"
"$JQ" -e --argjson expected "$expected_json" '
  (.[0].history | sort) == ($expected | sort)
' "$RECEIPT_DIR/catalog.postflight.json" >/dev/null || \
  fail 'postflight history is not exactly the matched history plus the pending targets'

# The three migrations are additive; nothing in them deletes a row. After a
# committed and recorded apply, a lower count is a concurrent delete from
# outside the exclusive window, not a failed migration.
row_count_warning=0
postflight_lead_rows="$("$JQ" -er '.[0].lead_rows' "$RECEIPT_DIR/catalog.postflight.json")"
postflight_phone_click_rows="$("$JQ" -er '.[0].phone_click_rows' "$RECEIPT_DIR/catalog.postflight.json")"
if test "$postflight_lead_rows" -lt "$lead_rows"; then
  row_count_warning=1
  warn "public.leads fell from $lead_rows to $postflight_lead_rows rows. The applied migrations are additive and are recorded, so this is a concurrent delete from outside the exclusive writer window, NOT a failed migration. Investigate the writer; do not roll back on this alone."
fi
if test "$postflight_phone_click_rows" -lt "$phone_click_rows"; then
  row_count_warning=1
  warn "public.phone_clicks fell from $phone_click_rows to $postflight_phone_click_rows rows. Same reading as above: additive migrations, recorded; look for a concurrent delete."
fi

print_summary "$row_count_warning"
# Only what actually ran: a no-op apply never reports init, link or migration-up.
printf 'reads=management-api-read-only\ncli_calls=%s\n' "$cli_calls_made"
