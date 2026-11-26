-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Runs after 20261118000000 has been applied on top of
-- pgcron_lead_notification_worker_upstream_grants.sql and has FAILED (the
-- workflow asserts the non-zero exit). This proves the failure was fail-closed:
-- the worker is not scheduled, so nothing is posting a bearer token every
-- fifteen minutes into a database where PUBLIC can read it back out of
-- net.http_request_queue.

\set ON_ERROR_STOP on

do $$
declare v_jobs integer;
begin
  select count(*) into v_jobs from cron.job where jobname = 'lead-notification-worker';
  if v_jobs <> 0 then
    raise exception
      'ASSERT FAILED: the migration raised on unprotected pg_net grants but still left % cron job(s) scheduled', v_jobs;
  end if;

  -- The refusal happens after the objects are created (the gate sits
  -- immediately before cron.schedule), which is deliberate: creating a table,
  -- a function and a view schedules nothing and posts nothing. What must not
  -- exist is the job.
  if to_regclass('public.lead_notification_worker_cron_requests') is null then
    raise exception 'ASSERT FAILED: expected the ledger to exist; the gate is meant to sit just before cron.schedule';
  end if;

  -- And the refusal must name the reason, not just fail. The workflow captures
  -- the message; here we assert the privileges it complained about are really
  -- present, so a future pg_net release that drops them turns this test red
  -- instead of silently passing.
  if not exists (
    select 1
      from pg_catalog.pg_class c
      join pg_catalog.pg_namespace n on n.oid = c.relnamespace
      cross join pg_catalog.aclexplode(c.relacl) a
     where n.nspname = 'net' and c.relname = 'http_request_queue' and a.grantee = 0
  ) then
    raise exception 'ASSERT FAILED: the upstream-grants fixture did not actually grant net.http_request_queue to PUBLIC';
  end if;
end
$$;

select 'pgcron worker refuses to schedule while pg_net grants PUBLIC access' as result;
