-- Capture Twilio's caller ZIP (FromZip) on inbound call rows. call_logs.city
-- already exists and is filled from FromCity/FromState by handle-call.
-- Additive and idempotent. FILE ONLY: apply to the live project before the
-- handle-call change that writes from_zip is deployed, or the upsert fails.
-- FromCity/FromZip describe the caller's number's exchange, not a street
-- address; they are coarse and can be stale for ported or mobile numbers.

alter table public.call_logs add column if not exists from_zip text;

comment on column public.call_logs.from_zip is
  'Twilio FromZip for the calling number (5-digit ZIP or null). Coarse; not an address.';
