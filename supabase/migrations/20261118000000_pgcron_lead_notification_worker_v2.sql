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
-- TOKEN EXPOSURE, inherent to pg_net and NOT fixed by this migration: the
-- Authorization header of each request sits in net.http_request_queue (and, for
-- requests pg_net could not complete, in its failed-request table) until pg_net
-- drains the queue. Those tables are in schema net, which is not reachable by
-- anon/authenticated/service_role; only a role with net access (postgres) can
-- read them. Nothing in this migration selects, copies or exposes a header or a
-- response body — the health view deliberately carries no headers and no
-- content column.
--
-- ROLLBACK:
--   select cron.unschedule('lead-notification-worker');
--   drop view if exists public.lead_notification_worker_cron_health;
--   drop function if exists public.invoke_lead_notification_worker();
--   drop table if exists public.lead_notification_worker_cron_requests;
--   -- then restore the 15-minute schedule in
--   -- .github/workflows/lead-notification-worker.yml (the repo must be public
--   -- again, or have minutes, for that to be free).

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
-- pg_net caller's. Private like every other Utah table: RLS on with no policy
-- at all (which denies every non-owner role) and browser roles revoked.
create table if not exists public.lead_notification_worker_cron_requests (
  request_id bigint primary key,
  requested_at timestamptz not null default now()
);

alter table public.lead_notification_worker_cron_requests enable row level security;
revoke all on table public.lead_notification_worker_cron_requests from public, anon, authenticated;
grant select, insert, delete on table public.lead_notification_worker_cron_requests to service_role;

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
set search_path = public, vault, net, pg_temp
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

-- Same minutes-past-the-hour as the GitHub schedule it replaces (7,22,37,52),
-- so the cadence owners and dashboards expect does not change.
select cron.unschedule('lead-notification-worker')
 where exists (select 1 from cron.job where jobname = 'lead-notification-worker');

select cron.schedule(
  'lead-notification-worker',
  '7,22,37,52 * * * *',
  $$select public.invoke_lead_notification_worker();$$
);
