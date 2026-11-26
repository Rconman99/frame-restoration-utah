-- ONLY for an empty disposable test database. Never apply to a market project.
--
-- Reproduces pg_net's OWN installation grants, verbatim from
-- supabase/pg_net v0.19.5, sql/pg_net.sql:355-357:
--
--     grant usage on schema net to PUBLIC;
--     grant all on all sequences in schema net to PUBLIC;
--     grant all on all tables in schema net to PUBLIC;
--
-- That is the state of a stock Supabase project after `create extension
-- pg_net`: PUBLIC — and therefore anon, authenticated and service_role — can
-- read net.http_request_queue, which holds this worker's Authorization header,
-- and can insert, update or delete net._http_response, which is the only
-- evidence the health view reports on. Nothing in supautils.conf or Supabase's
-- extension custom scripts revokes it (checked 2026-11-26).
--
-- Applied on top of pgcron_lead_notification_worker_fixture.sql, this must make
-- 20261118000000 RAISE before it schedules anything.

grant usage on schema net to PUBLIC;
grant all on all sequences in schema net to PUBLIC;
grant all on all tables in schema net to PUBLIC;
