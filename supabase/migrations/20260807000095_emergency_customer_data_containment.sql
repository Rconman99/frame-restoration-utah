-- EMERGENCY LIVE CONTAINMENT — applied manually on 2026-08-07 UTC.
--
-- Public PostgREST access was confirmed on customer communications tables and
-- the owner-rights website_leads_report view. Utah browser code must use Edge
-- Functions; it has no legitimate direct table/view access. This transaction
-- removes every current and default browser grant while preserving the
-- service_role used by those functions.

begin;

alter default privileges in schema public
  revoke all privileges on tables from anon, authenticated;
alter default privileges in schema public
  revoke all privileges on sequences from anon, authenticated;
alter default privileges in schema public
  revoke execute on functions from public, anon, authenticated;
alter default privileges in schema public
  grant execute on functions to service_role;

do $containment$
declare
  relation_row record;
  policy_row record;
begin
  for relation_row in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('r', 'p')
  loop
    execute format(
      'alter table public.%I enable row level security',
      relation_row.relname
    );
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      relation_row.relname
    );
    execute format(
      'grant all privileges on table public.%I to service_role',
      relation_row.relname
    );

    for policy_row in
      select policyname
      from pg_catalog.pg_policies
      where schemaname = 'public' and tablename = relation_row.relname
    loop
      execute format(
        'drop policy if exists %I on public.%I',
        policy_row.policyname,
        relation_row.relname
      );
    end loop;
  end loop;
end
$containment$;

revoke all privileges on all sequences in schema public from anon, authenticated;
grant usage, select, update on all sequences in schema public to service_role;

do $views$
declare
  view_row record;
begin
  for view_row in
    select c.relname
    from pg_catalog.pg_class c
    join pg_catalog.pg_namespace n on n.oid = c.relnamespace
    where n.nspname = 'public'
      and c.relkind in ('v', 'm')
  loop
    execute format(
      'revoke all privileges on table public.%I from anon, authenticated',
      view_row.relname
    );
    execute format(
      'grant select on table public.%I to service_role',
      view_row.relname
    );
  end loop;
end
$views$;

-- The known reporting view must not retain owner-rights behavior if a future
-- operator restores a grant. Fail closed if the incident surface disappeared
-- unexpectedly rather than silently skipping the hardening step.
do $reporting_view$
begin
  if pg_catalog.to_regclass('public.website_leads_report') is null then
    raise exception 'website_leads_report is missing; containment aborted';
  end if;
end
$reporting_view$;

alter view public.website_leads_report set (security_invoker = true);

do $functions$
declare
  function_row record;
begin
  for function_row in
    select
      n.nspname,
      p.proname,
      pg_catalog.pg_get_function_identity_arguments(p.oid) as arguments
    from pg_catalog.pg_proc p
    join pg_catalog.pg_namespace n on n.oid = p.pronamespace
    where n.nspname = 'public'
  loop
    execute format(
      'revoke all on function %I.%I(%s) from public, anon, authenticated',
      function_row.nspname,
      function_row.proname,
      function_row.arguments
    );
    execute format(
      'grant execute on function %I.%I(%s) to service_role',
      function_row.nspname,
      function_row.proname,
      function_row.arguments
    );
  end loop;
end
$functions$;

do $assertions$
declare
  exposed_relation text;
  exposed_function text;
begin
  select c.relname
    into exposed_relation
  from pg_catalog.pg_class c
  join pg_catalog.pg_namespace n on n.oid = c.relnamespace
  where n.nspname = 'public'
    and c.relkind in ('r', 'p', 'v', 'm')
    and (
      pg_catalog.has_table_privilege('anon', c.oid, 'SELECT')
      or pg_catalog.has_table_privilege('authenticated', c.oid, 'SELECT')
    )
  order by c.relname
  limit 1;

  if exposed_relation is not null then
    raise exception 'browser SELECT privilege remains on public.%', exposed_relation;
  end if;

  select p.oid::pg_catalog.regprocedure::text
    into exposed_function
  from pg_catalog.pg_proc p
  join pg_catalog.pg_namespace n on n.oid = p.pronamespace
  where n.nspname = 'public'
    and (
      pg_catalog.has_function_privilege('anon', p.oid, 'EXECUTE')
      or pg_catalog.has_function_privilege('authenticated', p.oid, 'EXECUTE')
    )
  order by p.oid::pg_catalog.regprocedure::text
  limit 1;

  if exposed_function is not null then
    raise exception 'browser EXECUTE privilege remains on public.%', exposed_function;
  end if;

  if not pg_catalog.has_table_privilege(
    'service_role',
    'public.website_leads_report',
    'SELECT'
  ) then
    raise exception 'service_role lost website_leads_report SELECT';
  end if;
end
$assertions$;

commit;
