-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — RLS + grants (service-role-only / locked)
-- Authored 2026-06-14.
--
-- This is the security-defining file. It deliberately does NOT reproduce live Utah's
-- insecure posture (blanket `GRANT ALL TO anon` on every table + permissive PUBLIC
-- `USING(true)` policies + an anon-readable owner-rights reporting view, which together
-- expose app_config secrets, report_access PINs, and call/SMS customer data to the
-- public anon key).
--
-- Posture here:
--   • RLS ENABLED on every baseline table.
--   • NO policies → non-superuser roles (anon, authenticated) are denied. service_role
--     has BYPASSRLS, so the Edge Functions (which use the service-role key) work.
--   • REVOKE all table/sequence privileges from anon + authenticated.
--   • GRANT to service_role explicitly (bypassrls still requires table grants).
--   • Default privileges in `public` no longer auto-grant anon/authenticated.
--   • The reporting view is service-role-only and security_invoker (set in its own file).
--
-- Public lead intake stays possible ONLY through Edge Functions (handle-lead /
-- handle-sms / handle-call / track-click use the service-role key) — never via direct
-- anon table access. Dashboard PIN auth must likewise run server-side.
--
-- ⚠️ FRESH-PROJECT FILE. Do NOT push to live Utah (hdcflshhomzildwqlmwh): the REVOKEs
--    would lock out the live dashboard's anon report_access CRUD. Remediating live is
--    Workstream 3 (separate, reviewed) — NOT Phase 0.
--
-- NOTE: processed_webhooks + auth_attempts are created by their own existing migrations
-- (20260608 / 20260610), which enable RLS without anon policies; they are not re-granted
-- here. Tighten them in W3 if a fully-locked template is required.
-- ─────────────────────────────────────────────────────────────────────────────

-- Stop future public-schema tables from auto-granting the anon/authenticated roles.
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;

do $$
declare
  t text;
begin
  foreach t in array array[
    'app_config',
    'report_access',
    'leads',
    'phone_clicks',
    'call_logs',
    'sms_logs',
    'sms_conversation_map'
  ]
  loop
    execute format('alter table public.%I enable row level security;', t);
    execute format('revoke all on table public.%I from anon, authenticated;', t);
    execute format('grant all on table public.%I to service_role;', t);
  end loop;
end $$;

-- Reporting view: service-role only (security_invoker is set on the view itself).
revoke all on table public.website_leads_report from anon, authenticated;
grant select on table public.website_leads_report to service_role;
