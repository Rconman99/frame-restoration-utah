-- Isolated-PostgreSQL contract for
-- supabase/migrations/20261118000000_pgcron_lead_notification_worker_v2.sql.
-- Runs after supabase/tests/pgcron_lead_notification_worker_fixture.sql and
-- after the migration has been applied TWICE (idempotency is part of the
-- contract). Nothing here touches a Supabase project; the synthetic database is
-- discarded with the job. Every secret value below is synthetic CI-only text.
--
-- Asserted:
--   1. objects, ownership, grants and view shape
--   2. a missing or empty Vault secret raises, loudly
--   3. one invocation issues exactly one request and records exactly its id
--   4. the health view shows only responses whose ids were recorded
--   5. anon and authenticated can reach neither the view nor the ledger
--   6. service_role can read the view with NO privilege on schema net
--   7. the view exposes no headers and no response body
--   8. the ledger is pruned to its bounded window by the function itself
--   9. the schedule and the worker-mode header are unchanged

\set ON_ERROR_STOP on

-- ------------------------------------------------- 1. objects and ownership --
do $$
declare
  v_owner text;
  v_options text;
  v_columns text;
begin
  if to_regclass('public.lead_notification_worker_cron_requests') is null then
    raise exception 'ASSERT FAILED: request ledger table missing';
  end if;
  if to_regclass('public.lead_notification_worker_cron_health') is null then
    raise exception 'ASSERT FAILED: health view missing';
  end if;

  -- Applied twice: exactly one cron job row, exactly one of each object.
  if (select count(*) from cron.job where jobname = 'lead-notification-worker') <> 1 then
    raise exception 'ASSERT FAILED: re-applying the migration did not leave exactly one cron job';
  end if;

  select pg_get_userbyid(c.relowner) into v_owner
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'lead_notification_worker_cron_health';
  if v_owner <> 'postgres' then
    raise exception 'ASSERT FAILED: health view owner is % (definer semantics need postgres)', v_owner;
  end if;

  select coalesce(array_to_string(c.reloptions, ','), '') into v_options
    from pg_class c join pg_namespace n on n.oid = c.relnamespace
   where n.nspname = 'public' and c.relname = 'lead_notification_worker_cron_health';
  if position('security_invoker=false' in v_options) = 0 then
    raise exception 'ASSERT FAILED: health view options are "%" (security_invoker=false required)', v_options;
  end if;

  -- RLS on with no policy at all: denies every non-owner role.
  if not (select relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
           where n.nspname = 'public' and c.relname = 'lead_notification_worker_cron_requests') then
    raise exception 'ASSERT FAILED: request ledger does not have row level security enabled';
  end if;
  if (select count(*) from pg_policies
       where schemaname = 'public' and tablename = 'lead_notification_worker_cron_requests') <> 0 then
    raise exception 'ASSERT FAILED: request ledger has a policy; it must deny by having none';
  end if;

  -- The function returns the request id, and was dropped/recreated rather than
  -- replaced (the 20260819000000 copy returns void).
  if (select pg_get_function_result(p.oid) from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'invoke_lead_notification_worker') <> 'bigint' then
    raise exception 'ASSERT FAILED: worker function does not return bigint';
  end if;
  if not (select p.prosecdef from pg_proc p join pg_namespace n on n.oid = p.pronamespace
           where n.nspname = 'public' and p.proname = 'invoke_lead_notification_worker') then
    raise exception 'ASSERT FAILED: worker function is not security definer';
  end if;
  if (select array_to_string(p.proconfig, ',') from pg_proc p
        join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'invoke_lead_notification_worker')
     <> 'search_path=public, vault, net, pg_temp' then
    raise exception 'ASSERT FAILED: worker function search_path is not hardened with pg_temp last';
  end if;

  -- No token literal in the shipped function body.
  if (select p.prosrc from pg_proc p join pg_namespace n on n.oid = p.pronamespace
       where n.nspname = 'public' and p.proname = 'invoke_lead_notification_worker')
     !~ 'decrypted_secret' then
    raise exception 'ASSERT FAILED: worker function does not read the token from Vault';
  end if;

  select string_agg(column_name, ',' order by ordinal_position) into v_columns
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lead_notification_worker_cron_health';
  if v_columns <> 'id,created,status_code,timed_out,error_msg,requested_at,healthy' then
    raise exception 'ASSERT FAILED: health view columns are "%"', v_columns;
  end if;
end
$$;

-- ----------------------------------- 7. no headers / content on the surface --
do $$
declare v_bad text;
begin
  select string_agg(column_name, ',') into v_bad
    from information_schema.columns
   where table_schema = 'public' and table_name = 'lead_notification_worker_cron_health'
     and column_name in ('headers', 'content', 'content_type', 'body', 'authorization', 'secret');
  if v_bad is not null then
    raise exception 'ASSERT FAILED: health view exposes %', v_bad;
  end if;
  if (select pg_get_viewdef('public.lead_notification_worker_cron_health'::regclass))
       ~* '\m(headers|content|content_type)\M' then
    raise exception 'ASSERT FAILED: health view definition reaches a header/content column';
  end if;
  -- The ledger holds no request detail either.
  if (select string_agg(column_name, ',' order by ordinal_position) from information_schema.columns
       where table_schema = 'public' and table_name = 'lead_notification_worker_cron_requests')
     <> 'request_id,requested_at' then
    raise exception 'ASSERT FAILED: request ledger carries more than the id and its timestamp';
  end if;
end
$$;

-- --------------------------------------------- 2. missing/empty secret raises --
do $$
declare v_msg text; v_raised boolean := false;
begin
  begin
    perform public.invoke_lead_notification_worker();
  exception when others then
    v_msg := sqlerrm;
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: a missing Vault secret did not raise';
  end if;
  if position('lead_notification_worker_token missing from vault' in v_msg) = 0 then
    raise exception 'ASSERT FAILED: wrong error for a missing secret: %', v_msg;
  end if;
  if (select count(*) from net.http_request_queue) <> 0 then
    raise exception 'ASSERT FAILED: a request was issued without a token';
  end if;
  if (select count(*) from public.lead_notification_worker_cron_requests) <> 0 then
    raise exception 'ASSERT FAILED: a request id was recorded without a token';
  end if;
end
$$;

insert into vault.secrets (name, secret, description)
values ('lead_notification_worker_token', '', 'synthetic CI-only empty value');

do $$
declare v_msg text; v_raised boolean := false;
begin
  begin
    perform public.invoke_lead_notification_worker();
  exception when others then
    v_msg := sqlerrm;
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: an empty Vault secret did not raise';
  end if;
  if position('lead_notification_worker_token missing from vault' in v_msg) = 0 then
    raise exception 'ASSERT FAILED: wrong error for an empty secret: %', v_msg;
  end if;
end
$$;

update vault.secrets
   set secret = 'synthetic-ci-only-worker-token'
 where name = 'lead_notification_worker_token';

-- ------------------------------------- 3. one invocation, one recorded request --
do $$
declare v_request_id bigint; v_queued bigint;
begin
  v_request_id := public.invoke_lead_notification_worker();

  if (select count(*) from net.http_request_queue) <> 1 then
    raise exception 'ASSERT FAILED: one invocation issued % requests',
      (select count(*) from net.http_request_queue);
  end if;
  if (select count(*) from public.lead_notification_worker_cron_requests) <> 1 then
    raise exception 'ASSERT FAILED: one invocation recorded % ids',
      (select count(*) from public.lead_notification_worker_cron_requests);
  end if;

  select id into v_queued from net.http_request_queue;
  if v_queued <> v_request_id then
    raise exception 'ASSERT FAILED: queued id % is not the returned id %', v_queued, v_request_id;
  end if;
  if not exists (select 1 from public.lead_notification_worker_cron_requests
                  where request_id = v_request_id) then
    raise exception 'ASSERT FAILED: the issued request id was not recorded';
  end if;

  -- 9. the worker-mode header and the endpoint are unchanged.
  if (select headers ->> 'x-frame-worker-mode' from net.http_request_queue) <> 'recover' then
    raise exception 'ASSERT FAILED: the request does not carry x-frame-worker-mode: recover';
  end if;
  if (select url from net.http_request_queue)
     <> 'https://hdcflshhomzildwqlmwh.supabase.co/functions/v1/lead-notification-worker' then
    raise exception 'ASSERT FAILED: the request does not target the Utah worker endpoint';
  end if;
  if (select headers ->> 'authorization' from net.http_request_queue) !~ '^Bearer .+' then
    raise exception 'ASSERT FAILED: the request carries no bearer header';
  end if;
end
$$;

-- ---------------------------------------------------- 4. the view is scoped --
do $$
declare v_recorded bigint; v_rows integer; v_id bigint; v_healthy boolean;
begin
  select request_id into v_recorded from public.lead_notification_worker_cron_requests;

  -- This worker's response, plus an unrelated pg_net caller's 2xx response that
  -- must never appear in the view. The unscoped original would have shown both.
  insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg)
  values (v_recorded, 200, 'application/json',
          '{"x-should-never-surface": "1"}'::jsonb, '{"healthy":true}', false, null);
  insert into net._http_response (id, status_code, content_type, headers, content, timed_out, error_msg)
  values (987654321, 200, 'application/json',
          '{"x-should-never-surface": "1"}'::jsonb, '{"someone":"else"}', false, null);

  select count(*) into v_rows from public.lead_notification_worker_cron_health;
  if v_rows <> 1 then
    raise exception 'ASSERT FAILED: the health view returned % rows; it must show only recorded ids', v_rows;
  end if;

  select id, healthy into v_id, v_healthy from public.lead_notification_worker_cron_health;
  if v_id <> v_recorded then
    raise exception 'ASSERT FAILED: the health view returned id % instead of %', v_id, v_recorded;
  end if;
  if not v_healthy then
    raise exception 'ASSERT FAILED: a 2xx for this worker is not reported healthy';
  end if;
  if exists (select 1 from public.lead_notification_worker_cron_health where id = 987654321) then
    raise exception 'ASSERT FAILED: an unrelated pg_net response leaked into the health view';
  end if;

  -- A non-2xx for this worker is reported unhealthy; the go/no-go must be able
  -- to fail as well as pass.
  update net._http_response set status_code = 503 where id = v_recorded;
  if (select healthy from public.lead_notification_worker_cron_health) then
    raise exception 'ASSERT FAILED: a 503 for this worker is reported healthy';
  end if;
  update net._http_response set status_code = 200 where id = v_recorded;
end
$$;

-- --------------------------- 5/6. who may read it, and without net privileges --
do $$
begin
  if has_schema_privilege('service_role', 'net', 'USAGE') then
    raise exception 'ASSERT FAILED: the fixture granted service_role USAGE on schema net; the contract is that it needs none';
  end if;
  if has_table_privilege('service_role', 'net._http_response', 'SELECT') then
    raise exception 'ASSERT FAILED: service_role has SELECT on net._http_response; the contract is that it needs none';
  end if;
  if not has_table_privilege('service_role', 'public.lead_notification_worker_cron_health', 'SELECT') then
    raise exception 'ASSERT FAILED: service_role cannot select the health view';
  end if;

  for i in 1..2 loop
    declare
      v_role text := (array['anon', 'authenticated'])[i];
    begin
      if has_table_privilege(v_role, 'public.lead_notification_worker_cron_health', 'SELECT') then
        raise exception 'ASSERT FAILED: % can select the health view', v_role;
      end if;
      if has_table_privilege(v_role, 'public.lead_notification_worker_cron_requests', 'SELECT') then
        raise exception 'ASSERT FAILED: % can select the request ledger', v_role;
      end if;
      if has_function_privilege(v_role, 'public.invoke_lead_notification_worker()', 'EXECUTE') then
        raise exception 'ASSERT FAILED: % can execute the worker function', v_role;
      end if;
    end;
  end loop;
end
$$;

-- anon is refused at run time, not just on paper.
set role anon;
do $$
declare v_raised boolean := false;
begin
  begin
    perform 1 from public.lead_notification_worker_cron_health;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: anon read the health view';
  end if;
  v_raised := false;
  begin
    perform 1 from public.lead_notification_worker_cron_requests;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: anon read the request ledger';
  end if;
end
$$;
reset role;

set role authenticated;
do $$
declare v_raised boolean := false;
begin
  begin
    perform 1 from public.lead_notification_worker_cron_health;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: authenticated read the health view';
  end if;
end
$$;
reset role;

-- service_role reads the view with no grant anywhere in schema net.
set role service_role;
do $$
declare v_rows integer; v_raised boolean := false;
begin
  select count(*) into v_rows from public.lead_notification_worker_cron_health;
  if v_rows <> 1 then
    raise exception 'ASSERT FAILED: service_role sees % rows in the health view', v_rows;
  end if;
  -- ...and still cannot reach the underlying pg_net table directly.
  begin
    perform 1 from net._http_response;
  exception when others then
    v_raised := true;
  end;
  if not v_raised then
    raise exception 'ASSERT FAILED: service_role reached net._http_response directly';
  end if;
end
$$;
reset role;

-- --------------------------------------------------- 8. the bounded window --
do $$
declare v_request_id bigint;
begin
  insert into public.lead_notification_worker_cron_requests (request_id, requested_at)
  values (111111111, now() - interval '48 hours');

  v_request_id := public.invoke_lead_notification_worker();

  if exists (select 1 from public.lead_notification_worker_cron_requests where request_id = 111111111) then
    raise exception 'ASSERT FAILED: the function did not prune its ledger to the bounded window';
  end if;
  if not exists (select 1 from public.lead_notification_worker_cron_requests where request_id = v_request_id) then
    raise exception 'ASSERT FAILED: pruning removed the request it had just recorded';
  end if;
end
$$;

-- --------------------------------------------------------- 9. the schedule --
do $$
declare v_schedule text; v_command text;
begin
  select schedule, command into v_schedule, v_command
    from cron.job where jobname = 'lead-notification-worker';
  if v_schedule <> '7,22,37,52 * * * *' then
    raise exception 'ASSERT FAILED: schedule is "%"', v_schedule;
  end if;
  if v_command !~ 'public\.invoke_lead_notification_worker\(\)' then
    raise exception 'ASSERT FAILED: cron command is "%"', v_command;
  end if;
end
$$;

select 'pgcron lead-notification worker contract: all assertions passed' as result;
