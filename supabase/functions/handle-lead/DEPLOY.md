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
`SUPABASE_ACCESS_TOKEN`, `LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN`,
`LEAD_NOTIFICATION_DEPLOY_RECEIPT_HMAC_KEY`,
`LEAD_NOTIFICATION_WORKER_TOKEN`, and `RESEND_WEBHOOK_SECRET`. The last two
must match their Supabase Edge values so the fresh canaries authenticate. The
receipt key/token are GitHub-only and must be distinct from dashboard,
client-IP, worker, webhook, and intake secrets.

### Executable owner-notification receipt path

Run from the exact clean merged main checkout with pinned Supabase CLI 2.112.0.
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
writes the token only to the new mode-0600 file. It never prints the token.
Install it without terminal output, then delete the local token/evidence files:

```bash
gh secret set LEAD_NOTIFICATION_DEPLOY_RECEIPT_TOKEN \
  --env 'Production – frame-restoration-utah' < "$NOTIFICATION_RECEIPT_OUTPUT"
```

Issue a new target-specific token for every dispatch because it expires within
one hour and any live secret/function metadata change invalidates it. Rotate the
HMAC key through the password manager and GitHub production environment after
suspected exposure, signer access changes, or routine key rotation; every old
token becomes invalid immediately. A worker/webhook deployment changes live
function metadata, so capture again and issue a fresh `handler-ready` receipt
before deploying `handle-lead`.

### Executable client-IP receipt path

After a non-public probe built from the exact `DEPLOY_SHA`, save one sanitized
mode-0600 JSON evidence file containing `probe_source_sha`,
`probe_bundle_sha256`, `probe_function` (`client-ip-probe`, positive version,
`ACTIVE_AT_CANARY`), `canary_checked_at`, the IPv4/IPv6/forged-header/key-shape
results, and proof that the probe function and probe secrets were deleted. It
must contain no raw address or secret. Set its path as
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
   `UTAH_LEAD_RESEND_SMS_FROM`, `RESEND_WEBHOOK_SECRET`, and
   `LEAD_NOTIFICATION_WORKER_TOKEN`. Put the same worker token in the GitHub
   Actions secret; never print values. No generic or literal sender fallback is
   accepted.
4. In Resend, resolve both scoped sender values and confirm each domain is
   verified and sending-enabled in the Utah account. The owner sender is core
   readiness. The Verizon SMS sender is auxiliary: if it is missing or invalid,
   that alert may fail but primary and backup owner email must still run. Do not
   infer verification from website DNS or a redirect. Also verify the primary
   and backup recipient secret names resolve to the intended inboxes without
   printing their values; one invalid recipient must not block the other lane.
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
Supabase CLI 2.112.0 migration subsystem. The full repository checkout is
**forbidden** as the runner workdir: it contains 25 other migration versions
absent from live history. `--include-all` against that tree could apply them.

Instead, create a just-in-time isolated workdir from the immutable merged Git
object. This repository does not track `supabase/config.toml`; generate a
runner-only config inside the empty workdir with pinned CLI 2.112.0, then
archive only the eight reviewed migrations. Mechanically compare every
migration basename and SHA-256 before linking. Do not substitute working-tree
files, a copied directory, a config-file archive assumption, or a broad glob.

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

cli_version="$(supabase --version | head -n 1)"
test "$cli_version" = '2.112.0' || {
  printf 'Hard stop: Supabase CLI 2.112.0 is required; found %s.\n' "$cli_version" >&2
  exit 1
}

UTAH_MIGRATION_WORKDIR="$(mktemp -d "${TMPDIR:-/tmp}/utah-release-migrations.XXXXXX")"
test -d "$UTAH_MIGRATION_WORKDIR"
supabase init --workdir "$UTAH_MIGRATION_WORKDIR"
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
  | tar -xf - -C "$UTAH_MIGRATION_WORKDIR"

expected_manifest="$(cat <<'MANIFEST'
90a34fb0ce2e42011b0d07be11ffeaea0a70c1f7da182e27d92a8ec46195b6e0  supabase/migrations/20260807000090_emergency_dashboard_secret_containment.sql
b459852f1f11b15644267012c0efda8c74b75e44c1195c806c5d0b42aae27e62  supabase/migrations/20260807000100_lead_notification_outbox.sql
183f9509fcf1526d6751fe092c89ba92f581cf3da31110652ecd0aecabcc1ebd  supabase/migrations/20260807000125_add_ul_request_spam_status.sql
a8b7c3bc7e46aa6db335b54f87ca4b56c0b62bec60622961f3ae621219c6ed12  supabase/migrations/20260807000140_atomic_dashboard_auth_throttle.sql
e1a6e75142e577768b6ce8a970daafb437471a52ef989450f755e1b514105500  supabase/migrations/20260807000150_dashboard_session_credentials.sql
ae794b134334db1dfe01a99dd42d4027613aa55b94060a582978154d25dab723  supabase/migrations/20260807000160_lead_intake_rate_limit.sql
0e53b586dceca55e94cec08fa08f16028e2e59d414a5398e2391851892311a60  supabase/migrations/20260807000165_activate_lead_notification_outbox.sql
f58b6377df70b94218cc0fdf887e16052287c5bb3d6cf12661a2d235dbf27099  supabase/migrations/20260807000170_report_test_markers.sql
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
supabase link --project-ref hdcflshhomzildwqlmwh --yes
test "$(cat supabase/.temp/project-ref)" = 'hdcflshhomzildwqlmwh'
supabase migration list --linked | tee migration-list.before.txt

preflight_json="$(
  supabase --agent no -o json db query --linked <<'SQL'
with s as (
  select
    (select count(*)=0 from supabase_migrations.schema_migrations where version=any(array['20260807000090','20260807000100','20260807000125','20260807000140','20260807000150','20260807000160','20260807000165','20260807000170'])) as target_history_empty,
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
      and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_lead_notification','complete_lead_notification_claim','exhaust_lead_notification_claims','resend_notification_status_rank','reconcile_resend_notification_events','apply_resend_notification_event'))) as phase_00100_pristine,
    exists(select 1 from pg_constraint c where c.conrelid='public.leads'::regclass and c.conname='leads_status_check' and lower(pg_get_constraintdef(c.oid)) not like '%ul request%' and lower(pg_get_constraintdef(c.oid)) not like '%spam%') as phase_00125_pristine,
    (to_regclass('public.auth_attempts') is not null and to_regprocedure('public.reserve_dashboard_login_attempt(text)') is null) as phase_00140_pristine,
    (to_regclass('public.report_access') is not null
      and not exists(select 1 from information_schema.columns where table_schema='public' and table_name='report_access' and column_name in ('pin_hash','credential_created_at','session_version'))
      and not exists(select 1 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('authenticate_dashboard_access','create_dashboard_access','reset_dashboard_access_credential','migrate_dashboard_access_credential','set_dashboard_access_active'))) as phase_00150_pristine,
    (to_regclass('public.lead_intake_rate_limits') is null and to_regprocedure('public.reserve_lead_intake_attempt(text)') is null) as phase_00160_pristine,
    (to_regprocedure('public.enqueue_lead_notifications()') is null and not exists(select 1 from pg_trigger where tgname='leads_enqueue_notifications' and not tgisinternal)) as phase_00165_pristine,
    not exists(select 1 from information_schema.columns where table_schema='public' and ((table_name='leads' and column_name='is_test') or (table_name='call_logs' and column_name='is_test'))) as phase_00170_pristine
)
select *, (target_history_empty and containment_00095_recorded and phase_00090_schema_ahead_exact and phase_00100_pristine and phase_00125_pristine and phase_00140_pristine and phase_00150_pristine and phase_00160_pristine and phase_00165_pristine and phase_00170_pristine) as preflight_ok from s;
SQL
)"
printf '%s\n' "$preflight_json" | tee catalog-preflight.json
jq -e 'type == "array" and length == 1 and .[0].preflight_ok == true' \
  <<<"$preflight_json" >/dev/null || {
  printf 'Hard stop: catalog preflight did not return preflight_ok=true.\n' >&2
  exit 1
}
```

The preflight must return `preflight_ok: true`: all eight target history rows
are absent, containment `00095` is recorded, the already-contained `00090`
schema is exact, and phases `00100`–`00170` are otherwise pristine. Any false,
null, extra row, query error, or unexpected object is a hard stop.

Only after that pass, re-check the immutable manifest and execute the exact
eight-file archive through the migration subsystem. `--include-all` is required
because these reviewed versions precede entries already in remote history.

```bash
manifest_before_apply="$(
  find supabase/migrations -type f -print | LC_ALL=C sort |
    while IFS= read -r migration_file; do
      shasum -a 256 "$migration_file"
    done
)"
test "$manifest_before_apply" = "$expected_manifest"
supabase migration up --linked --include-all --yes | tee migration-up.txt
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
  supabase --agent no -o json db query --linked <<'SQL'
with s as (
 select
  (select count(distinct version)=8 from supabase_migrations.schema_migrations where version=any(array['20260807000090','20260807000100','20260807000125','20260807000140','20260807000150','20260807000160','20260807000165','20260807000170'])) as target_history_complete,
  (select count(*)=1 from supabase_migrations.schema_migrations where version='20260807000095') as containment_00095_recorded,
  (coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.app_config')),false) and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.report_access')),false)
   and not has_table_privilege('anon','public.app_config','select,insert,update,delete') and not has_table_privilege('authenticated','public.app_config','select,insert,update,delete')
   and not has_table_privilege('anon','public.report_access','select,insert,update,delete') and not has_table_privilege('authenticated','public.report_access','select,insert,update,delete')
   and has_table_privilege('service_role','public.app_config','select,insert,update,delete') and has_table_privilege('service_role','public.report_access','select,insert,update,delete')
   and not exists(select 1 from pg_policies where schemaname='public' and tablename in ('app_config','report_access'))) as phase_00090_present,
  (to_regclass('public.lead_notifications') is not null and to_regclass('public.lead_notification_events') is not null
   and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_notifications')),false) and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_notification_events')),false)
   and exists(select 1 from information_schema.columns where table_schema='public' and table_name='leads' and column_name='submission_key')
   and (select count(*)=6 from pg_constraint where conname in ('lead_notifications_pkey','lead_notifications_lead_id_fkey','lead_notifications_values_check','lead_notifications_delivery_contract_check','lead_notification_events_pkey','lead_notification_events_values_check') and conrelid in (to_regclass('public.lead_notifications'),to_regclass('public.lead_notification_events')))
   and (select count(distinct p.proname)=6 and count(*)=6 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('claim_lead_notification','complete_lead_notification_claim','exhaust_lead_notification_claims','resend_notification_status_rank','reconcile_resend_notification_events','apply_resend_notification_event'))
   and (select count(*)=6 from pg_indexes where schemaname='public' and indexname in ('leads_submission_key_uidx','lead_notifications_retry_idx','lead_notifications_provider_id_idx','lead_notifications_unacknowledged_health_idx','lead_notifications_idempotency_key_uidx','lead_notifications_route_uidx'))) as phase_00100_present,
  exists(select 1 from pg_constraint c where c.conrelid='public.leads'::regclass and c.conname='leads_status_check' and lower(pg_get_constraintdef(c.oid)) like '%ul request%' and lower(pg_get_constraintdef(c.oid)) like '%spam%') as phase_00125_present,
  to_regprocedure('public.reserve_dashboard_login_attempt(text)') is not null as phase_00140_present,
  ((select count(*)=3 from information_schema.columns where table_schema='public' and table_name='report_access' and column_name in ('pin_hash','credential_created_at','session_version'))
   and (select count(distinct p.proname)=5 and count(*)=5 from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('authenticate_dashboard_access','create_dashboard_access','reset_dashboard_access_credential','migrate_dashboard_access_credential','set_dashboard_access_active'))
   and (select count(*)=3 from pg_constraint where conrelid=to_regclass('public.report_access') and conname in ('report_access_credential_present_check','report_access_pin_hash_format_check','report_access_session_version_check'))) as phase_00150_present,
  (to_regclass('public.lead_intake_rate_limits') is not null and coalesce((select relrowsecurity from pg_class where oid=to_regclass('public.lead_intake_rate_limits')),false) and to_regprocedure('public.reserve_lead_intake_attempt(text)') is not null and exists(select 1 from pg_indexes where schemaname='public' and indexname='lead_intake_rate_limits_window_start_idx')) as phase_00160_present,
  (to_regprocedure('public.enqueue_lead_notifications()') is not null and exists(select 1 from pg_trigger where tgrelid='public.leads'::regclass and tgname='leads_enqueue_notifications' and not tgisinternal and tgenabled in ('O','A'))) as phase_00165_present,
  ((select count(*)=2 from information_schema.columns where table_schema='public' and ((table_name='leads' and column_name='is_test') or (table_name='call_logs' and column_name='is_test')))
   and (select count(*)=2 from pg_indexes where schemaname='public' and indexname in ('leads_is_test_created_at_idx','call_logs_is_test_created_at_idx'))) as phase_00170_present
)
select *, (target_history_complete and containment_00095_recorded and phase_00090_present and phase_00100_present and phase_00125_present and phase_00140_present and phase_00150_present and phase_00160_present and phase_00165_present and phase_00170_present) as postflight_ok from s;
SQL
)"
printf '%s\n' "$postflight_json" | tee catalog-postflight.json
jq -e 'type == "array" and length == 1 and .[0].postflight_ok == true' \
  <<<"$postflight_json" >/dev/null || {
  printf 'Hard stop: catalog postflight did not return postflight_ok=true.\n' >&2
  exit 1
}
supabase migration list --linked | tee migration-list.after.txt
```

Copy the release manifest, both migration lists, migration output, and catalog
JSON receipts into the approved change record before removing the isolated
workdir. The receipts contain catalog metadata only; review them before storage.

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
