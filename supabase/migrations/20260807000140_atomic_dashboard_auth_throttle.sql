-- Make the dashboard login throttle one atomic database operation.
--
-- Every POST login attempt reserves a slot before any routing-key or PIN
-- comparison. The first 10 attempts from one IP in a fixed 15-minute window
-- may continue; later attempts are blocked until that original window expires.
-- Successful logins intentionally do not reset the counter, preventing one
-- valid low-privilege credential from reopening an IP's brute-force budget.

comment on table public.auth_attempts is
  'Service-role-only fixed-window dashboard login-attempt counters keyed by a context-separated HMAC of the canonical client IP. fail_count is retained for migration compatibility but counts every login attempt, not only failures.';

create index if not exists auth_attempts_window_start_idx
  on public.auth_attempts (window_start);

create or replace function public.reserve_dashboard_login_attempt(p_ip text)
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
  -- The Edge Function sends only a context-keyed SHA-256 HMAC, never a raw IP.
  -- Its trusted extractor accepts canonical cf-connecting-ip only and fails
  -- closed before this RPC when that header is missing or malformed.
  if p_ip is null
    or octet_length(p_ip) <> 64
    or p_ip !~ '^[0-9a-f]{64}$'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid dashboard throttle key';
  end if;

  -- Bound table growth without a separate maintenance job. The indexed delete
  -- and reservation live in one transaction; concurrent upserts remain atomic.
  delete from public.auth_attempts
  where window_start <= v_now - interval '15 minutes';

  insert into public.auth_attempts as attempts (ip, fail_count, window_start)
  values (btrim(p_ip), 1, v_now)
  on conflict (ip) do update
  set
    fail_count = case
      when attempts.window_start <= v_now - interval '15 minutes' then 1
      else least(greatest(attempts.fail_count, 0)::bigint + 1, 2147483647)::integer
    end,
    window_start = case
      when attempts.window_start <= v_now - interval '15 minutes' then v_now
      else attempts.window_start
    end
  returning attempts.fail_count, attempts.window_start
  into v_attempt_count, v_window_start;

  return query
  select
    v_attempt_count <= 10,
    v_attempt_count,
    case
      when v_attempt_count <= 10 then 0
      else greatest(
        1,
        ceil(extract(epoch from (
          v_window_start + interval '15 minutes' - v_now
        )))::integer
      )
    end;
end;
$$;

revoke all on function public.reserve_dashboard_login_attempt(text)
  from public, anon, authenticated;
grant execute on function public.reserve_dashboard_login_attempt(text)
  to service_role;

comment on function public.reserve_dashboard_login_attempt(text) is
  'Atomically reserves one of 10 dashboard login attempts per canonical-IP HMAC per fixed 15-minute window, while deleting expired counters. Service role only.';
