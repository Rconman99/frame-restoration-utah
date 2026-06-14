-- Frame Roofing Utah — CRM parity fields backport
-- Prepared: 2026-06-14
--
-- DO NOT APPLY without explicit owner approval.
--
-- Adds the optional completion/payment fields used by /leads.html and lead-crm.
-- The third_party status is intentionally left guarded below because live Utah
-- may already have a status constraint that needs a separate baseline review.

begin;

alter table public.leads
  add column if not exists estimated_completion_date date,
  add column if not exists final_payment_received_at timestamptz;

comment on column public.leads.estimated_completion_date is
  'Internal CRM forecast date for expected job completion.';
comment on column public.leads.final_payment_received_at is
  'Timestamp/date when final payment was received after completion.';

-- Status constraint handling:
-- Existing Utah may already have leads_status_check without third_party. Leave
-- any live status constraint untouched until Phase 0 baseline and live
-- constraint strategy are finalized. If no status CHECK exists, add a separate
-- NOT VALID compatibility constraint for new writes.
do $$
begin
  if not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.leads'::regclass
      and c.contype = 'c'
      and pg_get_constraintdef(c.oid) ilike '%status%'
  )
  and not exists (
    select 1
    from pg_constraint c
    where c.conrelid = 'public.leads'::regclass
      and c.conname = 'leads_status_phase_a_values_check'
  ) then
    alter table public.leads
      add constraint leads_status_phase_a_values_check check (
        status is null or status = any (array[
          'new'::text,
          'contacted'::text,
          'estimated'::text,
          'won'::text,
          'lost'::text,
          'third_party'::text
        ])
      ) not valid;
  end if;
end $$;

commit;
