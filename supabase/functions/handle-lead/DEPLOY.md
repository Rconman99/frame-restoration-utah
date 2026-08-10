# handle-lead v10 — Deploy & Test Guide

> Rollout hard stop (2026-08-07): apply
> `20260807000160_lead_intake_rate_limit.sql` and set a distinct
> `LEAD_INTAKE_RATE_LIMIT_SECRET` of at least 32 bytes before deploying v10.
> Do not deploy the IP-keyed throttle until the production environment holds a
> fresh HMAC-signed client-IP receipt bound to the exact main SHA, Utah project,
> current `_shared/client-ip.ts` digest, deployed probe bundle/version, and
> passed canary/cleanup results. The Markdown receipt under `data/` is INVALID
> historical evidence and never authorizes a deploy. The only trusted identity
> is canonical `cf-connecting-ip`; missing/malformed CF identity fails closed,
> and `x-real-ip`/`x-forwarded-for` never select a client.

## v10 intake and notification safety contract

- The server requires a real name plus either a valid NANP US phone or valid
  email. Browser `required` attributes are convenience only.
- JSON, URL-encoded, and multipart bodies are streamed into a 32 KiB cap;
  unknown, duplicate, file, control-character, and over-limit fields fail.
- Blank `company_website` honeypots exist on the homepage hero/contact forms,
  standalone hero, and global modal. A filled honeypot returns the generic
  success surface without creating rate state, a lead, or any provider call.
- The service-role-only `reserve_lead_intake_attempt` RPC atomically permits
  five attempts per context-separated client-IP HMAC per 15 minutes. RPC,
  secret, and response-shape failures fail closed.
- A no-JavaScript form retry receives the same daily, payload-bound submission
  UUID for that client HMAC, so browser fallback retries do not create or notify
  a second lead.
- Duplicate notification recovery builds the complete email from the stored
  lead row, honors `next_attempt_at`, and never reruns SMS or Sheet effects.
- Inline and scheduled senders share one version-CAS claim RPC and ten-minute
  lease. Completion must own the exact claim version; an active attempt-eight
  lease cannot be exhausted underneath a live provider call.
- The first successful claim atomically freezes the full Resend request:
  sender, recipient, reply-to, subject, text, and stable non-PII Utah owner tag.
  Every retry reuses those exact values and the original idempotency key.
- Signed webhook events without the Utah owner tag (including Verizon gateway
  and unrelated account mail) are acknowledged and ignored. Early owner events
  are persisted, acknowledged with HTTP 200, and globally reconciled by every
  worker run so a completion/reconciliation crash cannot strand them.
- Missing/rejected Resend credentials remain queued without consuming the
  finite retry budget. The request and background worker return 503 so the
  outage is visible rather than silently accepting an unnotified inquiry.
- The worker remains HTTP 503 for unacknowledged terminal failures/bounces/
  complaints, provider/configuration outages, general retryable failures,
  delivery delays older than 24 hours, and provider acceptance without a
  delivery webhook after one hour.

## Production deployment evidence issuance

There is no owner-notification approval dropdown and no editable file can
authorize either protected rollout. The production deploy workflow reads live
Utah migration history, Edge secret metadata, and function metadata, then
verifies a one-hour HMAC receipt bound to the exact current main SHA, project,
target function, and those live metadata values.

The three protected targets have two phases:

- `lead-notification-worker` and `resend-webhook` require
  `phase: infrastructure-ready` plus live migrations `00100`, `00160`, and
  `00165` and every required live Edge secret name.
- `handle-lead` requires `phase: handler-ready`, both live functions in
  `ACTIVE` state, and fresh no-send canaries against their exact live versions.
  The worker canary is an authenticated `health-only` request that performs
  read-only count queries and cannot reconcile, exhaust, claim, or send. It
  also calls Resend's read-only domains endpoint and requires the documented
  `restricted_api_key` response, proving the key is valid Sending access rather
  than an overprivileged full-access key. That response cannot prove the key's
  domain scope, so the Resend UI/provider receipt must separately show the Utah
  sender domain is verified and selected. The webhook canary is a valid
  Svix-signed untagged event and must return
  `state:"ignored"`, so it proves the live signing secret without persisting an
  owner event or sending mail. Both responses must report the hosted
  `DENO_DEPLOYMENT_ID` (`project_ref_function_id_version`); the workflow
  serializes production deploys and refreshes live migration, secret, and
  function metadata after the canaries before it verifies the signed receipt.

Required Supabase Edge secret names are
`SUPABASE_SERVICE_ROLE_KEY`, `UTAH_LEAD_RESEND_API_KEY`,
`UTAH_LEAD_RESEND_FROM`, `LEAD_NOTIFICATION_PRIMARY_EMAIL`,
`LEAD_NOTIFICATION_BACKUP_EMAIL`, `LEAD_NOTIFICATION_WORKER_TOKEN`, and
`RESEND_WEBHOOK_SECRET`; `handle-lead` additionally requires
`LEAD_INTAKE_RATE_LIMIT_SECRET`. Values stay only in Supabase/password-manager
secret storage.

The GitHub environment `Production – frame-restoration-utah` must contain
`SUPABASE_ACCESS_TOKEN`, `LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY`,
`LEAD_NOTIFICATION_WORKER_TOKEN`, and `RESEND_WEBHOOK_SECRET`. The worker and
webhook secrets must match their Supabase Edge values so the fresh canaries
authenticate. The receipt HMAC key is GitHub-only and must be distinct from
dashboard, client-IP, worker, webhook, and intake secrets. The workflow mints a
short-lived `LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN` from fresh live evidence on
each dispatch instead of relying on a stored static token.

### Executable owner-notification receipt path

Run from the exact clean merged main checkout with pinned Supabase CLI 2.113.0.
Inject access/HMAC/canary secrets from the password manager into environment
variables without echoing them. Never put a secret or token in argv, shell
history, a JSON evidence file, or logs.

1. Set `DEPLOY_SHA` to the full current `origin/main` SHA and
   `SUPABASE_PROJECT_REF=hdcflshhomzildwqlmwh`. Set `FUNCTION_NAME` to exactly
   one protected target.
2. Capture `NOTIFICATION_MIGRATION_HISTORY_PATH` with the same read-only
   Management API query embedded in `.github/workflows/deploy-edge-function.yml`.
   Capture `NOTIFICATION_SECRETS_METADATA_PATH` with `supabase secrets list
   --output json` and `NOTIFICATION_FUNCTIONS_METADATA_PATH` with `supabase
   functions list --output json`. These files contain metadata/digests, never
   secret values; keep them mode 0600.
3. For `handle-lead`, set `NOTIFICATION_CANARY_PATH` to a new mode-0600 path and
   run `node scripts/run-owner-notification-deploy-canaries.mjs`. For a worker
   or webhook infrastructure receipt, place only `{}` in that path.
4. Inject `LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY` locally, choose a new
   non-existing mode-0600 output path, and run:

```bash
node scripts/verify-owner-notification-deploy-receipt.mjs --issue \
  "$NOTIFICATION_RECEIPT_OUTPUT"
```

The issuer consumes the captured live files and canary evidence from the named
environment paths, builds the phase payload itself, self-verifies it, and
writes the token only to the new mode-0600 file. It never prints the token. In
GitHub Actions, `.github/workflows/deploy-edge-function.yml` performs this
issuance automatically and masks the token before placing it in `GITHUB_ENV`.
Issue a new target-specific token for every manual/local dispatch because it
expires within one hour and any live secret/function metadata change invalidates
it. Rotate the HMAC key through the password manager and GitHub production
environment after suspected exposure, signer access changes, or
routine key rotation; every old token becomes invalid immediately. A worker/webhook
deployment changes live function metadata, so capture again and issue a fresh
`handler-ready` receipt before deploying `handle-lead`.

### Executable client-IP receipt path

After a non-public probe built from the exact `DEPLOY_SHA`, save one sanitized
mode-0600 JSON evidence file containing `probe_source_sha`,
`probe_bundle_sha256`, `probe_function` (`client-ip-probe`, positive version,
`ACTIVE_AT_CANARY`), `canary_checked_at`, the IPv4/IPv6/forged-header/key-shape
results, and proof that the probe function and probe secrets were deleted. It
must contain no raw address or secret. Both native network paths must report
`passed`; an unavailable, skipped, or failed IPv6 path never authorizes a
deployment. Set its path as
`CLIENT_IP_CANARY_EVIDENCE_PATH`, inject the GitHub-only
`CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY`, and run:

```bash
node scripts/verify-client-ip-deploy-receipt.mjs --issue \
  "$CLIENT_IP_RECEIPT_OUTPUT"
gh secret set CLIENT_IP_DEPLOY_RECEIPT_TOKEN \
  --env 'Production – frame-restoration-utah' < "$CLIENT_IP_RECEIPT_OUTPUT"
```

The issuer computes the current extractor digest itself, binds both source SHAs
to `DEPLOY_SHA`, validates the full canary/cleanup contract, self-verifies the
one-hour token, allowlists every nested evidence field so raw/debug extras cannot
enter the readable token, and never prints it. Store
`CLIENT_IP_DEPLOY_RECEIPT_TOKEN` and the distinct
`CLIENT_IP_DEPLOY_RECEIPT_HMAC_KEY` only in the GitHub production environment.
The protected deploy workflow only verifies that pre-issued token: it must not
deploy or delete a probe, expose the intake rate-limit secret to a probe, or
mint client-IP evidence on a shared CI runner.
Issue a new token for each protected SHA; rotate the HMAC key after exposure or
signer access changes and remove all local evidence/token files after secret
installation. `data/UTAH-SUPABASE-CLIENT-IP-HEADER-RECEIPT.md` remains an
INVALID historical record and is not read by the deploy verifier.

Required rollout order (do not reorder):

1. Keep the old handler live; capture pre-change function/schema receipts and
   the signed, final-extractor client-IP header-shape receipt.
2. Still with the old handler live, apply the reviewed migration set through
   the approved runner in filename order, including
   `20260807000100_lead_notification_outbox.sql`,
   `20260807000160_lead_intake_rate_limit.sql`, and
   `20260807000165_activate_lead_notification_outbox.sql`. The old handler does
   not set `submission_key`, so the activation trigger intentionally enqueues
   nothing for its inserts. The runner must record every applied filename in
   `supabase_migrations.schema_migrations`; retain and verify that receipt.
   **Do not run `supabase db push`** from a broad/dirty tree, paste selective SQL
   into the console, or use migration repair as a substitute for execution.
   The gated dashboard remediation lives at
   `supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql`
   and is not part of this migration batch.
3. Set `LEAD_INTAKE_RATE_LIMIT_SECRET` (distinct random 32–1024 byte value),
   `UTAH_LEAD_RESEND_API_KEY`, `UTAH_LEAD_RESEND_FROM`,
   `RESEND_WEBHOOK_SECRET`, and `LEAD_NOTIFICATION_WORKER_TOKEN`. Put the same
   worker token in the GitHub Actions secret; never print values. Keep
   `UTAH_LEAD_RESEND_SMS_FROM` absent while Utah SMS is paused. No generic or
   literal sender fallback is accepted.
4. In Resend, resolve the Utah owner sender and confirm its domain is
   verified and sending-enabled in the Utah account. Keep the auxiliary Verizon SMS
   sender unresolved and unconfigured while Utah SMS is paused; its absence
   must not block either owner-email lane. Do not infer sender verification from
   website DNS or a redirect. Also verify the primary and backup recipient
   secret names resolve to the intended inboxes without printing their values;
   one invalid recipient must not block the other lane.
5. Deploy `resend-webhook` and `lead-notification-worker`, then invoke the
   recovery workflow. Its JSON must report `healthy:true` with HTTP 200. A
   missing scoped key/owner sender stays red even when the queue is empty.
6. Run all local Deno/source/browser gates, then deploy `handle-lead` last.
7. Deploy the honeypot-bearing forms, submit one controlled test lead, and
   verify its persisted row, both outbox states, provider IDs, Landon's inbox
   receipt, backup inbox receipt, delivery webhooks, legacy notification
   projection, and a second healthy worker run.

### Migration execution and history receipt

Run this only after the reviewed pull request is merged. `RELEASE_SHA` must be
the full 40-character final merge commit on `origin/main`, never a branch-head,
preview, or dirty-worktree SHA. The approved mutating runner is the pinned
Supabase CLI 2.113.0 migration subsystem. The full repository checkout is
**forbidden** as the runner workdir: it contains 25 other migration versions
absent from live history. `--include-all` against that tree could apply them.

Instead, create a just-in-time isolated workdir from the immutable merged Git
object. This repository does not track `supabase/config.toml`; generate a
runner-only config inside the empty workdir with pinned CLI 2.113.0, then
archive only the eight reviewed migrations plus the immutable remote-history
guard template. Mechanically compare every migration basename and SHA-256
before linking. Do not substitute working-tree files, a copied directory, a
config-file archive assumption, or a broad glob.
CLI 2.112.0 is explicitly forbidden because its generated Management API
schema rejects valid offset timestamps during `link`; 2.113.0 contains the
upstream parser fix. Use the official 2.113.0 release for the entire runner,
not the bundled internal `supabase-go` compatibility binary.

Establish one exclusive Utah migration-writer window before the initial
linked migration list and keep it through the catalog postflight and final
migration list. No other operator, workflow, Supabase Studio action, CLI
process, or automation may apply, repair, revert, squash, or otherwise change
migration history or the public schema during that window. Stop if exclusivity
cannot be confirmed; the exact-prefix recovery path handles an earlier partial
run, but it is not a substitute for serializing live schema writers. After
securing the window, set `UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK` to the exact
`RELEASE_SHA` without printing it.

```bash
export RELEASE_SHA='<full-40-character-final-merged-main-commit>'
set -euo pipefail

test "${#RELEASE_SHA}" -eq 40
case "$RELEASE_SHA" in
  *[!0-9a-f]*) printf 'Hard stop: RELEASE_SHA must be a lowercase full SHA.\n' >&2; exit 1 ;;
esac
git fetch --quiet origin main
resolved_release_sha="$(git rev-parse --verify "${RELEASE_SHA}^{commit}")"
test "$resolved_release_sha" = "$RELEASE_SHA"
git merge-base --is-ancestor "$RELEASE_SHA" origin/main || {
  printf 'Hard stop: RELEASE_SHA is not merged into origin/main.\n' >&2
  exit 1
}

test -n "${SUPABASE_BIN:-}" || {
  printf 'Hard stop: set SUPABASE_BIN to the reviewed official CLI path.\n' >&2
  exit 1
}
test -x "$SUPABASE_BIN"
test "$(basename "$SUPABASE_BIN")" != 'supabase-go' || {
  printf 'Hard stop: the internal supabase-go compatibility binary is forbidden.\n' >&2
  exit 1
}
cli_version="$("$SUPABASE_BIN" --version | head -n 1)"
test "$cli_version" = '2.113.0' || {
  printf 'Hard stop: Supabase CLI 2.113.0 is required; found %s.\n' "$cli_version" >&2
  exit 1
}
test "$(uname -s)" = 'Darwin' && test "$(uname -m)" = 'arm64' || {
  printf 'Hard stop: this reviewed binary receipt is for macOS arm64 only.\n' >&2
  exit 1
}
expected_supabase_bin_sha256='ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a'
test "$(shasum -a 256 "$SUPABASE_BIN" | awk '{print $1}')" = \
  "$expected_supabase_bin_sha256" || {
  printf 'Hard stop: Supabase CLI binary digest differs from the reviewed official release.\n' >&2
  exit 1
}
test -n "${SUPABASE_ACCESS_TOKEN:-}" || {
  printf 'Hard stop: inject the Supabase access token from approved secret storage.\n' >&2
  exit 1
}
test "${UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK:-}" = "$RELEASE_SHA" || {
  printf 'Hard stop: secure the exclusive migration-writer window and bind its acknowledgement to RELEASE_SHA.\n' >&2
  exit 1
}
export SUPABASE_NO_KEYRING=1

UTAH_MIGRATION_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-release-migrations.XXXXXX")"
test -d "$UTAH_MIGRATION_WORKDIR"
"$SUPABASE_BIN" init --workdir "$UTAH_MIGRATION_WORKDIR"
test -f "$UTAH_MIGRATION_WORKDIR/supabase/config.toml"
git archive --format=tar "$RELEASE_SHA" -- \
  supabase/migrations/20260807000090_emergency_dashboard_secret_containment.sql \
  supabase/migrations/20260807000100_lead_notification_outbox.sql \
  supabase/migrations/20260807000125_add_ul_request_spam_status.sql \
  supabase/migrations/20260807000140_atomic_dashboard_auth_throttle.sql \
  supabase/migrations/20260807000150_dashboard_session_credentials.sql \
  supabase/migrations/20260807000160_lead_intake_rate_limit.sql \
  supabase/migrations/20260807000165_activate_lead_notification_outbox.sql \
  supabase/migrations/20260807000170_report_test_markers.sql \
  supabase/migration-baselines/remote-applied-history-guard.sql \
  | tar -xf - -C "$UTAH_MIGRATION_WORKDIR"

expected_manifest="$(cat <<'MANIFEST'
c5b2d6839fff7a58c2479ca227d705d06bd3c0005cde1b64301798de2c8e82cf  supabase/migrations/20260807000090_emergency_dashboard_secret_containment.sql
23de8f91fcc1e123261580f27cc57d4822737bb7d206d1745088f23dc9787a69  supabase/migrations/20260807000100_lead_notification_outbox.sql
f1deab2f83d4fc961b19a615f2b7c1d893dc487680e065f22f963688d5194774  supabase/migrations/20260807000125_add_ul_request_spam_status.sql
1045a6444faa50f57bba0628f2d7091ee53ebdfa69d40183054b14d93d565c61  supabase/migrations/20260807000140_atomic_dashboard_auth_throttle.sql
d022f9066adedd7e7714e448f8e1ed3c9a082f82961e94222d018356a72fc43a  supabase/migrations/20260807000150_dashboard_session_credentials.sql
99d6907507dbfce9fe328a0d93276debdb34fe585cd9c194d24c5c230c8450df  supabase/migrations/20260807000160_lead_intake_rate_limit.sql
4d320eda3252121085470e395bb672612908cfd73e52f7d82c8a81f5a01477c1  supabase/migrations/20260807000165_activate_lead_notification_outbox.sql
509eed1c02d8b697c679c811d20bb85eaa261be5e2af34eb663bef2f8e73ca6e  supabase/migrations/20260807000170_report_test_markers.sql
MANIFEST
)"
actual_manifest="$(
  cd "$UTAH_MIGRATION_WORKDIR"
  find supabase/migrations -type f -print | LC_ALL=C sort |
    while IFS= read -r migration_file; do
      shasum -a 256 "$migration_file"
    done
)"
test "$actual_manifest" = "$expected_manifest" || {
  printf 'Hard stop: release migration basenames or hashes differ from the reviewed eight.\n%s\n' \
    "$actual_manifest" >&2
  exit 1
}
expected_guard_template_sha256='d770275383205c9012ad693400724e529e6dae90619d658a35b762dda8015752'
actual_guard_template_sha256="$(
  shasum -a 256 \
    "$UTAH_MIGRATION_WORKDIR/supabase/migration-baselines/remote-applied-history-guard.sql" |
    awk '{print $1}'
)"
test "$actual_guard_template_sha256" = "$expected_guard_template_sha256" || {
  printf 'Hard stop: remote-history guard template digest differs from reviewed main.\n' >&2
  exit 1
}
printf 'release_sha=%s\n%s\nworkdir=%s\n' \
  "$RELEASE_SHA" "$actual_manifest" "$UTAH_MIGRATION_WORKDIR"
cd "$UTAH_MIGRATION_WORKDIR"
```

The link is created only now, inside that isolated release archive. Retain the
release SHA, manifest, and before-list in the change receipt. The only permitted
`db query --linked` statements are the exact catalog-only `SELECT` preflight and
postflight below. Management API/raw SQL execution, SQL Editor execution,
`db push`, and migration repair are not substitutes for the migration runner.

```bash
test ! -e supabase/.temp/project-ref
"$SUPABASE_BIN" link --project-ref hdcflshhomzildwqlmwh --yes
test "$(cat supabase/.temp/project-ref)" = 'hdcflshhomzildwqlmwh'
test -s supabase/.temp/pooler-url
node <<'NODE'
const fs = require("node:fs");
const url = new URL(fs.readFileSync("supabase/.temp/pooler-url", "utf8").trim());
if (url.protocol !== "postgresql:" || url.password !== "") process.exit(1);
if (!decodeURIComponent(url.username).endsWith(".hdcflshhomzildwqlmwh")) process.exit(1);
NODE
"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  | tee migration-list.before.json

expected_remote_versions="$(cat <<'VERSIONS'
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
20260807000095
VERSIONS
)"
expected_target_versions="$(cat <<'VERSIONS'
20260807000090
20260807000100
20260807000125
20260807000140
20260807000150
20260807000160
20260807000165
20260807000170
VERSIONS
)"
expected_remote_versions_sha256='dbb75c1ba1d5ce73fffa167e68781afb0e379fa2c2e2ffe3b0a4d3dac0e4b43c'
expected_remote_versions_json="$(
  printf '%s\n' "$expected_remote_versions" |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"
expected_target_versions_json="$(
  printf '%s\n' "$expected_target_versions" |
    jq -Rsc 'split("\n") | map(select(length > 0))'
)"
test "$(printf '%s\n' "$expected_remote_versions" | shasum -a 256 | awk '{print $1}')" = \
  "$expected_remote_versions_sha256" || {
  printf 'Hard stop: reviewed remote-history baseline digest differs.\n' >&2
  exit 1
}
test -z "$(
  comm -12 \
    <(printf '%s\n' "$expected_remote_versions" | LC_ALL=C sort) \
    <(printf '%s\n' "$expected_target_versions" | LC_ALL=C sort)
)" || {
  printf 'Hard stop: remote-history guards overlap executable target versions.\n' >&2
  exit 1
}

actual_remote_versions_json="$(
  jq -c '[.migrations[] | select(.remote != "") | .remote] | unique | sort' \
    migration-list.before.json
)"
actual_applied_target_versions_json="$(
  jq -c --argjson targets "$expected_target_versions_json" '
    [.migrations[] | select(.remote != "") | .remote as $version
      | select($targets | index($version)) | $version] | unique | sort
  ' migration-list.before.json
)"
applied_target_count="$(jq -er 'length' <<<"$actual_applied_target_versions_json")"
test "$applied_target_count" -ge 0 && test "$applied_target_count" -le 8
expected_applied_target_versions_json="$(
  jq -c --argjson count "$applied_target_count" '.[0:$count]' \
    <<<"$expected_target_versions_json"
)"
test "$actual_applied_target_versions_json" = "$expected_applied_target_versions_json" || {
  printf 'Hard stop: target history is not an exact ordered prefix of the reviewed eight.\n' >&2
  exit 1
}
expected_pending_target_versions_json="$(
  jq -c --argjson count "$applied_target_count" '.[$count:]' \
    <<<"$expected_target_versions_json"
)"
pending_target_count="$(jq -er 'length' <<<"$expected_pending_target_versions_json")"
actual_pending_target_versions_json="$(
  jq -c '[.migrations[] | select(.local != "" and .remote == "") | .local] | unique | sort' \
    migration-list.before.json
)"
test "$actual_pending_target_versions_json" = "$expected_pending_target_versions_json" || {
  printf 'Hard stop: local-only target history is not the exact pending suffix.\n' >&2
  exit 1
}
expected_current_remote_versions_json="$(
  jq -cn \
    --argjson baseline "$expected_remote_versions_json" \
    --argjson applied "$expected_applied_target_versions_json" \
    '$baseline + $applied | sort'
)"
test "$actual_remote_versions_json" = "$expected_current_remote_versions_json" || {
  printf 'Hard stop: non-target remote history differs from the reviewed 24-version baseline.\n' >&2
  exit 1
}
jq -e \
  --argjson baseline "$expected_remote_versions_json" \
  --argjson applied "$expected_applied_target_versions_json" \
  --argjson pending "$expected_pending_target_versions_json" '
  .migrations as $m
  | ([$m[] | select(.local == "" and .remote != "") | .remote] | sort) == $baseline
    and ([$m[] | select(.local != "" and .remote == "") | .local] | sort) == $pending
    and ([$m[] | select(.local != "" and .remote != "") | .local] | sort) == $applied
    and all($m[]; (.local == "" or .remote == "" or .local == .remote))
    and (($m | length) == 32)
' migration-list.before.json >/dev/null || {
  printf 'Hard stop: initial migration reconciliation is not baseline plus exact target prefix/suffix.\n' >&2
  exit 1
}

run_catalog_preflight() {
  "$SUPABASE_BIN" --agent no -o json db query --linked <<'SQL'
with s as (
  select
    (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations) as all_history_versions,
    (select coalesce(jsonb_agg(version order by version),'[]'::jsonb) from supabase_migrations.schema_migrations where version=any(array['20260807000090','20260807000100','20260807000125','20260807000140','20260807000150','20260807000160','20260807000165','20260807000170'])) as target_history_versions,
    (select count(*)=1 from supabase_migrations.schema_migrations where version='20260807000095') as containment_00095_recorded,
    ((select relrowsecurity from pg_class where oid='public.app_config'::regclass)
      and (select relrowsecurity from pg_class where oid='public.report_access'::regclass)
      and not has_table_privilege('anon','public.app_config','select,insert,update,delete')
      and not has_table_privilege('authenticated','public.app_config','select,insert,update,delete')
      and not has_table_privilege('anon','public.report_access','select,insert,update,delete')
      and not has_table_privilege('authenticated','public.report_access','select,insert,update,delete')
      and has_table_privilege('service_role','public.app_config','select,insert,update,delete')
      and has_table_privilege('service_role','public.report_access','select,insert,update,delete')
      and not exists(select 1 from pg_policies where schemaname='public' and tablename in ('app_config','report_access'))) as phase_00090_schema_ahead_exact,
    (to_regclass('public.lead_notifications') is null and to_regclass('public.lead_notification_events') is null
      and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='submission_key')
      and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_lead_notification','complete_lead_notification_claim','exhaust_lead_notification_claims','resend_notification_status_rank','reconcile_resend_notification_events','apply_resend_notification_event'))
      and not exists(select 1 from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and c.relname in ('leads_submission_key_uidx','lead_notifications_retry_idx','lead_notifications_provider_id_idx','lead_notifications_unacknowledged_health_idx','lead_notifications_idempotency_key_uidx','lead_notifications_route_uidx'))) as phase_00100_pristine,
    (to_regclass('public.lead_notifications') is not null and to_regclass('public.lead_notification_events') is not null
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_notifications')),false) and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_notification_events')),false)
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='submission_key')
      and (select count(*)=6 from pg_constraint where conname in ('lead_notifications_pkey','lead_notifications_lead_id_fkey','lead_notifications_values_check','lead_notifications_delivery_contract_check','lead_notification_events_pkey','lead_notification_events_values_check') and conrelid in (to_regclass('public.lead_notifications'),to_regclass('public.lead_notification_events')))
      and (select count(distinct p.proname)=6 and count(*)=6 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_lead_notification','complete_lead_notification_claim','exhaust_lead_notification_claims','resend_notification_status_rank','reconcile_resend_notification_events','apply_resend_notification_event'))
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='leads' and indexname='leads_submission_key_uidx' and lower(indexdef) like 'create unique index%' and lower(indexdef) like '%(submission_key)%' and lower(indexdef) like '%where (submission_key is not null)%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_notifications' and indexname='lead_notifications_retry_idx' and lower(indexdef) like '%(next_attempt_at, created_at)%' and lower(indexdef) like '%status = any%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_notifications' and indexname='lead_notifications_provider_id_idx' and lower(indexdef) like '%(provider_message_id)%' and lower(indexdef) like '%where (provider_message_id is not null)%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_notifications' and indexname='lead_notifications_unacknowledged_health_idx' and lower(indexdef) like '%(status, retryable, updated_at)%' and lower(indexdef) like '%where (health_acknowledged_at is null)%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_notifications' and indexname='lead_notifications_idempotency_key_uidx' and lower(indexdef) like 'create unique index%' and lower(indexdef) like '%(idempotency_key)%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_notifications' and indexname='lead_notifications_route_uidx' and lower(indexdef) like 'create unique index%' and lower(indexdef) like '%(lead_id, recipient_role, channel)%')) as phase_00100_present,
    exists(select 1 from pg_constraint c where c.conrelid='public.leads'::regclass and c.conname='leads_status_check' and lower(pg_get_constraintdef(c.oid)) not like '%ul_request%' and lower(pg_get_constraintdef(c.oid)) not like '%spam%') as phase_00125_pristine,
    exists(select 1 from pg_constraint c where c.conrelid='public.leads'::regclass and c.conname='leads_status_check' and lower(pg_get_constraintdef(c.oid)) like '%ul_request%' and lower(pg_get_constraintdef(c.oid)) like '%spam%') as phase_00125_present,
    (to_regclass('public.auth_attempts') is not null
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.auth_attempts')),false)
      and (select count(*)=3 from information_schema.columns where table_schema='public' and table_name='auth_attempts' and column_name in ('ip','fail_count','window_start'))
      and exists(select 1 from pg_constraint where conrelid='public.auth_attempts'::regclass and contype='p' and lower(pg_get_constraintdef(oid)) like 'primary key (ip)%')
      and to_regclass('public.auth_attempts_window_start_idx') is null
      and to_regprocedure('public.reserve_dashboard_login_attempt(text)') is null) as phase_00140_pristine,
    (to_regclass('public.auth_attempts') is not null
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.auth_attempts')),false)
      and (select count(*)=3 from information_schema.columns where table_schema='public' and table_name='auth_attempts' and column_name in ('ip','fail_count','window_start'))
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='auth_attempts' and indexname='auth_attempts_window_start_idx' and lower(indexdef) like '%(window_start)%')
      and to_regprocedure('public.reserve_dashboard_login_attempt(text)') is not null) as phase_00140_present,
    (to_regclass('public.report_access') is not null
      and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_access' and column_name in ('pin_hash','session_version'))
      and to_regclass('public.report_access_pin_hash_key') is null
      and not exists(select 1 from pg_constraint where conrelid='public.report_access'::regclass and conname in ('report_access_credential_present_check','report_access_pin_hash_format_check','report_access_session_version_check'))
      and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('authenticate_dashboard_access','create_dashboard_access','reset_dashboard_access_credential','migrate_dashboard_access_credential','set_dashboard_access_active'))) as phase_00150_pristine,
    ((select count(*)=2 from information_schema.columns where table_schema='public' and table_name='report_access' and column_name in ('pin_hash','session_version'))
      and exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_access' and column_name='pin' and is_nullable='YES')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='report_access' and indexname='report_access_pin_hash_key' and lower(indexdef) like 'create unique index%' and lower(indexdef) like '%(pin_hash)%' and lower(indexdef) like '%where (pin_hash is not null)%')
      and exists(select 1 from pg_constraint where conrelid='public.report_access'::regclass and conname='report_access_credential_present_check' and lower(pg_get_constraintdef(oid)) like '%pin_hash is not null%' and lower(pg_get_constraintdef(oid)) like '%pin is not null%')
      and exists(select 1 from pg_constraint where conrelid='public.report_access'::regclass and conname='report_access_pin_hash_format_check' and lower(pg_get_constraintdef(oid)) like '%pin_hash is null%' and pg_get_constraintdef(oid) like '%^[0-9a-f]{64}$%')
      and exists(select 1 from pg_constraint where conrelid='public.report_access'::regclass and conname='report_access_session_version_check' and lower(pg_get_constraintdef(oid)) like '%session_version >= 1%' and lower(pg_get_constraintdef(oid)) like '%session_version <= 2147483647%')
      and (select count(distinct p.proname)=5 and count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('authenticate_dashboard_access','create_dashboard_access','reset_dashboard_access_credential','migrate_dashboard_access_credential','set_dashboard_access_active'))) as phase_00150_present,
    (to_regclass('public.lead_intake_rate_limits') is null
      and to_regclass('public.lead_intake_rate_limits_window_start_idx') is null
      and to_regprocedure('public.reserve_lead_intake_attempt(text)') is null) as phase_00160_pristine,
    (to_regclass('public.lead_intake_rate_limits') is not null
      and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_intake_rate_limits')),false)
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='lead_intake_rate_limits' and indexname='lead_intake_rate_limits_window_start_idx' and lower(indexdef) like '%(window_start)%')
      and to_regprocedure('public.reserve_lead_intake_attempt(text)') is not null) as phase_00160_present,
    (to_regprocedure('public.enqueue_lead_notifications()') is null and not exists(select 1 from pg_trigger where tgname='leads_enqueue_notifications' and not tgisinternal)) as phase_00165_pristine,
    (to_regprocedure('public.enqueue_lead_notifications()') is not null and exists(select 1 from pg_trigger where tgrelid='public.leads'::regclass and tgname='leads_enqueue_notifications' and not tgisinternal and tgenabled in ('O','A'))) as phase_00165_present,
    (not exists(select 1 from information_schema.columns where table_schema='public' and ((table_name='leads' and column_name='is_test') or (table_name='call_logs' and column_name='is_test')))
      and to_regclass('public.leads_is_test_created_at_idx') is null
      and to_regclass('public.call_logs_is_test_created_at_idx') is null) as phase_00170_pristine,
    ((select count(*)=2 from information_schema.columns where table_schema='public' and ((table_name='leads' and column_name='is_test') or (table_name='call_logs' and column_name='is_test')) and data_type='boolean' and is_nullable='NO' and column_default='false')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='leads' and indexname='leads_is_test_created_at_idx' and lower(indexdef) like '%(is_test, created_at desc)%')
      and exists(select 1 from pg_indexes where schemaname='public' and tablename='call_logs' and indexname='call_logs_is_test_created_at_idx' and lower(indexdef) like '%(is_test, created_at desc)%')) as phase_00170_present
)
select * from s;
SQL
}
evaluate_catalog_preflight() {
  jq -c \
    --argjson expected_baseline "$expected_remote_versions_json" \
    --argjson expected_history "$expected_applied_target_versions_json" \
    --argjson applied_count "$applied_target_count" '
    if type != "array" or length != 1 then error("unexpected catalog row shape")
    else
      .[0] as $state
      | [
          {pristine:$state.phase_00100_pristine,present:$state.phase_00100_present},
          {pristine:$state.phase_00125_pristine,present:$state.phase_00125_present},
          {pristine:$state.phase_00140_pristine,present:$state.phase_00140_present},
          {pristine:$state.phase_00150_pristine,present:$state.phase_00150_present},
          {pristine:$state.phase_00160_pristine,present:$state.phase_00160_present},
          {pristine:$state.phase_00165_pristine,present:$state.phase_00165_present},
          {pristine:$state.phase_00170_pristine,present:$state.phase_00170_present}
        ] as $phases
      | (
          $state.all_history_versions == (($expected_baseline + $expected_history) | sort)
          and $state.target_history_versions == $expected_history
          and $state.containment_00095_recorded == true
          and $state.phase_00090_schema_ahead_exact == true
          and all(range(0; ($phases | length)); . as $index
            | if ($index + 1) < $applied_count
              then $phases[$index].present == true
              else $phases[$index].pristine == true
              end)
        ) as $ok
      | [$state + {preflight_ok:$ok}]
    end
  '
}
preflight_json="$(run_catalog_preflight | evaluate_catalog_preflight)"
printf '%s\n' "$preflight_json" | tee catalog-preflight.json
jq -e 'type == "array" and length == 1 and .[0].preflight_ok == true' \
  <<<"$preflight_json" >/dev/null || {
  printf 'Hard stop: catalog preflight did not return preflight_ok=true.\n' >&2
  exit 1
}
```

The preflight must return `preflight_ok: true`. Direct catalog history—not only
the CLI's formatted list—must equal the exact 24-version baseline plus one of
the nine exact ordered prefixes of the reviewed eight. This direct equality is
required because the CLI formatter can omit history versions it cannot parse.
Containment `00095` must remain recorded and the already-contained `00090`
schema must remain exact. Every phase in the recorded prefix must match its
exact present contract; every phase in the pending suffix must remain pristine.
Any false, null, extra row, non-prefix history, query error, or unexpected
object is a hard stop. This makes an ambiguous or failed prior run resumable
without history repair or raw SQL.

Only after that pass, reconcile the CLI's local view of the exact 24-version
baseline plus any exact applied target prefix. CLI 2.113.0 rejects a remote
version missing locally before it considers `--include-all`. Move reviewed SQL
for the already-applied target prefix outside the active migrations directory,
then copy the immutable poison-pill guard template to one runner-local filename
for every baseline and applied-prefix version. Matching rows are skipped. If
any row disappears or the CLI ever selects a guard, its `RAISE EXCEPTION`
aborts instead of replaying SQL or creating a history-only success. These
guards exist only inside the disposable runner.

Then require the effective list to contain the exact baseline plus target
prefix as matches, zero remote-only versions, and only the reviewed pending
suffix as local-only. Re-check the prefix-specific 32-file manifest immediately
before invoking the migration subsystem. `--include-all` is required because
the reviewed targets precede entries already in remote history.

```bash
guard_template='supabase/migration-baselines/remote-applied-history-guard.sql'
test "$(shasum -a 256 "$guard_template" | awk '{print $1}')" = \
  "$expected_guard_template_sha256"

# Real SQL for an already-applied target prefix must not remain active. If a
# history row disappears in the final race window, its poison guard must abort
# instead of replaying the migration. The reviewed bytes were already verified
# above; retain moved prefix sources outside the active migrations directory.
mkdir -p supabase/reviewed-targets
while IFS= read -r applied_version; do
  test -n "$applied_version"
  applied_source="$(
    find supabase/migrations -mindepth 1 -maxdepth 1 -type f \
      -name "${applied_version}_*.sql" -print
  )"
  test -n "$applied_source" && test "$(printf '%s\n' "$applied_source" | wc -l | tr -d '[:space:]')" = '1' || {
    printf 'Hard stop: applied target prefix does not map to one reviewed source file.\n' >&2
    exit 1
  }
  mv "$applied_source" "supabase/reviewed-targets/${applied_source##*/}"
done < <(jq -r '.[]' <<<"$expected_applied_target_versions_json")

expected_guard_versions="$(
  jq -nr \
    --argjson baseline "$expected_remote_versions_json" \
    --argjson applied "$expected_applied_target_versions_json" \
    '$baseline + $applied | .[]'
)"
while IFS= read -r remote_version; do
  case "$remote_version" in
    ''|*[!0-9]*) printf 'Hard stop: invalid remote history version.\n' >&2; exit 1 ;;
  esac
  guard_path="supabase/migrations/${remote_version}_remote_applied_history_guard.sql"
  test ! -e "$guard_path"
  cp "$guard_template" "$guard_path"
  cmp -s "$guard_template" "$guard_path"
done <<<"$expected_guard_versions"

expected_guard_manifest="$(
  while IFS= read -r remote_version; do
    printf '%s  supabase/migrations/%s_remote_applied_history_guard.sql\n' \
      "$expected_guard_template_sha256" "$remote_version"
  done <<<"$expected_guard_versions"
)"
expected_pending_manifest="$(
  printf '%s\n' "$expected_manifest" |
    awk -v skip="$applied_target_count" 'NR > skip'
)"
expected_full_manifest="$(
  {
    printf '%s\n' "$expected_guard_manifest"
    test -z "$expected_pending_manifest" || printf '%s\n' "$expected_pending_manifest"
  } | LC_ALL=C sort -k2,2
)"
case "$applied_target_count" in
  0) expected_full_manifest_sha256='1a7c360f4447cb629a8741f28aef2df0053a119cdc9d798c477b912acaca9dc1' ;;
  1) expected_full_manifest_sha256='24cf2fbb23a414180357e933dd970d582e242d1492d65675670dd3208e9cec4e' ;;
  2) expected_full_manifest_sha256='bf2b620cafe1a1e9203b6721f73730f605fd090b5e61fe6a5630c11c4492dee4' ;;
  3) expected_full_manifest_sha256='e9138fd5a86b2c94d7265da57b4a31926f4c7fcc6ccdefd434f3f18623aa0c33' ;;
  4) expected_full_manifest_sha256='151a284ba758caece899cc8a75623ee62e20c6eeda76c1101c924392fb8c4170' ;;
  5) expected_full_manifest_sha256='f020b7bf92767beae1c472de84dd21235efbd488d1755876c2140db5335dd7dc' ;;
  6) expected_full_manifest_sha256='2b0868d16152d16d3314748697614479718889d21f8bd236aa475dd3478e754d' ;;
  7) expected_full_manifest_sha256='f07d4c202a94353b43392675f3a93c33d35671459952eef76ec31986e27fb918' ;;
  8) expected_full_manifest_sha256='2efa9d33b97460b53983fbba1538c539de4dd4af69e51a1113b0ca7ce5d16677' ;;
  *) printf 'Hard stop: impossible applied target prefix count.\n' >&2; exit 1 ;;
esac
test "$(printf '%s\n' "$expected_full_manifest" | shasum -a 256 | awk '{print $1}')" = \
  "$expected_full_manifest_sha256"

verify_runner_file_shape() {
  test -z "$(
    find supabase/migrations -mindepth 1 ! -type f -print -quit
  )" || {
    printf 'Hard stop: migration runner contains a symlink, directory, or special entry.\n' >&2
    return 1
  }
  migration_file_count="$(
    find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' |
      wc -l | tr -d '[:space:]'
  )"
  test "$migration_file_count" = '32' || {
    printf 'Hard stop: migration runner must contain exactly 32 regular SQL files.\n' >&2
    return 1
  }
  parsed_versions="$(
    find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' -print |
      LC_ALL=C sort |
      while IFS= read -r migration_file; do
        filename="${migration_file##*/}"
        version="${filename%%_*}"
        case "$filename:$version" in
          [0-9]*_*.sql:[0-9]*) ;;
          *) printf 'Hard stop: invalid migration filename: %s\n' "$filename" >&2; exit 1 ;;
        esac
        case "$version" in
          *[!0-9]*) printf 'Hard stop: invalid migration version: %s\n' "$version" >&2; exit 1 ;;
        esac
        printf '%s\n' "$version"
      done
  )"
  test "$(printf '%s\n' "$parsed_versions" | wc -l | tr -d '[:space:]')" = '32'
  test "$(printf '%s\n' "$parsed_versions" | LC_ALL=C sort -u | wc -l | tr -d '[:space:]')" = '32' || {
    printf 'Hard stop: duplicate migration versions are forbidden.\n' >&2
    return 1
  }
  actual_full_manifest="$(
    find supabase/migrations -mindepth 1 -maxdepth 1 -type f -name '*.sql' -print |
      LC_ALL=C sort |
      while IFS= read -r migration_file; do
        shasum -a 256 "$migration_file"
      done
  )"
  test "$actual_full_manifest" = "$expected_full_manifest" || {
    printf 'Hard stop: exact 32-file migration manifest differs from reviewed main.\n' >&2
    return 1
  }
  test "$(printf '%s\n' "$actual_full_manifest" | shasum -a 256 | awk '{print $1}')" = \
    "$expected_full_manifest_sha256" || {
    printf 'Hard stop: exact 32-file migration manifest digest differs.\n' >&2
    return 1
  }
}
verify_runner_file_shape

"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  | tee migration-list.effective-before.json
effective_remote_versions_json="$(
  jq -c '[.migrations[] | select(.remote != "") | .remote] | unique | sort' \
    migration-list.effective-before.json
)"
effective_pending_versions_json="$(
  jq -c '[.migrations[] | select(.local != "" and .remote == "") | .local] | unique | sort' \
    migration-list.effective-before.json
)"
test "$effective_remote_versions_json" = "$expected_current_remote_versions_json"
test "$effective_pending_versions_json" = "$expected_pending_target_versions_json"
jq -e \
  --argjson matched "$expected_current_remote_versions_json" \
  --argjson pending "$expected_pending_target_versions_json" '
  .migrations as $m
  | (($m | length) == 32)
    and ([ $m[] | select(.local == "" and .remote != "") ] | length) == 0
    and ([$m[] | select(.local != "" and .remote == "") | .local] | sort) == $pending
    and ([$m[] | select(.local != "" and .remote != "" and .local == .remote) | .local] | sort) == $matched
    and all($m[]; (.local == "" or .remote == "" or .local == .remote))
' migration-list.effective-before.json >/dev/null || {
  printf 'Hard stop: guarded migration reconciliation is not exact matched prefix plus pending suffix.\n' >&2
  exit 1
}

final_preflight_json="$(run_catalog_preflight | evaluate_catalog_preflight)"
printf '%s\n' "$final_preflight_json" | tee catalog-preflight.final.json
jq -e 'type == "array" and length == 1 and .[0].preflight_ok == true' \
  <<<"$final_preflight_json" >/dev/null || {
  printf 'Hard stop: final catalog preflight did not return preflight_ok=true.\n' >&2
  exit 1
}
verify_runner_file_shape

expected_target_basenames="$(cat <<'BASENAMES'
20260807000090_emergency_dashboard_secret_containment.sql
20260807000100_lead_notification_outbox.sql
20260807000125_add_ul_request_spam_status.sql
20260807000140_atomic_dashboard_auth_throttle.sql
20260807000150_dashboard_session_credentials.sql
20260807000160_lead_intake_rate_limit.sql
20260807000165_activate_lead_notification_outbox.sql
20260807000170_report_test_markers.sql
BASENAMES
)"
expected_pending_target_basenames="$(
  printf '%s\n' "$expected_target_basenames" |
    awk -v skip="$applied_target_count" 'NR > skip'
)"
if test "$pending_target_count" = '0'; then
  printf 'migration_up_skipped=exact_target_history_already_complete\n' \
    | tee migration-up.skipped.txt
else
  migration_exit=0
  "$SUPABASE_BIN" --agent no --output-format json \
    migration up --linked --include-all --yes \
    >migration-up.stdout.json 2>migration-up.stderr.txt || migration_exit=$?
  test "$migration_exit" = '0' || {
    printf 'Hard stop: migration up failed; retain both output receipts and do not repair history.\n' >&2
    exit "$migration_exit"
  }
  jq -e --argjson expected_count "$pending_target_count" '
    type == "object"
    and .message == "Migrations applied"
    and (.applied | type == "array" and length == $expected_count)
  ' migration-up.stdout.json >/dev/null || {
    printf 'Hard stop: migration up did not return the exact structured success shape.\n' >&2
    exit 1
  }
  json_applied_basenames="$(
    jq -er '.applied | map(split("/")[-1]) | .[]' migration-up.stdout.json
  )"
  test "$json_applied_basenames" = "$expected_pending_target_basenames" || {
    printf 'Hard stop: structured migration receipt differs from the reviewed pending suffix.\n' >&2
    exit 1
  }
  stderr_applied_basenames="$(
    sed -n 's/^Applying migration \([^[:space:]]*\)\.\.\.$/\1/p' \
      migration-up.stderr.txt
  )"
  test "$stderr_applied_basenames" = "$expected_pending_target_basenames" || {
    printf 'Hard stop: stderr migration receipt differs from the reviewed pending suffix.\n' >&2
    exit 1
  }
  if grep -Fq 'remote_applied_history_guard.sql' \
    migration-up.stdout.json migration-up.stderr.txt; then
    printf 'Hard stop: a remote-history guard was selected.\n' >&2
    exit 1
  fi
fi
```

If migration execution stops or returns non-zero, stop the rollout. Do not use
`migration repair`, Management API SQL, `db query`, SQL Editor, or pasted SQL to
finish or mark the batch. Diagnose the failed migration and resume only through
the same reviewed CLI migration runner.

Run the exact catalog-only postflight next and require `postflight_ok: true`.
Then retain the final migration list. A source deploy or history-only match is
not a substitute for the schema-contract checks.

```bash
postflight_json="$(
  (
    expected_applied_target_versions_json="$expected_target_versions_json"
    applied_target_count=8
    run_catalog_preflight | evaluate_catalog_preflight |
      jq -c 'map(. + {postflight_ok:.preflight_ok} | del(.preflight_ok))'
  )
)"
printf '%s\n' "$postflight_json" | tee catalog-postflight.json
jq -e 'type == "array" and length == 1 and .[0].postflight_ok == true' \
  <<<"$postflight_json" >/dev/null || {
  printf 'Hard stop: catalog postflight did not return postflight_ok=true.\n' >&2
  exit 1
}
"$SUPABASE_BIN" --agent no --output-format json migration list --linked \
  | tee migration-list.after.json
expected_final_versions="$(
  printf '%s\n%s\n' "$expected_remote_versions" "$expected_target_versions" |
    LC_ALL=C sort
)"
actual_final_versions="$(
  jq -er '.migrations | map(select(.remote != "") | .remote) | unique | sort | .[]' \
    migration-list.after.json
)"
test "$actual_final_versions" = "$expected_final_versions"
jq -e '
  (.migrations | length) == 32
  and ([.migrations[] | select(.local == "" or .remote == "" or .local != .remote)] | length) == 0
' migration-list.after.json >/dev/null || {
  printf 'Hard stop: final migration history is not the exact 32-version matched set.\n' >&2
  exit 1
}
```

Copy the release and guard-template manifests, prefix-specific 32-file manifest,
all three migration lists, both migration output streams (or the explicit
already-complete skip receipt), both preflight receipts, and the postflight
receipt into the approved change record before removing the isolated workdir.
The receipts contain catalog metadata only; review them before storage.
Release the exclusive migration-writer window only after those receipts are
retained, then unset `UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK`.

### Resend webhook registration receipt

In the Utah Resend account, register exactly this endpoint:

`https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/resend-webhook`

Subscribe it to `email.sent`, `email.delivered`,
`email.delivery_delayed`, `email.bounced`, `email.complained`, `email.failed`,
and `email.suppressed`. Store that endpoint's signing secret as the Edge secret
`RESEND_WEBHOOK_SECRET`; do not reuse or print it.

Before accepting a rollout receipt, prove all of the following with one
controlled tagged owner notification:

1. Resend's webhook delivery log shows HTTP 200 from the exact endpoint.
2. The matching `svix-id` is present once in `lead_notification_events`, with
   `applied_at` populated after targeted or scheduled reconciliation.
3. The matching owner outbox row reaches `delivered`; a later `email.sent`
   replay cannot downgrade it.
4. A signed untagged shared-account event (for example, the auxiliary Verizon
   mail path) receives HTTP 200 `state:"ignored"` and creates no event row.
5. The next worker run reports HTTP 200 and `healthy:true`.

Endpoint registration, the event subscription set, secret binding, provider
HTTP receipt, database evidence, and worker receipt are all required. A source
deploy or a successful test webhook alone is not a delivery receipt.

### Durable notification alarm acknowledgement

Acknowledgement is not remediation. First inspect the exact job, correct the
sender/recipient/provider problem, and retain a provider or inbox receipt. If a
terminal or stale state is intentionally accepted, acknowledge only that job by
UUID—never bulk-acknowledge the queue:

```sql
select id, lead_id, recipient_role, status, retryable, attempts,
       last_error_code, provider_message_id, accepted_at, delivered_at,
       last_event_at, next_attempt_at, health_acknowledged_at
from public.lead_notifications
where id = '<reviewed-job-uuid>';

update public.lead_notifications
set health_acknowledged_at = clock_timestamp()
where id = '<reviewed-job-uuid>'
  and health_acknowledged_at is null
  and status in ('failed', 'delayed', 'bounced', 'complained', 'accepted');
```

A later send completion or newer provider event clears the acknowledgement and
starts a new health epoch. Re-run the worker and retain its HTTP/JSON receipt.

## Classifier behavior retained from v7

Lead-intake LLM classifier. Every form submission now gets a `tier`:

| Tier | What it means | What changes |
|---|---|---|
| `emergency` | Active leak, water inside, structural risk | 🚨 SMS to Landon, `[EMERGENCY]` email subject, customer auto-text says "calling within 15 min" |
| `urgent` | Recent storm/hail damage, insurance with timeline pressure | 🔥 SMS, `[URGENT]` email, customer auto-text says "calling within the hour" |
| `scheduled` | Quote request, planning a project | Standard notification (current v6 behavior) |
| `general` | Vague info question, browsing | `[INFO]` email, customer auto-text says "back to you within one business day" |
| `spam` | Bot, off-topic, gibberish | **Silent drop.** Saved to DB only. No email. No SMS. |

Classifier picks the tier in two passes:

1. **Heuristic** (instant, $0) — if the form's `issue` dropdown maps cleanly (`leak` → emergency, `hail` → urgent, `insurance`/`old_roof` → scheduled), use that.
2. **OpenRouter LLM** (~300ms, ~$0.00005/lead with Gemini Flash 2.0) — for free-text messages or `issue=other`.
3. **Fail-open** — if both fail, default to `scheduled` so we never lose a lead.

Tier + reason + confidence + classifier-model are persisted to the `leads` table for review.

---

## Pre-deploy: add OpenRouter API key

The classifier reads `OPENROUTER_API_KEY` from the `app_config` table. Without it, the function still works — it just falls back to `scheduled` for anything the heuristic can't handle.

Add the key (replace `sk-or-...` with the real value from https://openrouter.ai/keys):

```sql
INSERT INTO public.app_config (key, value)
VALUES ('OPENROUTER_API_KEY', 'sk-or-...')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

**Optionally** override the model (defaults to `google/gemini-2.0-flash-001`):

```sql
INSERT INTO public.app_config (key, value)
VALUES ('OPENROUTER_MODEL', 'google/gemini-2.0-flash-001')
ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value;
```

### Model picker (good options on OpenRouter)

| Model | Cost / 1M in / out | Speed | Notes |
|---|---|---|---|
| `google/gemini-2.0-flash-001` | $0.075 / $0.30 | ~300ms | **Default. Best $/quality balance.** |
| `google/gemini-flash-1.5-8b` | $0.0375 / $0.15 | ~250ms | Half the price; slightly less smart. |
| `meta-llama/llama-3.1-8b-instruct` | $0.018 / $0.018 | ~400ms | Cheapest. JSON output less reliable. |
| `openai/gpt-4o-mini` | $0.15 / $0.60 | ~500ms | More expensive; not better for this task. |
| `anthropic/claude-haiku-4-5` | $1.00 / $5.00 | ~500ms | Overkill for a 5-tier classifier. |

To swap models later, just `UPDATE app_config SET value = 'new/model-slug' WHERE key = 'OPENROUTER_MODEL';` — no redeploy needed.

---

## Deploy

From the Frame Utah repo root:

```bash
cd ~/projects/frame-restoration-utah
supabase functions deploy handle-lead --project-ref hdcflshhomzildwqlmwh --no-verify-jwt
```

The form posts unauthenticated from the browser. The v10 server-side honeypot,
bounded parser, contact validation, atomic IP-HMAC throttle, and spam classifier
are the abuse controls; the public endpoint intentionally does not require JWT.

---

## Test (after deploy)

Five payloads — one per tier. Run from any terminal. Each should:
- Return `{"success":true,"message":"Lead received!"}`
- Land in the `leads` table with the expected tier
- Trigger (or NOT trigger, for spam) the right notifications

The fictional NANP number below passes server validation. Use a test phone you
control only when you intentionally want to exercise SMS.

```bash
ENDPOINT="https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/handle-lead"

# 1. EMERGENCY — heuristic short-circuit (issue=leak)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Emergency","phone":"4355550100","zip":"84032",
  "issue":"leak","source_page":"/test"
}'

# 2. URGENT — heuristic (issue=hail)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Urgent","phone":"4355550100","zip":"84032",
  "issue":"hail","source_page":"/test"
}'

# 3. SCHEDULED — heuristic (issue=insurance)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test Scheduled","phone":"4355550100","zip":"84032",
  "issue":"insurance","source_page":"/test"
}'

# 4. EMERGENCY via LLM — long free-text overrides dropdown
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Test LLM","phone":"4355550100","zip":"84032",
  "issue":"other",
  "message":"Roof is actively leaking right now, water dripping into living room ceiling, can someone come today??",
  "source_page":"/test"
}'

# 5. SPAM — should silently drop (no email, no SMS, but row in DB)
curl -X POST "$ENDPOINT" -H "Content-Type: application/json" -d '{
  "name":"Bot McBot","phone":"4355550100","zip":"84032",
  "message":"Buy cheap viagra now click here http://spam.example.com",
  "source_page":"/test"
}'
```

### Verify in DB

```sql
SELECT id, created_at, name, tier, tier_reason, tier_confidence, tier_classifier
FROM public.leads
WHERE name LIKE 'Test%' OR name LIKE 'Bot%'
ORDER BY created_at DESC LIMIT 10;
```

Expected:
- Tests 1-3: `tier_classifier = 'heuristic'`, `tier_confidence = NULL`
- Test 4: `tier = 'emergency'`, `tier_classifier = 'google/gemini-2.0-flash-001'`, confidence 0.7-1.0
- Test 5: `tier = 'spam'`, `tier_classifier = 'google/gemini-2.0-flash-001'`

### Verify notifications

- Tests 1-4: Landon should receive SMS (Verizon gateway) within ~15s. Subject prefix shows the tier.
- Test 5: Landon should receive **nothing**. Lead is in DB only.

### Cleanup test rows

```sql
DELETE FROM public.leads WHERE name LIKE 'Test%' OR name LIKE 'Bot%';
```

---

## Rollback

If something breaks, redeploy the exact pre-change Edge Function version from
the rollout receipt. Do not pull an unknown historical version from live state.

The additive rate-limit table/RPC can remain in place during a code rollback;
it has no trigger and changes no existing lead-table behavior.

---

## What v10 preserves

- Form endpoint URL — same
- Existing leads — none of them get reclassified retroactively (would need a backfill script if desired)
- Twilio — LIVE as of 2026-06-01 (10DLC approved; all four `TWILIO_*` creds set in `app_config`). Owner SMS + customer speed-to-lead auto-text both fire through Twilio. Verizon vtext gateway remains as a redundant owner-alert path, no longer the sole channel.
- Resend remains the durable owner-email provider; Twilio remains independent.

---

## Future enhancements (next playbook items)

- **Backfill historical leads** with classification (one-time script, ~3 leads in DB right now)
- **Weekly tier-distribution report** in daily ops digest ("this week: 2 emergency, 1 urgent, 8 scheduled, 3 spam")
- **Telemetry to local-llm-toolkit** — log each classification to `~/.cache/local-llm-telemetry.jsonl` so cost shows up in `llm_telemetry.py weekly`
