-- CRM status parity requested by the Utah sales operator: make UL requests and
-- spam first-class lead statuses instead of redundant labels/tiers.

begin;

do $status_widen$
begin
  if to_regclass('public.leads') is null then
    raise exception 'public.leads is missing; CRM status widening aborted';
  end if;

  alter table public.leads
    drop constraint if exists leads_status_check;
  alter table public.leads
    drop constraint if exists leads_status_phase_a_values_check;

  alter table public.leads
    add constraint leads_status_check check (
      status is null or status = any (array[
        'new'::text,
        'contacted'::text,
        'estimated'::text,
        'won'::text,
        'lost'::text,
        'third_party'::text,
        'ul_request'::text,
        'spam'::text
      ])
    );
end
$status_widen$;

commit;
