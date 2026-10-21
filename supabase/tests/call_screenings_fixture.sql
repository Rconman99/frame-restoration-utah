-- ONLY for an empty disposable test database. Never apply to a market project.
create role anon;
create role authenticated;
create role service_role bypassrls;
grant usage on schema public to anon, authenticated, service_role;
create table public.leads(
  id bigint generated always as identity primary key,
  created_at timestamptz default now(),
  name text not null,
  phone text,
  address text,
  city text,
  source_page text,
  call_source text,
  commission_eligible boolean,
  status text default 'new',
  tier text default 'unclassified',
  tier_classifier text,
  tier_reason text,
  notes text,
  -- Deliberately hostile default: reconciliation must explicitly write NULL so
  -- the production-style notification trigger remains inert.
  submission_key uuid default gen_random_uuid()
);
create table public.lead_notifications(
  id bigint generated always as identity primary key,
  lead_id bigint not null references public.leads(id)
);
create function public.enqueue_lead_notifications() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  if new.submission_key is not null and new.tier is distinct from 'spam' then
    insert into public.lead_notifications(lead_id) values (new.id);
  end if;
  return new;
end $$;
create trigger leads_enqueue_notifications after insert on public.leads
for each row execute function public.enqueue_lead_notifications();
create table public.call_logs(
  call_sid text primary key,
  from_number text not null,
  to_number text,
  city text,
  lead_id bigint references public.leads(id),
  status text,
  notes text,
  source_page text
);
grant select on public.call_logs to service_role;
