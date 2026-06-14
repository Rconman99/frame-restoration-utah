-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — app_config
-- Authored 2026-06-14 from live schema capture (~/projects/utah-live-schema-2026-06-14.sql).
--
-- WHAT THIS IS: a reconstructed CREATE-TABLE baseline so a FRESH territory project
-- can build the core CRM schema before the existing additive ALTER migrations
-- (20260510 / 20260608 / 20260610) run. Idempotent (IF NOT EXISTS) so it no-ops
-- against a DB that already has the table.
--
-- SECURITY POSTURE: hardened. RLS is enabled and tables are locked to service_role
-- in 20260401000009_baseline_hardened_rls.sql. This deliberately does NOT replicate
-- live Utah's insecure blanket anon grants. See FRAME-UTAH-PHASE0-SCHEMA-BASELINE-PLAN.
--
-- ⚠️ Do NOT push this baseline to the live Utah project (hdcflshhomzildwqlmwh).
--    The RLS-hardening file would change live posture — that is a separate, reviewed
--    security task (Workstream 3), NOT Phase 0.
--
-- NO row values are seeded here. app_config holds Twilio/Resend/OpenRouter secrets
-- as DATA rows in each environment — never in a migration.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.app_config (
  key        text not null,
  value      text not null,
  created_at timestamptz default now(),
  constraint app_config_pkey primary key (key)
);

comment on table public.app_config is
  'Key/value runtime config (Twilio/Resend/OpenRouter creds). Service-role-only. Values are environment data, never migration content.';
