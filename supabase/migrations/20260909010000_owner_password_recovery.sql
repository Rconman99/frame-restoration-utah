-- Owner recovery addresses are provisioned privately after owner confirmation.
-- This migration never seeds recipients, grants access, or sends email.
begin;
alter table public.report_access add column if not exists recovery_email text;
alter table public.report_access add constraint report_access_recovery_email_check
  check (recovery_email is null or (recovery_email = lower(btrim(recovery_email)) and
    length(recovery_email) <= 254 and recovery_email ~ '^[^[:space:]@]+@[^[:space:]@]+[.][^[:space:]@]+$'));
comment on column public.report_access.recovery_email is
  'Owner-confirmed recovery mailbox. Service-role provisioning only; never accepted as an account update from a recovery request.';

-- A recovery identity resolves exactly one active account, including case/space normalization.
create unique index report_access_recovery_identity_key
  on public.report_access(lower(btrim(name)),recovery_email)
  where active and recovery_email is not null;

create table public.crm_password_resets (
  token_hash text primary key check (token_hash ~ '^[a-f0-9]{64}$'),
  report_access_id uuid not null references public.report_access(id) on delete cascade,
  credential_version integer not null,
  email_hash text not null check (email_hash ~ '^[a-f0-9]{64}$'),
  created_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null,
  sent_at timestamptz,
  used_at timestamptz,
  check (expires_at > created_at)
);
create index crm_password_resets_access_idx on public.crm_password_resets(report_access_id, created_at desc);
create index crm_password_resets_expiry_idx on public.crm_password_resets(expires_at);
alter table public.crm_password_resets enable row level security;
revoke all on public.crm_password_resets from public, anon, authenticated;
grant select, insert, update, delete on public.crm_password_resets to service_role;

create table public.crm_recovery_rate_limits (
  scope text not null check (scope in ('request','complete')),
  client_hash text not null check (client_hash ~ '^[a-f0-9]{64}$'),
  window_started_at timestamptz not null,
  attempts integer not null,
  primary key(scope,client_hash)
);
alter table public.crm_recovery_rate_limits enable row level security;
revoke all on public.crm_recovery_rate_limits from public, anon, authenticated;
grant select, insert, update, delete on public.crm_recovery_rate_limits to service_role;

create function public.crm_allow_recovery_attempt(p_scope text,p_client_hash text)
returns boolean language plpgsql security definer set search_path = pg_catalog as $$
declare v_now timestamptz := clock_timestamp(); v_attempts integer;
begin
  if p_scope not in ('request','complete') or coalesce(p_client_hash,'') !~ '^[a-f0-9]{64}$' then return false; end if;
  delete from public.crm_recovery_rate_limits where (scope,client_hash) in (
    select old.scope,old.client_hash from public.crm_recovery_rate_limits old
    where old.window_started_at < v_now - interval '1 day' limit 100);
  insert into public.crm_recovery_rate_limits as limits values(p_scope,p_client_hash,v_now,1)
    on conflict(scope,client_hash) do update set
      attempts = case when limits.window_started_at <= v_now-interval '15 minutes' then 1 else limits.attempts+1 end,
      window_started_at = case when limits.window_started_at <= v_now-interval '15 minutes' then v_now else limits.window_started_at end
    returning attempts into v_attempts;
  return v_attempts <= case when p_scope='request' then 5 else 20 end;
end;
$$;

create function public.crm_request_password_reset(p_name text,p_email text,p_token_hash text,p_client_hash text)
returns table(recipient text) language plpgsql security definer set search_path = pg_catalog,extensions as $$
declare v_now timestamptz:=clock_timestamp(); v_access public.report_access%rowtype;
begin
  if not public.crm_allow_recovery_attempt('request',p_client_hash) then return; end if;
  if coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' then return; end if;
  -- Retain one day of bounded rate-limit evidence. Never invalidate a prior
  -- working reset link just because someone requested another one.
  delete from public.crm_password_resets where token_hash in (
    select old.token_hash from public.crm_password_resets old
    where old.expires_at < v_now-interval '1 day' limit 100);
  select ra.* into v_access from public.report_access ra
    where lower(btrim(ra.name))=lower(btrim(p_name)) and ra.active
      and ra.recovery_email=lower(btrim(p_email)) for update;
  if v_access.id is null then return; end if;
  if exists(select 1 from public.crm_password_resets r where r.report_access_id=v_access.id and r.created_at>v_now-interval '1 minute')
    or (select count(*) from public.crm_password_resets r where r.report_access_id=v_access.id and r.created_at>v_now-interval '1 hour') >= 3 then return; end if;
  insert into public.crm_password_resets(token_hash,report_access_id,credential_version,email_hash,created_at,expires_at)
    values(p_token_hash,v_access.id,v_access.session_version,encode(extensions.digest(v_access.recovery_email,'sha256'),'hex'),v_now,v_now+interval '15 minutes');
  return query select v_access.recovery_email;
end;
$$;

create function public.crm_mark_password_reset_delivery(p_token_hash text,p_sent boolean)
returns void language plpgsql security definer set search_path=pg_catalog as $$
begin
  update public.crm_password_resets set
    sent_at=case when p_sent then clock_timestamp() else null end,
    used_at=case when p_sent then null else clock_timestamp() end
    where token_hash=p_token_hash and used_at is null and expires_at>clock_timestamp();
end;
$$;

create function public.crm_complete_password_reset(p_token_hash text,p_password text,p_password_hash text,p_client_hash text)
returns table(reset_status text,name text) language plpgsql security definer set search_path=pg_catalog,extensions as $$
declare v_access_id uuid; v_access public.report_access%rowtype; v_reset public.crm_password_resets%rowtype; v_now timestamptz;
begin
  if not public.crm_allow_recovery_attempt('complete',p_client_hash) then return; end if;
  if coalesce(p_token_hash,'') !~ '^[a-f0-9]{64}$' or char_length(coalesce(p_password,''))<12
    or octet_length(p_password)>72 or length(btrim(p_password))=0 then return; end if;
  if coalesce(p_password_hash,'') !~ '^[a-f0-9]{64}$' then return; end if;
  -- Same lock as credential login/admin mutation: reset and login serialize.
  perform pg_catalog.pg_advisory_xact_lock(1579608555);
  select r.report_access_id into v_access_id from public.crm_password_resets r where r.token_hash=p_token_hash;
  if v_access_id is null then return; end if;
  -- Every password-sensitive operation locks the account first. This serializes
  -- simultaneous link redemption and login without lock-order inversions.
  select ra.* into v_access from public.report_access ra where ra.id=v_access_id for update;
  select r.* into v_reset from public.crm_password_resets r where r.token_hash=p_token_hash for update;
  v_now:=clock_timestamp();
  if not coalesce(v_access.active,false) or v_access.recovery_email is null or v_reset.token_hash is null
    or v_reset.credential_version<>v_access.session_version
    or v_reset.used_at is not null or v_reset.sent_at is null or v_reset.expires_at<=v_now
    or v_reset.email_hash<>encode(extensions.digest(v_access.recovery_email,'sha256'),'hex') then return; end if;
  if exists(select 1 from public.report_access ra where ra.id<>v_access_id and (ra.pin_hash=p_password_hash or ra.pin=p_password)) then
    return query select 'password_unavailable'::text,null::text; return;
  end if;
  update public.report_access set pin=null,pin_hash=p_password_hash,session_version=session_version+1 where id=v_access_id;
  update public.crm_password_resets set used_at=v_now where report_access_id=v_access_id and used_at is null;
  -- Every dashboard endpoint reloads session_version, revoking old signed sessions.
  return query select 'ok'::text,v_access.name;
end;
$$;

revoke all on function public.crm_allow_recovery_attempt(text,text) from public,anon,authenticated;
revoke all on function public.crm_request_password_reset(text,text,text,text) from public,anon,authenticated;
revoke all on function public.crm_mark_password_reset_delivery(text,boolean) from public,anon,authenticated;
revoke all on function public.crm_complete_password_reset(text,text,text,text) from public,anon,authenticated;
grant execute on function public.crm_allow_recovery_attempt(text,text) to service_role;
grant execute on function public.crm_request_password_reset(text,text,text,text) to service_role;
grant execute on function public.crm_mark_password_reset_delivery(text,boolean) to service_role;
grant execute on function public.crm_complete_password_reset(text,text,text,text) to service_role;

-- Passwords extend the existing PIN format without changing old credentials.
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
  if p_pin is null or not (p_pin ~ '^[A-Za-z0-9_-]{4,32}$' or (char_length(p_pin)>=12 and octet_length(p_pin)<=72 and length(btrim(p_pin))>0))
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


commit;
