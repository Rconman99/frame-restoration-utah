-- Emergency live containment for Utah's legacy browser-readable credential
-- surfaces. This intentionally lands before the larger dashboard migration so
-- service-role Edge Functions keep operating while the old direct-PostgREST
-- dashboard is retired.

begin;

do $preflight$
begin
  if to_regclass('public.app_config') is null
    or to_regclass('public.report_access') is null then
    raise exception 'required dashboard credential tables are missing';
  end if;
end
$preflight$;

alter table public.app_config enable row level security;
alter table public.report_access enable row level security;

revoke all privileges on table public.app_config
  from anon, authenticated;
revoke all privileges on table public.report_access
  from anon, authenticated;
grant all privileges on table public.app_config to service_role;
grant all privileges on table public.report_access to service_role;

do $drop_browser_policies$
declare
  policy_row record;
begin
  for policy_row in
    select tablename, policyname
      from pg_policies
     where schemaname = 'public'
       and tablename in ('app_config', 'report_access')
  loop
    execute format(
      'drop policy if exists %I on public.%I',
      policy_row.policyname,
      policy_row.tablename
    );
  end loop;
end
$drop_browser_policies$;

do $assertions$
declare
  table_name text;
begin
  foreach table_name in array array['app_config', 'report_access']
  loop
    if has_table_privilege('anon', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('anon', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('anon', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('anon', format('public.%I', table_name), 'DELETE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'SELECT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'INSERT')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'UPDATE')
      or has_table_privilege('authenticated', format('public.%I', table_name), 'DELETE') then
      raise exception 'browser privileges remain on public.%', table_name;
    end if;
    if not has_table_privilege(
      'service_role',
      format('public.%I', table_name),
      'SELECT'
    ) then
      raise exception 'service_role lost access to public.%', table_name;
    end if;
  end loop;
end
$assertions$;

commit;
