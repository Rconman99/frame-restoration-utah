-- Activate durable owner-email enqueueing while the OLD handler is still live.
-- Old-handler and manual inserts have no submission_key, so the trigger is
-- deliberately inert for them. Applying this before the new handler closes the
-- window where a retryable direct send could fail without a durable outbox job.
-- Deploy/configure the worker + webhook after this migration, verify health,
-- and deploy the submission-key-aware handler last.

do $preflight$
begin
  if to_regclass('public.leads') is null
    or to_regclass('public.lead_notifications') is null then
    raise exception 'lead notification outbox schema is incomplete';
  end if;
end
$preflight$;

create or replace function public.enqueue_lead_notifications()
returns trigger
language plpgsql
security definer
set search_path = public, pg_temp
as $$
begin
  -- Old handle-lead versions and manual CRM inserts do not set a submission
  -- UUID. Requiring it makes activation safe even if an old direct sender is
  -- briefly live and avoids re-notifying Landon about manually entered leads.
  if new.submission_key is not null and new.tier is distinct from 'spam' then
    insert into public.lead_notifications (
      lead_id,
      recipient_role,
      idempotency_key
    ) values
      (
        new.id,
        'primary',
        'utah-lead/' || coalesce(new.submission_key::text, new.id::text) || '/primary'
      ),
      (
        new.id,
        'backup',
        'utah-lead/' || coalesce(new.submission_key::text, new.id::text) || '/backup'
      )
    on conflict do nothing;
  end if;
  return new;
end;
$$;

revoke all on function public.enqueue_lead_notifications()
  from public, anon, authenticated;

drop trigger if exists leads_enqueue_notifications on public.leads;
create trigger leads_enqueue_notifications
after insert on public.leads
for each row execute function public.enqueue_lead_notifications();

comment on function public.enqueue_lead_notifications() is
  'Cutover phase B: enqueue independent primary/backup owner email jobs for every non-spam lead.';
