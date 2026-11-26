-- Utah lead-notification recovery: move the 15-minute cadence from GitHub
-- Actions (GitHub-hosted, ~2,660 billed min/30 days) onto pg_cron + pg_net so
-- frame-restoration-utah can go private without Actions overage or a gap in
-- owner lead alerts.
--
-- SUPERSEDES 20260819000000_pgcron_lead_notification_worker.sql, which was never
-- applied in production (pg_cron/pg_net were not installed as of 2026-11-17) and
-- which would NOT have worked: it posted without the `x-frame-worker-mode`
-- header, and lead-notification-worker rejects any request whose mode is not
-- `recover` or `health-only`. If both files are applied in order, this one
-- replaces the function and the job, so the end state is the same.
--
-- PREREQUISITES (owner-approved, out of band, BEFORE applying):
--   1. Database > Extensions: enable pg_cron and pg_net (both bundled with
--      Supabase at no extra charge; this project is on the Pro org plan).
--      The `create extension if not exists` lines below do the same thing.
--   2. Store the worker token in Supabase Vault ONCE (same value as the
--      LEAD_NOTIFICATION_WORKER_TOKEN GitHub secret / edge-function secret):
--        select vault.create_secret('<token>', 'lead_notification_worker_token',
--               'Bearer token for functions/v1/lead-notification-worker');
--      Never paste the token into chat, a PR, or this file.
--
-- ROLLBACK:  select cron.unschedule('lead-notification-worker');
--            and restore the 15-minute schedule in
--            .github/workflows/lead-notification-worker.yml (the repo must be
--            public again, or have minutes, for that to be free).

create extension if not exists pg_cron;
create extension if not exists pg_net;

create or replace function public.invoke_lead_notification_worker()
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

  return v_request_id;
end;
$$;

revoke all on function public.invoke_lead_notification_worker() from public, anon, authenticated;
grant execute on function public.invoke_lead_notification_worker() to service_role;

-- Read-only health view: the worker answers non-2xx when notifications are in a
-- terminal or stale state, exactly like the GitHub run used to fail. pg_net is
-- asynchronous, so cron.job_run_details only proves the request was QUEUED; this
-- view shows what the worker actually answered. pg_net keeps responses ~6 hours.
create or replace view public.lead_notification_worker_cron_health
with (security_invoker = true) as
select r.id,
       r.created,
       r.status_code,
       r.timed_out,
       r.error_msg,
       (r.status_code between 200 and 299) as healthy
  from net._http_response as r
 order by r.created desc;

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
