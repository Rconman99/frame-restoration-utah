-- Self-serve PIN reset for the PIN-gated dashboards (/leads, /seo-report).
--
-- Context: 2026-08-12. Landon had never once logged into the CRM
-- (last_accessed was NULL since the row was created 2026-04-11) because there
-- was no way to recover a PIN he didn't have. This adds the columns the
-- `pin_reset` action in lead-crm needs.
--
-- Design notes:
--   * `phone` is the ONLY destination a reset code is ever sent to. It is set
--     by an admin, never by the requester — otherwise "reset" is just
--     "mail me anyone's PIN".
--   * `last_reset_at` is the per-account cooldown so a known name can't be used
--     to spam someone's phone. Per-IP throttling reuses the existing
--     auth_attempts table under a "reset:<ip>" key.
--   * PINs are stored lowercase from here on. The lookup lowercases input
--     before comparing, which removes the capital-letter footgun that locked
--     the owner out of his own admin PIN on 2026-08-11.

alter table public.report_access
  add column if not exists phone text,
  add column if not exists last_reset_at timestamptz;

comment on column public.report_access.phone is
  'E.164 destination for self-serve PIN resets. Admin-set only — never accepted from the reset requester.';
comment on column public.report_access.last_reset_at is
  'Timestamp of the last self-serve PIN reset. Drives the per-account reset cooldown.';

-- Case-insensitive name lookup for the reset flow, and a fast PIN lookup.
create index if not exists report_access_name_lower_idx
  on public.report_access (lower(name));
create index if not exists report_access_pin_idx
  on public.report_access (pin);

-- Normalize any existing mixed-case PINs so the lowercase comparison in
-- lead-crm cannot lock out an existing user.
update public.report_access
   set pin = lower(pin)
 where pin is not null
   and pin <> lower(pin);
