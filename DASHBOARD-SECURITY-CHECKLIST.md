# Utah Internal Dashboard — Security And Rollout Checklist

Run this checklist after any change to dashboard authentication, `leads`,
`call_logs`, `report_access`, or the reporting Edge Functions.

The intended architecture is Edge-only access:

- browsers never query an internal table through PostgREST;
- a PIN is submitted once in the JSON body of `POST lead-crm?action=login`;
- successful login returns an eight-hour workday bearer token containing only the
  `report_access.id`, bounded `session_version`, and standard token metadata;
- `lead-crm` and `weekly-report` reload the active user, current role, and live
  `session_version` for every bearer request, then use the service-role client
  for database work;
- public `anon` and `authenticated` roles have no privileges on internal data.

Never treat the public Supabase key or dashboard routing key as authentication.

## Hard Stop Conditions

Do not apply
`supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql`
until all of these are true:

- [ ] `20260807000150_dashboard_session_credentials.sql` is applied.
- [ ] `20260807000140_atomic_dashboard_auth_throttle.sql` is applied before
      deploying the session-aware `lead-crm` function.
- [ ] `DASHBOARD_SESSION_SECRET` is set to a unique 32-byte-or-longer secret.
- [ ] `DASHBOARD_CREDENTIAL_PEPPER` is set to a different unique
      32-byte-or-longer secret.
- [ ] A fresh HMAC-signed client-IP deployment token is installed in the GitHub
      production environment and bound to the exact main SHA, Utah project,
      current `_shared/client-ip.ts` SHA-256, probe bundle/version, passed
      IPv4/IPv6/forgery canaries, and probe cleanup. The Markdown receipt is
      INVALID historical evidence and cannot authorize rollout.
      Canonical `cf-connecting-ip` is the only trusted identity;
      missing/malformed CF identity blocks rollout.
      `x-real-ip` and `x-forwarded-for` are never accepted as fallbacks.
- [ ] `POSTHOG_PERSONAL_API_KEY` is a scoped read-only key stored only as an
      Edge Function secret; the formerly embedded personal key is revoked.
- [ ] Session-aware `lead-crm` and sanitized `weekly-report` are deployed and
      verified before the browser clients switch.
- [ ] `/dashboard`, `/seo-report`, `/leads`, and
      `scripts/refresh-traffic-snapshot.sh` use bearer auth and put no PIN or
      token in a URL.
- [ ] Every `report_access.pin` value is `NULL`, every active row has
      `pin_hash`, every row has a bounded `session_version`, and all
      legacy/exposed PINs have been rotated.
- [ ] Existing roles are reviewed. `viewer` is report-only, `sales` is CRM,
      and `admin` is CRM plus access administration.
- [ ] Admin, sales, and viewer smoke tests pass on the new clients.
- [ ] A transaction preview confirms the RLS migration assertions pass.

The live-remediation migration intentionally aborts if plaintext PINs,
unsupported roles, missing core tables, or an unsafe reporting view remain.

## Credential Transport And Session Tests

- [ ] Login is `POST .../lead-crm?action=login` with JSON
      `{routing_key, pin}` and `Content-Type: application/json`.
- [ ] The login response contains `{token, token_type, expires_in, user}` and
      never echoes the PIN, routing key, hash, or pepper.
- [ ] Subsequent requests use `Authorization: Bearer <short-lived-token>`.
- [ ] Requests containing `?pin=` or `?key=` are rejected with HTTP 400.
- [ ] Missing, malformed, tampered, expired, or wrong-secret tokens return 401.
- [ ] Disabling a user invalidates their next request because the function
      reloads `report_access.active`.
- [ ] Resetting or migrating a PIN atomically increments `session_version`; old
      CRM and report tokens fail on their next request.
- [ ] Active-state changes atomically increment `session_version`, so a token
      invalidated by disabling a user cannot revive if the user is re-enabled.
- [ ] Login throttling uses the service-role-only atomic reservation RPC before
      every credential check, counts successes and failures, never clears on
      success, and fails closed if throttle storage/RPC is unavailable.
- [ ] Login throttle keys are 64-character, context-separated HMAC-SHA256
      values made with a 32-byte-or-longer secret. Raw IPs, forwarded chains,
      ports, and caller-selected first-XFF values are never persisted.
- [ ] Responses send `Cache-Control: no-store` and allow the `Authorization`
      request header in CORS preflight.
- [ ] Immutable Vercel preview QA uses an exact origin in the optional
      `DASHBOARD_PREVIEW_ORIGINS` allowlist; wildcards are never used and the
      preview entry is removed after the production receipt passes.
- [ ] Browser storage contains the bearer token only; it never stores a PIN.

Offline checks:

```bash
deno test --allow-read \
  supabase/functions/_shared/dashboard-session.test.ts \
  supabase/functions/_shared/dashboard-credential.test.ts \
  supabase/functions/weekly-report/report-contract.test.ts \
  supabase/functions/weekly-report/source-security.test.ts
```

## Authorization Matrix

| Capability | viewer | sales | admin |
|---|---:|---:|---:|
| Aggregate report | yes | yes | yes |
| Recent report rows | minimized | operational | operational |
| CRM read/write | no | yes | yes |
| Access list/create/toggle/reset | no | no | yes |

- [ ] Server-side checks enforce the matrix; hidden buttons are not security.
- [ ] Unknown/null roles fail closed.
- [ ] A viewer report contains only lead service/source/timestamp and call
      city/source/duration/timestamp—no homeowner name, internal row ID, lead
      phone, caller number, status, row-level job value, or row-level commission.
- [ ] `detail=summary` returns no row-level lead or call records for any role.
- [ ] Weekly report selects only fields required for the report and returns an
      explicit provider-unavailable error instead of false zero PostHog data.

## Stored-XSS And Rendering Gate

Lead names/messages, call metadata, URLs, PostHog paths, and provider error
text are untrusted plain text. A bearer token in `sessionStorage` is only as
safe as the page that holds it.

- [ ] Dynamic customer/provider values use `textContent`, DOM construction, or
      one audited HTML-escaping function before any `innerHTML` sink.
- [ ] An offline fixture such as `<img src=x onerror=...>` renders literally
      and creates no element/event handler.
- [ ] Access-list rows never render PINs or hashes and never concatenate user
      data into HTML.
- [ ] Error UI does not inject raw server/provider messages into HTML.
- [ ] A restrictive production Content Security Policy is verified after the
      inline-script migration plan is complete.

## RLS And Public-Key Tests

Use a disposable public key value from the project settings without printing it
to logs. These checks must return 401/403 or no rows; any internal row is a P0.

- [ ] Public role cannot SELECT/INSERT/UPDATE/DELETE `report_access`.
- [ ] Public role cannot SELECT/UPDATE/DELETE `leads`.
- [ ] Public role cannot read `call_logs`, `sms_logs`,
      `sms_conversation_map`, `app_config`, or `website_leads_report`.
- [ ] Public lead intake works only through `handle-lead`; direct table insert
      is denied.
- [ ] `website_leads_report` is `security_invoker=true` and service-role-only.
- [ ] No permissive public policy remains on an internal table.
- [ ] Service role retains the table/sequence privileges needed by every active
      Edge Function.

Do not rotate a public Supabase key as a substitute for RLS. Public keys are
designed to be visible; table privileges, policies, and server-side role checks
are the protection.

## Edge Function Inventory And Secrets

- [ ] `weekly-report` source is tracked in this repository and its deployed
      digest/version is recorded in the rollout receipt.
- [ ] `weekly-report` and `lead-crm` use `SUPABASE_SERVICE_ROLE_KEY` only inside
      Edge Functions; it is absent from HTML, JSON, git history, and logs.
- [ ] `POSTHOG_PERSONAL_API_KEY` is read from `Deno.env` and used only as the
      bearer credential for the PostHog project query endpoint.
- [ ] No Edge source contains a literal personal key, routing key, PIN, session
      secret, credential pepper, or service-role key.
- [ ] CORS allows only approved production origins for protected report data.
- [ ] `weekly-report` accepts GET/OPTIONS only, bounds `days` to 1–365, and
      fails red on incomplete database or PostHog data.

List secret **names** only during review. Never paste values into a terminal
transcript, issue, pull request, or chat.

## Dashboard Edge Deployment Receipt Gate

The manual Edge deploy workflow has no dashboard approval dropdown. Every
production deploy runs in the exact GitHub environment
`Production – frame-restoration-utah` and hard-fails unless the selected commit
is both the current `origin/main` tip and the subject of a successful main-push
Compliance Gate run whose dashboard-security job also succeeded. The workflow
rechecks the main tip immediately before the Supabase deploy.

For `lead-crm` and `weekly-report`, the workflow independently queries the live
Utah migration history through the authenticated Supabase Management API and
requires `20260807000140` plus `20260807000150`. It also lists live Edge secret
metadata through the authenticated Supabase CLI, requires every
function-specific secret name, and proves the session-secret and
credential-pepper digests are present and different. Neither interface reveals
secret length or proves an auth/role smoke actually ran, so those two facts are
never claimed from the API response.

The same read-only query derives the cutover state from live catalog/data:
`complete` requires every `report_access.pin` to be `NULL` and the validated
`report_access_plaintext_pin_forbidden_check` constraint to exist. A `pending`
receipt is rejected when both live conditions already hold, and a `complete`
receipt is rejected when either does not.

The inaccessible facts require a fresh HMAC-SHA256 receipt in the production
environment secrets `DASHBOARD_DEPLOY_RECEIPT_TOKEN` and
`DASHBOARD_DEPLOY_RECEIPT_HMAC_KEY`. The signed payload is valid for at most 24
hours and is rejected unless it contains all of the following:

- [ ] `receipt_version: 1`, project ref `hdcflshhomzildwqlmwh`, and the exact
      40-character `source_sha` being deployed.
- [ ] Current live migration versions `20260807000140` and `20260807000150`.
- [ ] `live_cutover_complete` exactly matches the PIN-null/validated-constraint
      state returned by the live read-only query.
- [ ] The exact current live digest and `updated_at` metadata for
      `DASHBOARD_SESSION_SECRET` and `DASHBOARD_CREDENTIAL_PEPPER`.
- [ ] `secret_minimum_bytes: 32` and `secret_values_distinct: true`, signed only
      by the verifier that generated and compared the underlying values without
      printing them.
- [ ] Passed admin, sales, viewer, and session-revocation auth/role checks.
- [ ] A truthful `cutover_state` and matching smoke scope as defined below.

Use `cutover_state: pending` with
`auth_role_smoke_scope: exact-source-offline` for the first additive deploy.
This proves the auth/role fixtures and local exact-source smoke only; it does
not claim production behavior, PIN rotation, bearer-client rollout, or cutover
`00200` completion.

Use `cutover_state: complete` only with
`auth_role_smoke_scope: live-production`, after every PIN is hash-only, the
bearer clients plus fresh admin/sales/viewer and revocation smoke tests pass in
production, and the reviewed `00200` cutover is recorded as applied. The
signature authenticates the evidence bundle; it does not turn an unperformed
test into proof.

## Safe Rollout Order

Use the approved migration runner that records every applied filename in
`supabase_migrations.schema_migrations`. **Do not run `supabase db push`** from
a broad or dirty tree, paste migration SQL into the console, or use migration
repair to make selective raw SQL look applied. The full repository is forbidden
as the runner workdir because it contains 25 other migration versions absent
from live history. After merge, use the final `RELEASE_SHA` and the exact
runner in `supabase/functions/handle-lead/DEPLOY.md`: pinned Supabase CLI 2.113.0
must `init` a just-in-time empty workdir because no tracked
`supabase/config.toml` exists, then `git archive` only the eight reviewed
migrations plus the immutable remote-history poison-pill guard template and
verify their SHA-256 manifests. Link only inside that workdir, retain the
JSON before-list, and require non-target remote history to equal the reviewed
24-version baseline while target history is one of the nine exact ordered
prefixes. Before the first linked list, secure one exclusive Utah
migration-writer window through the final postflight/list, bind
`UTAH_MIGRATION_EXCLUSIVE_WRITER_ACK` to the exact `RELEASE_SHA`, and stop if
any operator, workflow, Studio action, CLI process, or automation could mutate
the live schema or migration history concurrently. Require the catalog
preflight to aggregate every direct migration-history row and prove exact
equality with the 24-version baseline plus the target prefix; the CLI's
formatted list alone is insufficient because it can omit an unparseable
version. Require each prefix phase present and
each suffix phase pristine. Move applied-prefix source SQL outside the active
directory and replace it—plus every baseline version—with poison guards.
Require an effective list with the exact baseline/prefix matched, zero
remote-only, and only the exact target suffix local-only before running the
pinned explicit binary with
`supabase migration up --linked --include-all --yes`. Re-run the exact catalog
preflight and prefix-specific 32-file manifest immediately before execution.
Require both the structured JSON receipt and stderr apply lines to name only
the exact pending suffix in order (or an explicit no-mutation skip at prefix
eight). Then require the catalog postflight to return
`postflight_ok: true` and the final list to contain 32 exact matches before
retaining the after-list. A selected guard raises and aborts; it can never
recreate a missing history row.
Management API/raw SQL and migration repair are never completion substitutes.

1. Back up schema/policies and capture current function versions/digests plus a
   tested code-first rollback receipt.
2. Capture the actual Supabase client-IP header-shape canary, then use the
   executable issuer in `supabase/functions/handle-lead/DEPLOY.md` to install a
   one-hour signed token bound to the final SHA/extractor/probe metadata. Stop
   unless canonical `cf-connecting-ip` is selected, forged CF/X-Real/XFF inputs
   cannot change identity, and probe cleanup is complete.
3. Keep the old lead handler live and apply one reviewed, history-tracked
   migration batch in filename order:
   `20260807000090_emergency_dashboard_secret_containment.sql`,
   `20260807000100_lead_notification_outbox.sql`,
   `20260807000125_add_ul_request_spam_status.sql`,
   `20260807000140_atomic_dashboard_auth_throttle.sql`,
   `20260807000150_dashboard_session_credentials.sql`,
   `20260807000160_lead_intake_rate_limit.sql`,
   `20260807000165_activate_lead_notification_outbox.sql`, and
   `20260807000170_report_test_markers.sql`. Expect the containment migration
   to stop the legacy direct-PostgREST dashboard. Old-handler lead inserts have
   no `submission_key`, so notification activation remains inert. Verify all
   eight versions in migration history and confirm existing service-role Edge
   paths still work before continuing.
4. Set the lead-intake HMAC, Utah-scoped Resend API/sender, webhook, and worker
   secrets. Verify both resolved sender domains are sending-enabled in Resend.
   The owner-email sender is required for core delivery. A missing/invalid
   Verizon gateway sender degrades only that auxiliary alert and must not block
   either owner-email lane. Deploy the webhook and worker first; require worker
   HTTP 200/`healthy:true` and endpoint-reported runtime deployment IDs matching
   refreshed live function metadata. The health receipt must also prove the
   Resend key returns `restricted_api_key` on a read-only domains query; verify
   its exact domain scope separately in Resend. Recovery calls must explicitly
   request `x-frame-worker-mode: recover`; a missing mode is rejected.
5. Gate and deploy the new `handle-lead` last, then the honeypot-bearing forms.
   Prove one controlled lead reaches both persisted outbox recipients, Landon's
   inbox, the backup inbox, and delivery webhooks; require a fresh healthy run.
   Confirm the full Resend request—including sender, recipient, reply-to,
   subject, body, and stable owner-routing tag—was frozen by the atomic claim.
6. Confirm the widened CRM statuses and additive credential/RPC contracts from
   the migration batch before deploying protected dashboard code.
7. Set distinct dashboard session secret and credential pepper plus the scoped
   replacement PostHog key. Deploy session-aware `lead-crm` and sanitized
   `weekly-report`; test their server-side role/auth paths before any client
   switch.
8. Deploy bearer-aware `/dashboard`, `/seo-report`, `/leads`, and snapshot
   clients. Verify no request URL, browser storage entry, or log contains a PIN
   and that only the bearer token is retained in `sessionStorage`.
9. Rotate/migrate every PIN, promote required CRM users to `sales`, review all
    roles, and prove every plaintext `report_access.pin` is null. Run fresh
    admin/sales/viewer, stored-XSS, report, CRM, and session-revocation gates.
10. Preview the assertions in
    `supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql`.
    Apply that cutover through an explicitly recorded, reviewed change only
    after steps 1–9 are evidenced; any preflight failure stops rollout.
11. Re-run RLS/public-key, function, browser, notification, and lead-intake
    smoke tests. Then revoke the exposed legacy PostHog key and retire legacy
    query-auth paths.

Keep the previous Edge Function versions and pre-change policy/schema receipt
until the full production gate passes. Roll back code first if bearer clients
fail; do not reopen public table access as a shortcut.

## Incident Response

If a PIN is exposed: disable the row through the admin Edge action, issue a new
hash-only PIN, and verify both the old PIN and a bearer token issued before the
reset fail. Never update or search plaintext PINs through public PostgREST.

If a session token is exposed: disable the user immediately. Rotate
`DASHBOARD_SESSION_SECRET` if scope is unknown; this invalidates all sessions.

If the credential pepper is exposed: rotate every PIN and the pepper together.
Existing hashes cannot be safely reused with a new pepper.

If the PostHog personal key is exposed: the owning PostHog user creates a new
scoped read-only key, updates the Edge secret, verifies queries, then deletes
the old key in Personal API Keys settings.

## Sign-off

- Operator: ____________________
- Date/time: ___________________
- Source commit and function versions: _________________________________
- 00140/00150 migration-history receipt: [ ]
- Distinct 32-byte dashboard secrets verified without output: [ ]
- Signed dashboard receipt SHA-256 / expiry: __________________________
- Dashboard cutover state (`pending` or `complete`): ___________________
- Admin/sales/viewer gate: [ ]
- Stored-XSS gate: [ ]
- RLS/anon-denial gate: [ ]
- Lead intake regression gate: [ ]
- Rollback receipt captured: [ ]
