-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — report_access (PIN auth)
-- Authored 2026-06-14 from live schema capture.
--
-- Live PK type confirmed = uuid. Live has UNIQUE(pin). No campaign_key column live
-- (the earlier code-derived "campaign_key" claim was wrong — omitted here).
--
-- HARDENED NOTE: live Utah exposes report_access to the anon role (anon SELECT/INSERT/
-- UPDATE policies + GRANT ALL TO anon → PINs readable with the public anon key). This
-- baseline does NOT reproduce that. report_access is service-role-only here; PIN auth
-- must run server-side through an Edge Function (lead-crm / weekly-report already do),
-- NOT via direct anon PostgREST CRUD from the dashboard. See hardened-rls file.
--
-- NO PIN rows are seeded.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.report_access (
  id            uuid not null default gen_random_uuid(),
  pin           text not null,
  name          text not null,
  role          text not null default 'viewer',
  active        boolean not null default true,
  last_accessed timestamptz,
  created_at    timestamptz default now(),
  constraint report_access_pkey primary key (id),
  constraint report_access_pin_key unique (pin)
);

comment on table public.report_access is
  'Dashboard PIN auth. Service-role-only; validate PINs server-side in an Edge Function, never via direct anon table access.';
