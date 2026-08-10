-- Public lead-intake abuse protection. Safe to apply before the new handler:
-- no trigger or existing table behavior changes. The Edge Function persists a
-- context-keyed HMAC of the canonical platform client IP, never the raw IP.

create table if not exists public.lead_intake_rate_limits (
  ip_hash text primary key check (ip_hash ~ '^[0-9a-f]{64}$'),
  request_count integer not null default 1 check (request_count >= 1),
  window_start timestamptz not null default now()
);

alter table public.lead_intake_rate_limits enable row level security;
revoke all on table public.lead_intake_rate_limits
  from public, anon, authenticated;
grant all on table public.lead_intake_rate_limits to service_role;

create index if not exists lead_intake_rate_limits_window_start_idx
  on public.lead_intake_rate_limits (window_start);

create or replace function public.reserve_lead_intake_attempt(p_ip_hash text)
returns table (
  allowed boolean,
  attempt_count integer,
  retry_after_seconds integer
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_window_start timestamptz;
  v_attempt_count integer;
begin
  if p_ip_hash is null
    or octet_length(p_ip_hash) <> 64
    or p_ip_hash !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid lead intake rate-limit key';
  end if;

  -- The index keeps cleanup bounded. Deleting expired rows inside the same
  -- transaction avoids an unbounded identifier table without a maintenance job.
  delete from public.lead_intake_rate_limits
  where window_start <= v_now - interval '15 minutes';

  insert into public.lead_intake_rate_limits as attempts (
    ip_hash,
    request_count,
    window_start
  ) values (
    p_ip_hash,
    1,
    v_now
  )
  on conflict (ip_hash) do update
  set request_count = least(
    greatest(attempts.request_count, 1)::bigint + 1,
    2147483647
  )::integer
  returning attempts.request_count, attempts.window_start
  into v_attempt_count, v_window_start;

  return query
  select
    v_attempt_count <= 5,
    v_attempt_count,
    case
      when v_attempt_count <= 5 then 0
      else greatest(
        1,
        ceil(extract(epoch from (
          v_window_start + interval '15 minutes' - v_now
        )))::integer
      )
    end;
end;
$$;

revoke all on function public.reserve_lead_intake_attempt(text)
  from public, anon, authenticated;
grant execute on function public.reserve_lead_intake_attempt(text)
  to service_role;

comment on table public.lead_intake_rate_limits is
  'Service-role-only fixed-window public lead submission counters keyed by a context-separated canonical-IP HMAC.';
comment on function public.reserve_lead_intake_attempt(text) is
  'Atomically allows five public lead attempts per canonical-IP HMAC per fixed 15-minute window and deletes expired counters.';
