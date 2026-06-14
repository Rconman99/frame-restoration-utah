-- Frame Roofing Utah — widen leads_status_check to allow 'third_party'
-- Prepared: 2026-06-14
--
-- DO NOT APPLY to live Utah (hdcflshhomzildwqlmwh) without explicit owner approval.
--
-- WHY: third_party / Contractor is now a supported CRM status in /leads.html and the
-- lead-crm Edge Function. The existing leads_status_check (new/contacted/estimated/
-- won/lost) would reject third_party writes, so this widens the allowed set.
--
-- NON-DESTRUCTIVE: Postgres cannot alter a CHECK expression in place, so the only
-- change is DROP CONSTRAINT + ADD CONSTRAINT for *leads_status_check only*, preserving
-- the same constraint name. No tables, columns, views, data, or other constraints are
-- touched. The new set is a strict SUPERSET of the old, so all existing rows already
-- satisfy it — the constraint is added validated (no NOT VALID needed).
--
-- Idempotent: drop-if-exists + add yields exactly one leads_status_check each run.
--
-- This is NOT W3 security remediation — it is a CRM data-model widening only.

begin;

do $$
begin
  if to_regclass('public.leads') is null then
    raise notice 'public.leads not found; skipping leads_status_check widening.';
    return;
  end if;

  alter table public.leads drop constraint if exists leads_status_check;

  alter table public.leads
    add constraint leads_status_check check (
      status is null or status = any (array[
        'new'::text,
        'contacted'::text,
        'estimated'::text,
        'won'::text,
        'lost'::text,
        'third_party'::text
      ])
    );
end $$;

commit;
