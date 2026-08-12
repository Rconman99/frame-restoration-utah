-- Missed-call alerts to the owner, with a caller suppression list.
--
-- Distinct from blocked_callers on purpose:
--   blocked_callers          → the call is refused; Landon's phone never rings.
--   alert_suppressed_callers → the call rings normally, we just stop texting
--                              him about it when he misses it.
-- Conflating the two would mean "stop texting me" silently stopped taking the
-- caller's calls.

create table if not exists public.alert_suppressed_callers (
  phone       text primary key,
  reason      text,
  source      text not null default 'operator_sms',
  created_at  timestamptz not null default now()
);

-- The table was staged before this PR merged in one production environment.
-- CREATE TABLE IF NOT EXISTS does not backfill constraints, so make the
-- invariant explicit and idempotent without deleting existing preferences.
do $$
begin
  if not exists (
    select 1
      from pg_catalog.pg_constraint
     where conrelid = 'public.alert_suppressed_callers'::regclass
       and conname = 'alert_suppressed_callers_phone_e164_check'
  ) then
    alter table public.alert_suppressed_callers
      add constraint alert_suppressed_callers_phone_e164_check
      check (phone ~ '^\+[1-9][0-9]{7,14}$') not valid;
    alter table public.alert_suppressed_callers
      validate constraint alert_suppressed_callers_phone_e164_check;
  end if;
end
$$;

comment on table public.alert_suppressed_callers is
  'Numbers Landon has BLOCKed from missed-call alerts. Calls still ring through; only the alert is suppressed.';

alter table public.alert_suppressed_callers enable row level security;
-- Service role only. handle-call and handle-sms read/write this; no browser
-- ever touches it, so no anon or authenticated policy is granted.
revoke all on public.alert_suppressed_callers from public, anon, authenticated;
grant select, insert, update, delete on public.alert_suppressed_callers to service_role;

-- Persist the provider acceptance receipt on the existing private call row.
-- Deploy this migration before either Edge Function.
alter table public.call_logs
  add column if not exists missed_alert_sent_at timestamptz,
  add column if not exists missed_alert_message_sid text;
