# Utah lead-notification pg_cron worker — operator runbook

For `supabase/migrations/20261118000000_pgcron_lead_notification_worker_v2.sql`.

**Status: merged, never applied, and it still cannot be applied.** There is no
gated runner for this version, pg_cron/pg_net are not verified enabled on the
Utah project, and the Vault secret is not known to exist. Nothing in this
runbook has been run, and no production catalog was read while writing it. The
15-minute GitHub schedule in `.github/workflows/lead-notification-worker.yml`
remains the only scheduler that is actually running; do not cut it here.

## Read this check FIRST (read-only, run before anything else)

```sql
-- 1. Are the extensions actually installed? (the whole premise)
select extname, extversion from pg_extension
 where extname in ('pg_cron', 'pg_net');

-- 2. Does service_role have any reach into schema net? On a stock Supabase
--    project both answers are false. That is exactly why
--    public.lead_notification_worker_cron_health must be a DEFINER view: an
--    invoker view would error for its only grantee.
select has_schema_privilege('service_role', 'net', 'USAGE')             as service_role_net_usage,
       has_table_privilege('service_role', 'net._http_response', 'SELECT') as service_role_net_select;

-- 3. Is the worker token in Vault? (presence only — never decrypt it here)
select exists (
  select 1 from vault.secrets where name = 'lead_notification_worker_token'
) as worker_token_present;

-- 4. Is anything already scheduled under this name?
select jobname, schedule, active from cron.job
 where jobname = 'lead-notification-worker';
```

If (2) returns `true` for either column, stop and ask why — someone has widened
`service_role` into pg_net's response table, which exposes every pg_net
caller's headers and bodies to the browser-facing server role.

## The two defects this version fixes

A review on 2026-11-26 confirmed both against a throwaway PostgreSQL with the
original file applied:

1. **The health view was unscoped.** It selected every row of
   `net._http_response`. With one unrelated pg_net response inserted, the
   original view returned it — so a 2xx in that view did **not** prove this
   worker had succeeded, and that view is the stated go/no-go for cutting the
   GitHub schedule. Fixed by having the function record each request id it
   issues in `public.lead_notification_worker_cron_requests` and having the view
   join `net._http_response` to that ledger.
2. **The view was `security_invoker = true`.** `service_role` is its only
   grantee and has no SELECT on `net._http_response`, so reading it failed with
   `permission denied for table _http_response`. Fixed by making it a definer
   view (`security_invoker = false`, owned by `postgres`) whose restriction is
   the join, with `public`, `anon` and `authenticated` revoked.

A third problem was found while fixing those: `20260819000000` declares
`public.invoke_lead_notification_worker()` as `RETURNS void`, and
`create or replace` cannot change a return type — applying the old file and
then this one errored with `cannot change return type of existing function`.
The function is now dropped by signature before it is created, so the file's
own claim that it supersedes `20260819000000` is finally true.

## Token exposure (inherent to pg_net — documented, not fixed)

pg_net queues the request before sending it, so the `Authorization: Bearer …`
header sits in `net.http_request_queue` (and, for requests pg_net could not
complete, in its failed-request table) until pg_net drains the queue. That is
how pg_net works; it is not something this migration can change. What bounds it:
schema `net` is reachable only by a role with privileges there (`postgres`), not
by `anon`, `authenticated` or `service_role` — check (2) above before and after
— and nothing in this migration selects, copies or exposes a header or a
response body. The health view deliberately carries no `headers`, `content` or
`content_type` column, and the request ledger holds only the request id and its
timestamp.

If that residency is unacceptable, the alternative is not this migration: it is
leaving the schedule in GitHub Actions, where the token lives in an Actions
secret instead.

## Owner prerequisites that remain, in order

1. **Enable `pg_cron` and `pg_net`** (Supabase dashboard → Database →
   Extensions). Both are bundled at no extra charge on this project's plan. The
   migration's guarded block creates them when they are installable and **raises**
   when they are neither installed nor available, so an apply can never leave
   the job silently unscheduled.
2. **Create the Vault secret**, once, out of band:
   ```sql
   select vault.create_secret('<token>', 'lead_notification_worker_token',
          'Bearer token for functions/v1/lead-notification-worker');
   ```
   Same value as the `LEAD_NOTIFICATION_WORKER_TOKEN` GitHub secret and
   edge-function secret. Never paste it into chat, a PR, a doc or the migration.
3. **Apply `20261118000000` through a gated exact-target runner that does not
   exist yet.** There is no runner for this version. Utah production migrations
   may only be applied by a hand-run exact-target runner
   (`supabase/functions/handle-lead/DEPLOY.md`,
   `DASHBOARD-SECURITY-CHECKLIST.md`); `scripts/run-call-tracking-migrations.sh`
   and `scripts/run-lead-migrations.sh` are the two that exist, and neither
   covers this file. Writing that runner is a separate PR. Never
   `supabase db push`, never `migration repair`, never the SQL editor.
4. **See this worker's own 2xx**:
   ```sql
   select id, created, status_code, timed_out, error_msg, requested_at, healthy
     from public.lead_notification_worker_cron_health
    order by created desc
    limit 10;
   ```
   Rows appear only for request ids this worker issued. pg_net keeps responses
   for roughly six hours and the function prunes its ledger at 24 hours, so
   check within a few hours of a scheduled minute (`7,22,37,52`). An empty
   result means no response has landed yet — that is not a pass.
5. **Only then**, in a **separate** PR, cut the GitHub schedule in
   `.github/workflows/lead-notification-worker.yml` (or run
   `select cron.unschedule('lead-notification-worker');`) so exactly one
   scheduler owns the cadence. Both running at once is safe but wasteful — the
   worker claims each job with `claim_version` + a lease, so overlapping runs
   cannot send twice.

## Rollback

```sql
select cron.unschedule('lead-notification-worker');
drop view if exists public.lead_notification_worker_cron_health;
drop function if exists public.invoke_lead_notification_worker();
drop table if exists public.lead_notification_worker_cron_requests;
```

Then restore the 15-minute schedule in
`.github/workflows/lead-notification-worker.yml` (the repository must be public
again, or have Actions minutes, for that to be free).

## Tests

`.github/workflows/pgcron-lead-notification-worker.yml` (blocking,
path-filtered, no secrets) stands up a throwaway `postgres:16-alpine`, stubs
`cron`, `net` and `vault` minimally via
`supabase/tests/pgcron_lead_notification_worker_fixture.sql`, applies the
migration **twice**, and runs
`supabase/tests/pgcron_lead_notification_worker.sql`. A passing run proves the
contract of the SQL, not that production is in any particular state.
