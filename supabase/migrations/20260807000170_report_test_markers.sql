-- Explicit analytics test markers for Utah lead/call reporting.
--
-- Test traffic must never be inferred from customer names. Operators can mark
-- a controlled end-to-end receipt row after the test completes, and reporting
-- excludes only this boolean marker plus the known operator call identity.

alter table public.leads
  add column if not exists is_test boolean not null default false;

alter table public.call_logs
  add column if not exists is_test boolean not null default false;

create index if not exists leads_is_test_created_at_idx
  on public.leads (is_test, created_at desc);

create index if not exists call_logs_is_test_created_at_idx
  on public.call_logs (is_test, created_at desc);

comment on column public.leads.is_test is
  'Explicit operator-controlled marker for synthetic end-to-end leads; never inferred from PII.';

comment on column public.call_logs.is_test is
  'Explicit operator-controlled marker for synthetic end-to-end calls; never inferred from PII.';
