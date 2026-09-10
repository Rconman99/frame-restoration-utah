-- Private assistant-screening trace. No new audio recording or transcription.
-- Apply this one migration explicitly; do not replay historical baseline files.
begin;
create table public.call_screenings (
  call_sid text primary key references public.call_logs(call_sid) on delete cascade,
  script_version text not null,
  stage text not null check (stage in ('purpose','clarify','name','done')),
  state jsonb not null check (jsonb_typeof(state) = 'object' and octet_length(state::text) <= 20000),
  owner_decision text check (owner_decision in ('accepted','voicemail','timeout')),
  bridged boolean,
  dial_completed_at timestamptz,
  voicemail_received_at timestamptz,
  review_label text check (review_label in ('customer','existing_relationship','solicitation','unknown')),
  reviewed_by text,
  reviewed_at timestamptz,
  review_notes text check (length(review_notes) <= 2000),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint call_screenings_call_sid_format check (call_sid ~ '^CA[0-9a-fA-F]{32}$'),
  constraint call_screenings_review_provenance check (review_label is null or (reviewed_at is not null and reviewed_by is not null and length(trim(reviewed_by)) > 0))
);
alter table public.call_screenings enable row level security;
revoke all on public.call_screenings from public, anon, authenticated;
grant select, insert, update, delete on public.call_screenings to service_role;
create index call_screenings_created_idx on public.call_screenings(created_at desc);
comment on table public.call_screenings is 'Private screening turns only; speech is caller-reported, not verified lead facts. Unknown/unfinished is not automatically spam or abandonment.';

-- One transaction moves the assistant state and the existing call log together.
-- Owner/terminal call states cannot be rewound by a late Gather callback.
create function public.sync_call_screening_log() returns trigger
language plpgsql security definer set search_path = '' as $$
begin
  new.updated_at := pg_catalog.now();
  update public.call_logs
  set status = case new.state->>'action'
      when 'connect' then 'screened-awaiting-owner'
      when 'reject' then 'screened-solicitation'
      when 'voicemail' then 'screening-insufficient'
      else 'screening' end,
    notes = 'Assistant screening (' || new.script_version ||
      '; caller-reported, speech recognition may be inaccurate). Name: ' ||
      coalesce(nullif(new.state->>'name',''), 'not provided') || '. Reason: ' ||
      coalesce(nullif(new.state->>'purpose',''), 'not provided') ||
      '. Decision: ' || coalesce(new.state->>'reason','unknown') ||
      '. Confirm identity, service address and job details with the caller.'
  where call_sid = new.call_sid
    and status in ('screening','screening-purpose','screening-insufficient','screening-no-input');
  return new;
end $$;
revoke all on function public.sync_call_screening_log() from public, anon, authenticated;
create trigger sync_call_screening_log
before insert or update of stage,state on public.call_screenings
for each row execute function public.sync_call_screening_log();

-- Aggregate review input. Service-role only; no caller text/number in the view.
create view public.call_screening_daily with (security_invoker = true) as
select date_trunc('day', s.created_at at time zone 'UTC') as day_utc, s.script_version,
  l.source_page, count(*) as screened_calls,
  count(*) filter (where s.stage <> 'done') as unfinished_or_unknown,
  count(*) filter (where s.state->>'action' = 'reject') as system_declined,
  count(*) filter (where s.state->>'action' = 'connect') as transfer_requested,
  count(*) filter (where s.owner_decision = 'accepted') as owner_accepted,
  count(*) filter (where s.bridged is true) as confirmed_bridged,
  count(*) filter (where s.bridged is false) as confirmed_not_bridged,
  count(*) filter (where s.voicemail_received_at is not null) as voicemail_received,
  count(*) filter (where s.review_label is not null) as human_reviewed,
  count(*) filter (where s.review_label = 'customer' and s.state->>'action' = 'reject') as reviewed_customers_declined,
  count(*) filter (where s.review_label = 'solicitation' and s.bridged is true) as reviewed_sales_calls_bridged
from public.call_screenings s join public.call_logs l using (call_sid)
group by 1,2,3;
revoke all on public.call_screening_daily from public, anon, authenticated;
grant select on public.call_screening_daily to service_role;
commit;
