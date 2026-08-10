-- MANUAL CUTOVER — PREPARED ONLY; DO NOT APPLY WITHOUT ROLLOUT GATE
--
-- This is deliberately separate from 20260401000009_baseline_hardened_rls.sql.
-- The baseline is for fresh projects. This transaction is the bounded live-Utah
-- remediation to run only after:
--   1. lead-crm with server-side role enforcement is deployed and tested;
--   2. the live weekly-report source is captured and verified service-role-only;
--   3. existing report_access roles are reviewed without exporting customer rows;
--   4. every legacy plaintext PIN is rotated/migrated (pin IS NULL for all rows);
--   5. /dashboard, /seo-report and /leads pass admin/sales/viewer smoke tests.
--
-- It removes browser/PostgREST access to PINs, config secrets, leads, call/SMS
-- records, and the owner-rights reporting view. Edge Functions retain explicit
-- service_role privileges and service_role continues to bypass RLS.

begin;

-- Do not let future public-schema objects silently inherit browser privileges.
alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;

do $remediate$
declare
  table_name text;
  policy_row record;
  sensitive_tables constant text[] := array[
    'app_config',
    'report_access',
    'leads',
    'phone_clicks',
    'call_logs',
    'sms_logs',
    'sms_conversation_map',
    'processed_webhooks',
    'auth_attempts',
    'growth_queue_actions',
    'blocked_callers',
    'lead_notifications',
    'lead_notification_events',
    'lead_intake_rate_limits'
  ];
begin
  foreach table_name in array sensitive_tables
  loop
    -- Later additive tables are optional so this migration stays safe across
    -- schema-parity states. The core objects are asserted below.
    if to_regclass(format('public.%I', table_name)) is null then
      continue;
    end if;

    execute format(
      'alter table public.%I enable row level security',
      table_name
    );
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      table_name
    );
    execute format(
      'grant all privileges on table public.%I to service_role',
      table_name
    );

    -- Live Utah historically had permissive public policies. Remove them so a
    -- later accidental GRANT cannot silently reopen customer data or PINs.
    for policy_row in
      select policyname
      from pg_policies
      where schemaname = 'public' and tablename = table_name
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        table_name
      );
    end loop;
  end loop;
end
$remediate$;

-- Preserve the explicit application role matrix. Never rewrite legacy roles in
-- a security migration: an unexpected value aborts and must be reviewed first.
do $role_guard$
begin
  if exists (
    select 1
    from public.report_access
    where role is null or role not in ('viewer', 'sales', 'admin')
  ) then
    raise exception 'report_access contains an unsupported role; review before remediation';
  end if;

  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access'::regclass
      and conname = 'report_access_role_check'
  ) then
    alter table public.report_access
      add constraint report_access_role_check
      check (role in ('viewer', 'sales', 'admin'));
  end if;

  if exists (
    select 1
    from public.report_access
    where pin is not null
  ) then
    raise exception 'legacy plaintext report_access PINs remain; rotate/migrate before remediation';
  end if;

  if exists (
    select 1
    from public.report_access
    where pin_hash is null
  ) then
    raise exception 'report_access contains a row without pin_hash; remediation aborted';
  end if;

  if exists (
    select 1
    from public.report_access
    where session_version is null
      or session_version not between 1 and 2147483647
  ) then
    raise exception 'report_access contains an invalid session_version; remediation aborted';
  end if;

  -- The transition column remains temporarily for compatibility with the
  -- deployed login/RPC code, but the final gate makes plaintext impossible to
  -- reintroduce through a future service-role write.
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.report_access'::regclass
      and conname = 'report_access_plaintext_pin_forbidden_check'
  ) then
    alter table public.report_access
      add constraint report_access_plaintext_pin_forbidden_check
      check (pin is null);
  end if;
end
$role_guard$;

-- Identity-backed tables need sequence access for service-role inserts. Browser
-- roles receive none. This covers both current and future identity sequences.
revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage, select, update on all sequences in schema public to service_role;

-- Fail closed if the known reporting view is missing. Recreate/repair the view
-- before retrying instead of leaving an unknown owner-rights surface in place.
do $view_guard$
begin
  if to_regclass('public.website_leads_report') is null then
    raise exception 'website_leads_report is missing; remediation aborted';
  end if;
end
$view_guard$;

alter view public.website_leads_report set (security_invoker = true);
revoke all privileges on table public.website_leads_report from anon, authenticated;
grant select on table public.website_leads_report to service_role;

-- Transactional assertions: any failed invariant rolls the entire migration back.
do $assertions$
declare
  required_table text;
  is_invoker boolean;
begin
  foreach required_table in array array[
    'app_config',
    'report_access',
    'leads',
    'phone_clicks',
    'call_logs',
    'sms_logs',
    'sms_conversation_map'
  ]
  loop
    if to_regclass(format('public.%I', required_table)) is null then
      raise exception 'required table public.% is missing', required_table;
    end if;
    if has_table_privilege('anon', format('public.%I', required_table), 'select')
      or has_table_privilege(
        'authenticated',
        format('public.%I', required_table),
        'select'
      ) then
      raise exception 'browser role still has SELECT on public.%', required_table;
    end if;
    if not has_table_privilege(
      'service_role',
      format('public.%I', required_table),
      'select'
    ) then
      raise exception 'service_role lost SELECT on public.%', required_table;
    end if;
  end loop;

  if has_table_privilege('anon', 'public.website_leads_report', 'select')
    or has_table_privilege(
      'authenticated',
      'public.website_leads_report',
      'select'
    ) then
    raise exception 'browser role still has SELECT on website_leads_report';
  end if;
  if not has_table_privilege(
    'service_role',
    'public.website_leads_report',
    'select'
  ) then
    raise exception 'service_role lost SELECT on website_leads_report';
  end if;

  select coalesce('security_invoker=true' = any (c.reloptions), false)
    into is_invoker
  from pg_class c
  join pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public' and c.relname = 'website_leads_report';
  if not coalesce(is_invoker, false) then
    raise exception 'website_leads_report is not security_invoker';
  end if;
end
$assertions$;

commit;
