# Owner password recovery

The three Utah sign-in pages (`/leads`, `/seo-report.html`, and `/dashboard/`)
share a Forgot password form. An owner supplies the full account name and their
provisioned recovery email. The response is identical whether or not the
account matches. Only the database's recipient can receive a link.

Links expire after 15 minutes and can be used once. Completion replaces the
credential, increments the existing session version, consumes outstanding
links, and returns to sign in. An administrator password change, account
inactivation, or recovery-email change also invalidates a previously issued
link. Account roles are preserved, including report-only viewers. Existing
PINs continue working until their holder chooses a replacement.

New passwords support spaces and Unicode: at least 12 characters, no more than
72 UTF-8 bytes. Because the current portal identifies sign-ins by credential,
a password already assigned to another account is rejected. The credential
pepper and existing atomic credential locks are reused; plaintext credentials
and raw reset tokens are never stored in the recovery tables. Tokens stay in
page memory and are removed from the URL before third-party scripts load.

## Release requirements

1. Obtain confirmation of each recovery mailbox before provisioning it.
   Do not seed owner addresses or change roles/passwords in a migration.
2. Independently review the exact source commit and pass blocking CI, recovery
   SQL/concurrency tests, and source/immutable-preview mobile receipts.
3. Apply only `20260909010000_owner_password_recovery.sql` through the approved
   migration runner and record it in migration history. Recheck RLS, RPC grants,
   the unique normalized account/email index, and session-version invalidation.
4. Configure a verified `CRM_RECOVERY_FROM` sender paired with the existing
   `RESEND_API_KEY`. Leave `CRM_RECOVERY_ENABLED` disabled until the recipient
   and delivery configuration have been verified. Recovery needs the existing
   dashboard session secret and credential pepper as well.
5. Deploy `lead-crm` only through `.github/workflows/deploy-edge-function.yml`
   on the exact green main SHA with valid dashboard and client-IP receipts.
   Do not use a direct deployment to bypass that workflow.
6. Provision the confirmed mailbox on the existing active account with an
   exact ID/name/role check and an affected-row count of one. Read back only
   non-secret status. Enable recovery after the backend is deployed.
7. Verify a controlled synthetic account end to end with an authorized test
   mailbox: delivery, new-password login, old-password rejection, session
   revocation, replay rejection, and cleanup. Never reset a real owner's
   credential merely to test the feature.
8. Publish the matching frontend and preserve new canonical production
   receipts with marker `utah-owner-recovery-20260908a`. A preview pass is not
   proof that the production recovery service or an owner's mailbox works.

## Verification

```sh
deno test supabase/functions/lead-crm/recovery.test.ts
bash scripts/test-owner-recovery-sql.sh
node scripts/audit-dashboard-security.mjs
node scripts/test-dashboard-session-client.mjs
python3 scripts/test-owner-recovery-browser.py --base-url http://127.0.0.1:4174 --receipt-dir /private/evidence/recovery
```

The SQL runner starts and removes an isolated PostgreSQL container without
publishing database ports. The browser suite intercepts every Supabase request
and sends no email. It covers all three pages at 320, 360, 393, 430, and 740 CSS
pixels, including landscape, expired/malformed links, password confirmation,
URL/storage containment, delayed login/session responses, and keyboard focus.

Shared surface contracts are `qa/surface-contract.owner-recovery.source.json`
and `qa/surface-contract.owner-recovery-report.source.json`; adapt only the
serving origin for immutable previews. The legacy report intentionally has no
canonical and uses the absent-canonical source/preview contract. Production
must additionally verify its exact URL, noindex/no-canonical boundary, marker,
and recovery browser flow. Do not add a public canonical to satisfy a gate.

Real-device iOS/Android, screen-reader behavior, and owner receipt/use remain
separate from emulated Chromium and mocked API tests.

## Disable recovery

Set `CRM_RECOVERY_ENABLED=false` to stop requests and completion without
changing existing accounts or sign-in credentials. Keep additive schema and
history; do not restore plaintext PINs or weaken session checks.
