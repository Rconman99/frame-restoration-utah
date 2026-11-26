-- ╔══════════════════════════════════════════════════════════════════════════╗
-- ║  🛑 PARKED — DO NOT APPLY. Owner decision, 2026-11-26.                   ║
-- ╚══════════════════════════════════════════════════════════════════════════╝
--
-- This migration has NEVER been applied anywhere and is NOT to be applied. The
-- pg_cron + pg_net approach to the lead-notification cadence is parked. The
-- 15-minute GitHub Actions schedule in
-- .github/workflows/lead-notification-worker.yml stays as the mechanism.
--
-- The two reasons, both specific to hosted Supabase:
--
--   1. The bearer token cannot be kept out of a PUBLIC-readable queue.
--      pg_net stores each request's Authorization header in
--      net.http_request_queue until its background worker drains it, and
--      pg_net's own installation script grants schema net and all of its
--      tables to PUBLIC (pg_net v0.19.5, sql/pg_net.sql:355-357) — so anon,
--      authenticated and service_role can all read it. Those objects are owned
--      by supabase_admin on a hosted project, so the grants cannot be revoked
--      safely from a migration: doing so would reach into an extension this
--      project does not own and would break every other pg_net consumer on it.
--   2. The Vault secret is readable by service_role, so storing the worker
--      token there does not contain it either.
--
-- Together those mean this design cannot hold the credential it has to post
-- every fifteen minutes. That is a design problem, not a bug to patch, which is
-- why this file is parked rather than hardened further.
--
-- An earlier revision of this header claimed schema net "is not reachable by
-- anon/authenticated/service_role", and a later one claimed a hosted revoke
-- would fix it. BOTH CLAIMS WERE FALSE and are removed. What a supported design
-- would need is recorded in docs/runbooks/utah-lead-notification-pgcron.md.
--
-- The SQL below is kept, not deleted, so the work is reviewable and so the
-- refuse-to-schedule gate stays in the file as a safety net if anyone ever
-- tries to apply it: it RAISES rather than scheduling while anon,
-- authenticated or PUBLIC can read the queue or write the responses. The gate
-- is deliberately NOT extended any further.
--
-- Under the Supabase CLI's migration transaction, that refusal rolls the whole
-- file back — no table, no function, no view, no job. An earlier note in the
-- test fixtures described a "partial state" where the objects exist and only
-- the job is missing; that is only true under a bare `psql -f` without -1, and
-- it is corrected here.
--
-- ROLLBACK (only relevant if someone applied it anyway):
--   select cron.unschedule('lead-notification-worker');
--   drop view if exists public.lead_notification_worker_cron_health;
--   drop function if exists public.invoke_lead_notification_worker();
--   drop table if exists public.lead_notification_worker_cron_requests;
--   -- The supabase_migrations.schema_migrations row for 20261118000000 is NOT
--   -- removed by those drops; see the runbook for the one-transaction form.
--
-- Original intent, for the record: move the 15-minute cadence off GitHub
-- Actions (GitHub-hosted, ~2,660 billed min/30 days) so frame-restoration-utah
-- could go private without Actions overage or a gap in owner lead alerts.
-- SUPERSEDED 20260819000000_pgcron_lead_notification_worker.sql, which was also
-- never applied; that file is left in place because the workflow comment cites
-- it and the same version string appears in an unrelated market's history
-- baseline in scripts/voice-screening-migration.mjs.
--
-- Two leaks no SQL here can close, recorded because they informed the parking
-- decision: cron.job_run_details retains the TEXT of database errors raised by
-- the job, and pg_net at log level DEBUG2 or finer logs outgoing request
-- headers to the Postgres log.

do $lead_notification_worker_extensions$
begin
  if exists (select 1 from pg_available_extensions where name = 'pg_cron') then
    execute 'create extension if not exists pg_cron';
  elsif to_regclass('cron.job') is null then
    raise exception
      'pg_cron is neither installed nor available: enable it in Database > Extensions before applying';
  end if;

  if exists (select 1 from pg_available_extensions where name = 'pg_net') then
    execute 'create extension if not exists pg_net';
  elsif to_regclass('net._http_response') is null then
    raise exception
      'pg_net is neither installed nor available: enable it in Database > Extensions before applying';
  end if;
end
$lead_notification_worker_extensions$;

-- Request ledger. One row per request this worker issues, holding the pg_net
-- request id and when it was issued — no URL, no headers, no body. It exists so
-- the health view can tell this worker's responses apart from every other
-- pg_net caller's.
--
-- NOBODY gets direct privileges on it, service_role included. The earlier
-- revision granted service_role select/insert/delete; a 2026-11-26 review was
-- right that this is a hole, because hosted service_role carries BYPASSRLS, so
-- a direct grant lets it insert ids the worker never issued (changing what the
-- postgres-owned health view exposes) or delete the rows that are the only
-- evidence of a failure. The definer function owns every write, and the definer
-- view owns every read, so no role needs a grant here at all. The revoke list
-- includes service_role and runs AFTER the create, which is what neutralises a
-- project-level `alter default privileges in schema public grant ... to
-- service_role`.
create table if not exists public.lead_notification_worker_cron_requests (
  request_id bigint primary key,
  requested_at timestamptz not null default now()
);

alter table public.lead_notification_worker_cron_requests enable row level security;
revoke all on table public.lead_notification_worker_cron_requests
  from public, anon, authenticated, service_role;

create index if not exists lead_notification_worker_cron_requests_requested_at_idx
  on public.lead_notification_worker_cron_requests (requested_at desc);

comment on table public.lead_notification_worker_cron_requests is
  'pg_net request ids issued by public.invoke_lead_notification_worker(), so public.lead_notification_worker_cron_health can scope net._http_response to this worker. Pruned to 24 hours by the function itself (pg_net keeps responses ~6 hours).';
comment on column public.lead_notification_worker_cron_requests.request_id is
  'Return value of net.http_post for one scheduled worker invocation; joins net._http_response.id.';

-- Dropped by signature, not replaced: 20260819000000 declares this function
-- RETURNS void, and `create or replace` cannot change a return type.
drop function if exists public.invoke_lead_notification_worker();

create function public.invoke_lead_notification_worker()
returns bigint
language plpgsql
security definer
set search_path = pg_catalog, pg_temp
as $$
declare
  v_token text;
  v_url   constant text :=
    'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-notification-worker';
  v_request_id bigint;
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'lead_notification_worker_token';

  -- Fail loudly in cron.job_run_details instead of posting an empty Bearer
  -- header and collecting a silent 401.
  if v_token is null or length(v_token) = 0 then
    raise exception
      'lead_notification_worker_token missing from vault: owner lead notifications are NOT being retried';
  end if;

  select net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type',        'application/json',
                 'authorization',       'Bearer ' || v_token,
                 'x-frame-worker-mode', 'recover'
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  ) into v_request_id;

  -- Record the id BEFORE returning, so the health view can scope to it.
  insert into public.lead_notification_worker_cron_requests (request_id)
  values (v_request_id)
  on conflict (request_id) do nothing;

  -- Bounded window, pruned by the function itself: pg_net keeps responses for
  -- roughly six hours, so a request id older than a day can never join to a
  -- response again and the ledger cannot grow without limit.
  delete from public.lead_notification_worker_cron_requests
   where requested_at < now() - interval '24 hours';

  return v_request_id;
end;
$$;

comment on function public.invoke_lead_notification_worker() is
  'Scheduled retry of functions/v1/lead-notification-worker in recover mode. Reads the bearer token from Vault, raises when it is missing or empty, records the pg_net request id in public.lead_notification_worker_cron_requests and prunes that ledger to 24 hours. Returns the request id.';

revoke all on function public.invoke_lead_notification_worker() from public, anon, authenticated;
grant execute on function public.invoke_lead_notification_worker() to service_role;

-- Read-only health view. PARKED along with the rest of this file, and it is NOT
-- a cutover gate: a 2xx here does NOT authorise removing the GitHub schedule.
-- Anyone who can execute public.invoke_lead_notification_worker() can mint a
-- row that looks exactly like a scheduled success, so this view cannot prove
-- the SCHEDULER fired — only that the endpoint answered something for a request
-- id the ledger holds. Scheduler provenance is one of the requirements a
-- supported design would have to meet; see
-- docs/runbooks/utah-lead-notification-pgcron.md.
--
-- What it is still good for, and why it is kept: pg_cron's job_run_details only
-- proves the request was QUEUED, because pg_net is asynchronous, so without this
-- view there is no way to see what the endpoint answered at all — which is what
-- made the original unscoped version actively misleading.
--
-- security_invoker = false (a definer view owned by postgres) is deliberate. An
-- invoker view would depend on the reader's own privileges on schema net, and
-- the honest statement about those is the one in this file's header: on a stock
-- hosted project pg_net grants schema net and ALL its tables to PUBLIC, so
-- service_role DOES have effective access today — an earlier comment here
-- claimed the opposite, which was false. The definer view plus the ledger join
-- is what keeps this surface narrow regardless of those grants: it exposes only
-- responses to request ids this worker recorded, never the whole response
-- table, and no headers and no content/body column, ever.
drop view if exists public.lead_notification_worker_cron_health;

create view public.lead_notification_worker_cron_health
with (security_invoker = false) as
select r.id,
       r.created,
       r.status_code,
       r.timed_out,
       r.error_msg,
       q.requested_at,
       (r.status_code between 200 and 299) as healthy
  from public.lead_notification_worker_cron_requests q
  join net._http_response r on r.id = q.request_id
 order by r.created desc;

-- Definer semantics only hold if the owner is the privileged role, so state it
-- rather than inheriting whatever role applied the migration.
alter view public.lead_notification_worker_cron_health owner to postgres;

comment on view public.lead_notification_worker_cron_health is
  'PARKED 2026-11-26 with the rest of 20261118000000 — NOT a cutover gate. What functions/v1/lead-notification-worker answered to THIS pg_cron worker, scoped by joining net._http_response to public.lead_notification_worker_cron_requests. Definer view (security_invoker = false, owned by postgres), which keeps the surface narrow even though pg_net grants schema net to PUBLIC on a stock project. Carries no headers and no response body. A 2xx row here does NOT authorise removing the GitHub schedule: anyone who can execute the worker function can mint one, so it cannot prove the scheduler fired.';

revoke all on public.lead_notification_worker_cron_health from public, anon, authenticated;
grant select on public.lead_notification_worker_cron_health to service_role;

-- 🔴 The safety net, kept exactly as it is and NOT extended: if the bearer header in
-- net.http_request_queue or the response evidence in net._http_response is
-- readable/writable by a browser role or by PUBLIC, do not start a cron job
-- that posts that bearer every 15 minutes. pg_net v0.19.5 grants all of this to
-- PUBLIC on install (sql/pg_net.sql:355-357), so on a stock project this block
-- RAISES and nothing is scheduled. That is the end state, not a step: the
-- approach is parked, and under the CLI's migration transaction the raise rolls
-- the whole file back.
-- has_table_privilege on anon/authenticated already accounts for privileges
-- held via PUBLIC; the acl scan catches the PUBLIC grant itself even when those
-- roles do not exist (a local or self-hosted database).
do $lead_notification_worker_net_isolation$
declare
  v_role     pg_catalog.text;
  v_findings pg_catalog.text[] := array[]::pg_catalog.text[];
  v_public   pg_catalog.text[] := array[]::pg_catalog.text[];
  v_relname  pg_catalog.text;
begin
  foreach v_role in array array['anon', 'authenticated', 'service_role'] loop
    if not exists (select 1 from pg_catalog.pg_roles where rolname = v_role) then
      continue;
    end if;
    if pg_catalog.has_schema_privilege(v_role, 'net', 'USAGE') then
      if pg_catalog.has_table_privilege(v_role, 'net.http_request_queue', 'SELECT') then
        v_findings := v_findings || (v_role || ' can read the bearer header in net.http_request_queue');
      end if;
      if pg_catalog.has_table_privilege(v_role, 'net._http_response', 'INSERT')
         or pg_catalog.has_table_privilege(v_role, 'net._http_response', 'UPDATE')
         or pg_catalog.has_table_privilege(v_role, 'net._http_response', 'DELETE') then
        v_findings := v_findings || (v_role || ' can forge or delete health evidence in net._http_response');
      end if;
    end if;
  end loop;

  -- PUBLIC itself (grantee oid 0), which no role name can express.
  foreach v_relname in array array['http_request_queue', '_http_response'] loop
    if exists (
      select 1
        from pg_catalog.pg_class c
        join pg_catalog.pg_namespace n on n.oid = c.relnamespace
        cross join pg_catalog.aclexplode(c.relacl) a
       where n.nspname = 'net' and c.relname = v_relname and a.grantee = 0
    ) then
      v_public := v_public || ('net.' || v_relname);
    end if;
  end loop;
  if pg_catalog.array_length(v_public, 1) is not null then
    v_findings := v_findings
      || ('PUBLIC holds privileges on ' || pg_catalog.array_to_string(v_public, ', '));
  end if;

  if pg_catalog.array_length(v_findings, 1) is not null then
    raise exception
      'refusing to schedule the lead-notification worker: the bearer token and the health evidence are not protected (%). pg_net grants schema net and all its tables to PUBLIC on install, and on a hosted project those objects belong to supabase_admin, so this cannot be fixed from here. THIS MIGRATION IS PARKED (2026-11-26) — do not try to make it schedule. See docs/runbooks/utah-lead-notification-pgcron.md.',
      pg_catalog.array_to_string(v_findings, '; ');
  end if;
end
$lead_notification_worker_net_isolation$;

-- Same minutes-past-the-hour as the GitHub schedule it replaces (7,22,37,52),
-- so the cadence owners and dashboards expect does not change.
select cron.unschedule('lead-notification-worker')
 where exists (select 1 from cron.job where jobname = 'lead-notification-worker');

select cron.schedule(
  'lead-notification-worker',
  '7,22,37,52 * * * *',
  $$select public.invoke_lead_notification_worker();$$
);
