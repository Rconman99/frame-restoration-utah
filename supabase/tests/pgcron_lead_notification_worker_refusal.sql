-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Runs after 20261118000000 has been attempted with `psql -1` on top of
-- pgcron_lead_notification_worker_upstream_grants.sql and has FAILED (the
-- workflow asserts the non-zero exit). `-1` is what the Supabase CLI's own
-- migration transaction does, so this is the real end state: the refusal rolls
-- the WHOLE file back. Nothing is scheduled, and no object is left behind.
--
-- An earlier revision of this file asserted the opposite — that the ledger
-- would survive because the gate sits just before cron.schedule. That is only
-- true under a bare `psql -f` without -1, and it is corrected here.

\set ON_ERROR_STOP on

do $$
declare v_jobs integer;
begin
  select count(*) into v_jobs from cron.job where jobname = 'lead-notification-worker';
  if v_jobs <> 0 then
    raise exception
      'ASSERT FAILED: the migration raised on unprotected pg_net grants but still left % cron job(s) scheduled', v_jobs;
  end if;

  -- Full rollback: under one transaction the refusal undoes the whole file, so
  -- NONE of its objects may exist.
  if to_regclass('public.lead_notification_worker_cron_requests') is not null then
    raise exception 'ASSERT FAILED: the ledger survived a refused single-transaction apply';
  end if;
  if to_regclass('public.lead_notification_worker_cron_health') is not null then
    raise exception 'ASSERT FAILED: the health view survived a refused single-transaction apply';
  end if;
  if to_regprocedure('public.invoke_lead_notification_worker()') is not null then
    raise exception 'ASSERT FAILED: the worker function survived a refused single-transaction apply';
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

select 'pgcron worker refuses to schedule and rolls back fully while pg_net grants PUBLIC access' as result;
