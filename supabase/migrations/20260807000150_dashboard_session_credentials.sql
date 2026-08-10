-- Additive credential transition for the Utah dashboard.
--
-- Safe rollout order:
--   1. apply this additive migration;
--   2. deploy session-token-aware lead-crm + weekly-report functions;
--   3. rotate or progressively migrate every legacy plaintext PIN;
--   4. apply the separately gated cutover at
--      supabase/cutovers/20260807000200_live_dashboard_security_remediation.sql
--      only after its zero-plaintext guard passes.

alter table public.report_access
  add column if not exists pin_hash text,
  add column if not exists session_version integer not null default 1;

-- Existing rows retain their legacy value during the bounded transition. New
-- and reset credentials are hash-only, so `pin` must allow NULL.
alter table public.report_access
  alter column pin drop not null;

create unique index if not exists report_access_pin_hash_key
  on public.report_access (pin_hash)
  where pin_hash is not null;

do $constraints$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access'::regclass
      and conname = 'report_access_credential_present_check'
  ) then
    alter table public.report_access
      add constraint report_access_credential_present_check
      check (pin_hash is not null or pin is not null);
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access'::regclass
      and conname = 'report_access_pin_hash_format_check'
  ) then
    alter table public.report_access
      add constraint report_access_pin_hash_format_check
      check (pin_hash is null or pin_hash ~ '^[0-9a-f]{64}$');
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access'::regclass
      and conname = 'report_access_session_version_check'
  ) then
    alter table public.report_access
      add constraint report_access_session_version_check
      check (session_version between 1 and 2147483647);
  end if;
end
$constraints$;

comment on column public.report_access.pin_hash is
  'HMAC-SHA-256 credential digest created by Edge Functions with DASHBOARD_CREDENTIAL_PEPPER; never expose through browser PostgREST.';
comment on column public.report_access.pin is
  'Legacy plaintext transition column. Must be NULL for every row before the live dashboard RLS remediation is applied.';
comment on column public.report_access.session_version is
  'Server-owned bearer-session revocation version. Credential resets, legacy credential migration, and active-state transitions increment it atomically.';

-- Credential changes and active-state transitions are database-owned so the
-- security mutation and session revocation cannot be separated by a race. The
-- scalar result is the new/current version; NULL means the target did not
-- exist (or a legacy credential changed before migration completed).
create or replace function public.authenticate_dashboard_access(
  p_pin text,
  p_pin_hash text
)
returns table (
  access_id uuid,
  access_name text,
  access_role text,
  access_active boolean,
  access_session_version integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_match_count integer;
  v_id uuid;
  v_name text;
  v_role text;
  v_active boolean;
  v_session_version integer;
  v_legacy_pin text;
begin
  if p_pin is null or p_pin !~ '^[A-Za-z0-9_-]{4,32}$'
    or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid dashboard authentication credential';
  end if;

  -- One POST-body RPC handles both hash lookup and the bounded legacy
  -- transition. Never place plaintext PINs or their HMACs in PostgREST filter
  -- URLs, where gateway or request logs could retain them.
  perform pg_catalog.pg_advisory_xact_lock(1579608555);

  select count(*)::integer
    into v_match_count
  from public.report_access
  where pin = p_pin or pin_hash = p_pin_hash;

  if v_match_count = 0 then
    return;
  end if;
  if v_match_count <> 1 then
    raise exception using
      errcode = '21000',
      message = 'ambiguous dashboard credential';
  end if;

  select id, name, role, active, session_version, pin
    into v_id, v_name, v_role, v_active, v_session_version, v_legacy_pin
  from public.report_access
  where pin = p_pin or pin_hash = p_pin_hash
  for update;

  if not coalesce(v_active, false) then
    return;
  end if;

  if v_legacy_pin is not null then
    update public.report_access
    set
      pin = null,
      pin_hash = p_pin_hash,
      session_version = session_version + 1,
      last_accessed = clock_timestamp()
    where id = v_id
    returning name, role, active, session_version
      into v_name, v_role, v_active, v_session_version;
  else
    update public.report_access
    set last_accessed = clock_timestamp()
    where id = v_id
    returning name, role, active, session_version
      into v_name, v_role, v_active, v_session_version;
  end if;

  return query
  select v_id, v_name, v_role, v_active, v_session_version;
end;
$$;

create or replace function public.create_dashboard_access(
  p_name text,
  p_role text,
  p_pin text,
  p_pin_hash text
)
returns uuid
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_id uuid;
begin
  if p_name is null or char_length(pg_catalog.btrim(p_name)) not between 1 and 120
    or p_role is null or p_role not in ('viewer', 'sales', 'admin')
    or p_pin is null or p_pin !~ '^[0-9]{6,12}$'
    or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid dashboard access credential';
  end if;

  -- Serialize all cross-column credential mutations. A unique index cannot
  -- detect the transitional case where another row still holds the same
  -- credential in plaintext while this row would store its HMAC.
  perform pg_catalog.pg_advisory_xact_lock(1579608555);
  if exists (
    select 1
    from public.report_access
    where pin = p_pin or pin_hash = p_pin_hash
  ) then
    raise exception using
      errcode = '23505',
      message = 'dashboard credential already in use';
  end if;

  insert into public.report_access (name, pin, pin_hash, role, active)
  values (pg_catalog.btrim(p_name), null, p_pin_hash, p_role, true)
  returning id into v_id;

  return v_id;
end;
$$;

create or replace function public.reset_dashboard_access_credential(
  p_id uuid,
  p_pin text,
  p_pin_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_version integer;
begin
  if p_id is null or p_pin is null or p_pin !~ '^[0-9]{6,12}$'
    or p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid dashboard credential reset';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1579608555);
  if exists (
    select 1
    from public.report_access
    where id <> p_id
      and (pin = p_pin or pin_hash = p_pin_hash)
  ) then
    raise exception using
      errcode = '23505',
      message = 'dashboard credential already in use';
  end if;

  update public.report_access
  set
    pin = null,
    pin_hash = p_pin_hash,
    session_version = session_version + 1
  where id = p_id
  returning session_version into v_session_version;

  return v_session_version;
end;
$$;

create or replace function public.migrate_dashboard_access_credential(
  p_id uuid,
  p_legacy_pin text,
  p_pin_hash text
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_version integer;
begin
  if p_id is null or p_legacy_pin is null or
    p_legacy_pin !~ '^[A-Za-z0-9_-]{4,32}$' or
    p_pin_hash is null or p_pin_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid legacy dashboard credential migration';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1579608555);
  if exists (
    select 1
    from public.report_access
    where id <> p_id and pin_hash = p_pin_hash
  ) then
    raise exception using
      errcode = '23505',
      message = 'dashboard credential already in use';
  end if;

  update public.report_access
  set
    pin = null,
    pin_hash = p_pin_hash,
    session_version = session_version + 1
  where id = p_id
    and pin = p_legacy_pin
    and active is true
  returning session_version into v_session_version;

  return v_session_version;
end;
$$;

create or replace function public.set_dashboard_access_active(
  p_id uuid,
  p_active boolean
)
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_session_version integer;
begin
  if p_id is null or p_active is null then
    raise exception using
      errcode = '22023',
      message = 'invalid dashboard active-state update';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(1579608555);

  update public.report_access
  set
    session_version = case
      when active is distinct from p_active then session_version + 1
      else session_version
    end,
    active = p_active
  where id = p_id
  returning session_version into v_session_version;

  return v_session_version;
end;
$$;

revoke all on function public.authenticate_dashboard_access(text, text)
  from public, anon, authenticated;
revoke all on function public.create_dashboard_access(text, text, text, text)
  from public, anon, authenticated;
revoke all on function public.reset_dashboard_access_credential(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.migrate_dashboard_access_credential(uuid, text, text)
  from public, anon, authenticated;
revoke all on function public.set_dashboard_access_active(uuid, boolean)
  from public, anon, authenticated;

grant execute on function public.create_dashboard_access(text, text, text, text)
  to service_role;
grant execute on function public.authenticate_dashboard_access(text, text)
  to service_role;
grant execute on function public.reset_dashboard_access_credential(uuid, text, text)
  to service_role;
grant execute on function public.migrate_dashboard_access_credential(uuid, text, text)
  to service_role;
grant execute on function public.set_dashboard_access_active(uuid, boolean)
  to service_role;

comment on function public.create_dashboard_access(text, text, text, text) is
  'Service-role-only hash-only dashboard access creation with cross-column legacy collision protection.';
comment on function public.authenticate_dashboard_access(text, text) is
  'Service-role-only POST-body credential lookup with atomic legacy plaintext migration and safe identity projection.';
comment on function public.reset_dashboard_access_credential(uuid, text, text) is
  'Service-role-only atomic PIN reset and bearer-session revocation.';
comment on function public.migrate_dashboard_access_credential(uuid, text, text) is
  'Service-role-only atomic plaintext-to-HMAC transition and bearer-session revocation.';
comment on function public.set_dashboard_access_active(uuid, boolean) is
  'Service-role-only active-state transition; changed state atomically revokes prior bearer sessions.';
