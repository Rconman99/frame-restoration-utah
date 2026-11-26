-- Utah lead-notification recovery: move the 15-minute cadence from GitHub
-- Actions (GitHub-hosted, ~2,660 billed min/30 days) onto pg_cron + pg_net so
-- frame-restoration-utah can go private without Actions overage or a gap in
-- owner lead alerts.
--
-- EDITED IN PLACE 2026-11-26, BEFORE ITS FIRST APPLY. This file has never been
-- applied anywhere (pg_cron/pg_net are not verified enabled on this project and
-- nothing in CI applies migrations), so there is no recorded history row for
-- version 20261118000000 to contradict and no deployed schema that depends on
-- the previous text. It is edited rather than superseded by a v3 so that the
-- only reference to it outside this file — the comment in
-- .github/workflows/lead-notification-worker.yml, which names 20261118000000 as
-- the job that must be applied and seen 2xx before the GitHub schedule may be
-- cut — stays accurate with that workflow untouched. Three defects a review
-- confirmed on 2026-11-26 are fixed here:
--
--   1. The health view selected EVERY row of net._http_response with no
--      scoping, so a 2xx in it did not prove THIS worker succeeded — and that
--      view is the stated go/no-go for cutting the GitHub schedule. The
--      function now records each request id it issues in
--      public.lead_notification_worker_cron_requests and the view joins
--      net._http_response to that table, so it can only ever show this
--      worker's own responses.
--   2. The view was security_invoker = true, so service_role — its only
--      grantee — needed SELECT on net._http_response, which Supabase does not
--      grant by default; the view would most likely have errored for the one
--      role meant to read it. It is now a definer view
--      (security_invoker = false, owned by postgres) restricted by the join, so
--      service_role reads it with no privilege on schema net at all.
--   3. 20260819000000_pgcron_lead_notification_worker.sql declares
--      public.invoke_lead_notification_worker() as RETURNS void. A plain
--      `create or replace` cannot change a function's return type, so applying
--      that older file first and this one second would have ERRORED rather than
--      replacing the function, contrary to this file's own earlier claim. The
--      function is now dropped by signature before it is created.
--
-- SUPERSEDES 20260819000000_pgcron_lead_notification_worker.sql, which was never
-- applied in production (pg_cron/pg_net were not installed as of 2026-11-17) and
-- which would NOT have worked: it posted without the `x-frame-worker-mode`
-- header, and lead-notification-worker rejects any request whose mode is not
-- `recover` or `health-only`. If both files are applied in order, this one now
-- really does replace the function and the job, so the end state is the same.
-- That file is intentionally left in place: the workflow comment cites it too,
-- and `scripts/voice-screening-migration.mjs` carries the same version string in
-- an unrelated market's history baseline.
--
-- PREREQUISITES (owner-approved, out of band, BEFORE applying):
--   1. Database > Extensions: enable pg_cron and pg_net (both bundled with
--      Supabase at no extra charge; this project is on the Pro org plan). The
--      guarded block below creates them when they are installable and raises
--      when they are neither installed nor available, so an apply can never
--      leave the job silently unscheduled.
--   2. Store the worker token in Supabase Vault ONCE (same value as the
--      LEAD_NOTIFICATION_WORKER_TOKEN GitHub secret / edge-function secret):
--        select vault.create_secret('<token>', 'lead_notification_worker_token',
--               'Bearer token for functions/v1/lead-notification-worker');
--      Never paste the token into chat, a PR, or this file.
--   3. Read-only grant check to run FIRST (see
--      docs/runbooks/utah-lead-notification-pgcron.md): confirm that
--      service_role has no USAGE on schema net and no SELECT on
--      net._http_response. That is the normal Supabase state, and it is exactly
--      why the health view must be a definer view.
--
-- 🔴 TOKEN EXPOSURE. An earlier revision of this file claimed schema net "is
-- not reachable by anon/authenticated/service_role". THAT WAS FALSE for real
-- pg_net defaults, and a 2026-11-26 review was right to reject it. pg_net
-- v0.19.5's own installation script ends with (sql/pg_net.sql:355-357):
--     grant usage on schema net to PUBLIC;
--     grant all on all sequences in schema net to PUBLIC;
--     grant all on all tables in schema net to PUBLIC;
-- so after `create extension pg_net` every role — anon and authenticated
-- included, because they are members of PUBLIC — can SELECT
-- net.http_request_queue, which holds this worker's `Authorization: Bearer …`
-- header until the background worker drains it, and can INSERT/UPDATE/DELETE
-- net._http_response, which is the only evidence the health view reports on.
-- Also: pg_net keeps exactly two tables (http_request_queue and
-- _http_response). There is NO separate failed-request table — a failure lands
-- in _http_response with error_msg/timed_out. The earlier claim of one was
-- wrong and is corrected here.
--
-- So this migration no longer asserts isolation; it VERIFIES it and refuses to
-- schedule without it. The guarded block below the view raises unless anon,
-- authenticated and PUBLIC all lack queue-read and response-write access. The
-- remediation, which is an owner decision because it changes an extension's
-- objects and affects every other pg_net consumer on the project, is in
-- docs/runbooks/utah-lead-notification-pgcron.md.
--
-- Browser reachability is a second, narrower question: PostgREST only exposes
-- the schemas listed in the API settings, and `net` is not one of them by
-- default. The privilege is still the thing that matters — anything running as
-- anon/authenticated/service_role inside the database (a security-invoker view
-- or function in public, an edge function using the service key) can read the
-- queue while that grant stands.
--
-- Two further leaks that no SQL here can close, documented so nobody assumes
-- otherwise: cron.job_run_details retains the TEXT of database errors raised by
-- the job (including anything this function puts in an exception message — it
-- puts no token there), and pg_net at log level DEBUG2 or finer logs outgoing
-- request headers to the Postgres log.
--
-- ROLLBACK:
--   select cron.unschedule('lead-notification-worker');
--   drop view if exists public.lead_notification_worker_cron_health;
--   drop function if exists public.invoke_lead_notification_worker();
--   drop table if exists public.lead_notification_worker_cron_requests;
--   -- then restore the 15-minute schedule in
--   -- .github/workflows/lead-notification-worker.yml (the repo must be public
--   -- again, or have minutes, for that to be free).
--   -- NOTE: this rollback drops the objects but does NOT remove the
--   -- supabase_migrations.schema_migrations row for 20261118000000, because
--   -- only the gated runner that applied it may touch history. To restore
--   -- afterwards, delete that history row in the SAME transaction as the drops
--   -- (so catalog and history stay in agreement) and re-apply through the
--   -- runner; a re-apply with the row still present would be skipped as
--   -- already-applied and leave nothing scheduled. See the runbook.

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

-- Read-only health view: the worker answers non-2xx when notifications are in a
-- terminal or stale state, exactly like the GitHub run used to fail. pg_cron's
-- job_run_details only proves the request was QUEUED, because pg_net is
-- asynchronous; this view shows what the worker actually answered — and, by
-- joining the request ledger, ONLY what this worker answered.
--
-- security_invoker = false (a definer view owned by postgres) is deliberate and
-- is the point: service_role is the only grantee and Supabase does not give it
-- USAGE on schema net or SELECT on net._http_response, so an invoker view would
-- error for its one reader. The join is the restriction: a definer view that
-- exposed net._http_response unscoped would hand service_role every pg_net
-- caller's responses. No headers and no content/body column is exposed here,
-- ever.
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
  'What functions/v1/lead-notification-worker answered to THIS pg_cron worker, scoped by joining net._http_response to public.lead_notification_worker_cron_requests. Definer view (security_invoker = false, owned by postgres) so service_role needs no privilege on schema net. Carries no headers and no response body. A 2xx row here is the go/no-go for cutting the GitHub schedule.';

revoke all on public.lead_notification_worker_cron_health from public, anon, authenticated;
grant select on public.lead_notification_worker_cron_health to service_role;

-- 🔴 Fail closed BEFORE scheduling anything: if the bearer header in
-- net.http_request_queue or the response evidence in net._http_response is
-- readable/writable by a browser role or by PUBLIC, do not start a cron job
-- that posts that bearer every 15 minutes. pg_net v0.19.5 grants all of this to
-- PUBLIC on install (sql/pg_net.sql:355-357), so on a stock project this block
-- RAISES and nothing is scheduled until the owner has revoked those grants.
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
      'refusing to schedule the lead-notification worker: the bearer token and the health evidence are not protected (%). pg_net grants schema net and all its tables to PUBLIC on install. Remediation is an owner decision because it affects every pg_net consumer on this project — see docs/runbooks/utah-lead-notification-pgcron.md.',
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
