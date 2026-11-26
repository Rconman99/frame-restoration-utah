-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Precondition fixture for supabase/tests/lead_migrations_rollback.sql, which
-- proves that the rollback SQL printed in docs/runbooks/utah-lead-migrations.md
-- actually leaves the catalog AND the migration history agreeing — the failure
-- mode the 2026-11-26 review found in the Texas runbook, where a documented
-- rollback deleted the history row but left the columns behind.
--
-- Preconditions supplied by the workflow before this file:
--   supabase/migrations/20260401000003_baseline_leads.sql
--   supabase/migrations/20260401000004_baseline_phone_clicks.sql
--   supabase/migrations/20260510_add_attribution_columns.sql
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
grant all privileges on table public.leads, public.phone_clicks to service_role;
grant usage, select, update on all sequences in schema public to service_role;

-- The Supabase CLI's own history table, so the rollback's history deletes have
-- something real to act on and the contract can compare catalog to history.
create schema if not exists supabase_migrations;
create table if not exists supabase_migrations.schema_migrations (
  version text primary key,
  statements text[],
  name text,
  created_by text,
  idempotency_key text
);

-- A handful of rows so the backfill in 20261027230000 has something to do and
-- the rollback can be shown not to drop rows. Synthetic, never a real customer.
insert into public.leads (name, email, phone, message, referrer, landing_page, utm_source)
values
  ('synthetic one', 'one@example.invalid', '+15555550101', 'synthetic', 'https://chatgpt.com/', '/', 'chatgpt'),
  ('synthetic two', 'two@example.invalid', '+15555550102', 'synthetic', 'https://www.google.com/', '/', 'google'),
  ('synthetic three', 'three@example.invalid', '+15555550103', 'synthetic', null, '/', null);

insert into public.phone_clicks (click_type, referrer, utm_source)
values ('call', 'https://perplexity.ai/', 'perplexity'),
       ('sms', 'https://www.bing.com/', null);
