-- Move the lead-notification-worker schedule off GitHub Actions onto pg_cron.
--
-- WHY: .github/workflows/lead-notification-worker.yml runs every 10 minutes and
-- its body is one curl to this project's own edge function. GitHub bills a
-- 1-MINUTE MINIMUM per job, rounded up, and the job averages 8 seconds — so it
-- costs 4,320 billed minutes/month to fire 4,320 HTTP requests. This is the
-- single largest consumer of the Actions allowance across all Frame repos, and
-- with Texas's notify-retry (1,440/mo) it is what tripped the spending limit.
--
-- Note the authorization header differs from Texas: this endpoint takes a
-- Bearer token, not an x-retry-token header.
--
-- ROLLBACK: select cron.unschedule('lead-notification-worker');
--           then re-enable the GitHub workflow.

create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The worker token is a SECRET and is deliberately NOT in this file. It lives in
-- Supabase Vault and must be created ONCE, out of band, before this schedule can
-- succeed:
--
--   select vault.create_secret('<token>', 'lead_notification_worker_token',
--                              'Bearer token for functions/v1/lead-notification-worker');
--
-- Same value as the LEAD_NOTIFICATION_WORKER_TOKEN GitHub secret.

-- Wrapper so a missing secret FAILS LOUDLY in cron.job_run_details rather than
-- posting an empty Bearer header and collecting a silent 401. Owner lead
-- notifications run through this path — a silently dead worker means a real
-- customer enquiry reaches nobody, and nothing would surface it.
create or replace function public.invoke_lead_notification_worker()
returns void
language plpgsql
security definer
set search_path = public, vault, net
as $$
declare
  v_token text;
  v_url   text := 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-notification-worker';
begin
  select decrypted_secret into v_token
    from vault.decrypted_secrets
   where name = 'lead_notification_worker_token';

  if v_token is null or length(v_token) = 0 then
    raise exception
      'lead_notification_worker_token missing from vault — owner lead notifications are NOT running. Create it with vault.create_secret().';
  end if;

  perform net.http_post(
    url     := v_url,
    headers := jsonb_build_object(
                 'content-type',  'application/json',
                 'authorization', 'Bearer ' || v_token
               ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 30000
  );
end;
$$;

revoke all on function public.invoke_lead_notification_worker() from public, anon, authenticated;

-- Same cadence as the workflow it replaces.
select cron.unschedule('lead-notification-worker')
 where exists (select 1 from cron.job where jobname = 'lead-notification-worker');

select cron.schedule('lead-notification-worker', '*/10 * * * *',
                     $$select public.invoke_lead_notification_worker();$$);
