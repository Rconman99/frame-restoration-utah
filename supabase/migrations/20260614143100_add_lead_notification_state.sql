-- Frame Roofing Utah — lead notification state
-- Prepared: 2026-06-14
--
-- DO NOT APPLY without explicit owner approval.
--
-- Lets handle-lead record whether the owner email alert succeeded so /leads.html
-- can surface failures for manual follow-up.

begin;

alter table public.leads
  add column if not exists notified boolean,
  add column if not exists notified_at timestamptz,
  add column if not exists notification_attempts integer not null default 0,
  add column if not exists notification_error text;

comment on column public.leads.notified is
  'True when the owner lead notification email completed successfully.';
comment on column public.leads.notified_at is
  'Timestamp when the owner lead notification email completed successfully.';
comment on column public.leads.notification_attempts is
  'Number of owner email notification attempts recorded by handle-lead.';
comment on column public.leads.notification_error is
  'Last owner email notification failure message, if any.';

create index if not exists leads_notification_failures_idx
  on public.leads (created_at desc)
  where notified = false or notification_error is not null;

commit;
