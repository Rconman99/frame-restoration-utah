-- CNAM is informational only. Existing call-log access controls stay in place.
alter table public.call_logs
  add column if not exists caller_name text,
  add column if not exists caller_name_lookup_status text;

comment on column public.call_logs.caller_name is
  'Optional CNAM listing, distinct from the caller self-reported name; not proof of identity.';
comment on column public.call_logs.caller_name_lookup_status is
  'NULL=unclaimed, pending=lookup claimed, native, matched, empty, unavailable, or not-eligible. A claim prevents duplicate lookup charges for webhook retries.';
