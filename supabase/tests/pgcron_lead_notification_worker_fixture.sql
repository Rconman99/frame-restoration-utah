-- Minimal synthetic stubs for the three extension schemas
-- supabase/migrations/20261118000000_pgcron_lead_notification_worker_v2.sql
-- touches, so its contract can be exercised on a throwaway postgres:16-alpine
-- with neither pg_cron nor pg_net installed. Same pattern as
-- supabase/tests/ai_referrer_tagging_fixture.sql: nothing here is production
-- SQL, nothing here is applied to any project, and the database is discarded
-- with the job.
--
-- The stubs mirror the real signatures the migration depends on:
--   cron.job / cron.schedule(text,text,text) / cron.unschedule(text)
--   net._http_response / net.http_request_queue / net.http_post(...)
--   vault.secrets / vault.decrypted_secrets
-- The migration's guarded extension block skips `create extension` because
-- pg_available_extensions lists neither pg_cron nor pg_net here, and does not
-- raise because cron.job and net._http_response both exist by then.

-- Browser + server roles, as they exist on a Supabase project. Deliberately NO
-- grant on schema net to service_role: proving the health view works without
-- one is the point of this contract.
do $$
begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then
    create role anon nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin noinherit;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then
    create role service_role nologin noinherit;
  end if;
end
$$;

grant usage on schema public to anon, authenticated, service_role;

-- ---------------------------------------------------------------- cron stub --
create schema if not exists cron;

create table if not exists cron.job (
  jobid bigserial primary key,
  jobname text unique,
  schedule text not null,
  command text not null
);

create or replace function cron.schedule(job_name text, schedule text, command text)
returns bigint
language plpgsql
as $$
declare v_jobid bigint;
begin
  insert into cron.job (jobname, schedule, command)
  values (job_name, schedule, command)
  on conflict (jobname) do update
    set schedule = excluded.schedule, command = excluded.command
  returning jobid into v_jobid;
  return v_jobid;
end;
$$;

create or replace function cron.unschedule(job_name text)
returns boolean
language plpgsql
as $$
begin
  delete from cron.job where jobname = job_name;
  return true;
end;
$$;

-- ----------------------------------------------------------------- net stub --
create schema if not exists net;

create table if not exists net._http_response (
  id bigint primary key,
  status_code integer,
  content_type text,
  headers jsonb,
  content text,
  timed_out boolean,
  error_msg text,
  created timestamptz not null default now()
);

create table if not exists net.http_request_queue (
  id bigint primary key,
  method text not null,
  url text not null,
  headers jsonb,
  body jsonb,
  timeout_milliseconds integer
);

create sequence if not exists net.request_id_seq;

-- Same parameter names and defaults as pg_net, so the migration's named-argument
-- call resolves exactly as it would in production. It queues instead of sending.
create or replace function net.http_post(
  url text,
  body jsonb default '{}'::jsonb,
  params jsonb default '{}'::jsonb,
  headers jsonb default '{"Content-Type": "application/json"}'::jsonb,
  timeout_milliseconds integer default 5000
)
returns bigint
language plpgsql
as $$
declare v_id bigint;
begin
  v_id := nextval('net.request_id_seq');
  insert into net.http_request_queue (id, method, url, headers, body, timeout_milliseconds)
  values (v_id, 'POST', url, headers, body, timeout_milliseconds);
  return v_id;
end;
$$;

-- --------------------------------------------------------------- vault stub --
create schema if not exists vault;

create table if not exists vault.secrets (
  id uuid primary key default gen_random_uuid(),
  name text unique,
  secret text,
  description text
);

create or replace view vault.decrypted_secrets as
  select id, name, description, secret as decrypted_secret from vault.secrets;
