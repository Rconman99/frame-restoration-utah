-- 2026-06-10 lead-engine P0 hardening (cross-market architecture review)
--
-- 1. sms_consent: the form has always SENT this checkbox; handle-lead v9 now
--    stores it and gates the customer auto-text on it (TCPA). idempotent —
--    no-op if the column already exists.
alter table public.leads
  add column if not exists sms_consent boolean;

comment on column public.leads.sms_consent is
  'Customer opted in to SMS on the form. handle-lead v9 refuses the auto-text without it (lead-sms.test.ts freezes the gate).';

-- 2. auth_attempts: per-IP PIN-attempt throttle state for lead-crm.
--    report_access PINs are plaintext and travel in a query string; before
--    this there was no brute-force protection at all. Decisions live in
--    _shared/auth-throttle.ts (frozen by auth-throttle.test.ts); this table
--    is just the counter.
create table if not exists public.auth_attempts (
  ip text primary key,
  fail_count integer not null default 0,
  window_start timestamptz not null default now()
);

alter table public.auth_attempts enable row level security;
-- zero policies on purpose: service-role-only, same posture as report_access.
