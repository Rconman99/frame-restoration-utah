-- ONLY for an empty disposable test database. Never apply to a market project.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.call_logs(call_sid text primary key, status text, notes text, source_page text);
grant select on public.call_logs to service_role;
