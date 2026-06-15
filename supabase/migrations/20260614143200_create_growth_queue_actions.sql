-- Frame Roofing Utah — Growth Queue state overlay
-- Prepared: 2026-06-14
--
-- DO NOT APPLY without explicit owner approval.
--
-- The Growth Queue is generated from live CRM/click signals in /leads.html.
-- This table stores only the user's overlay state, keyed by generated action_key,
-- so Done/Snoozed/Assigned survives refreshes while the queue remains dynamic.

begin;

create table if not exists public.growth_queue_actions (
  action_key      text primary key,
  created_at      timestamptz not null default now(),
  updated_at      timestamptz not null default now(),
  last_seen_at    timestamptz not null default now(),

  state           text not null default 'open',
  assigned_to     text,
  snoozed_until   date,
  note            text,
  completed_at    timestamptz,

  action_title    text,
  category        text,
  priority        text,
  updated_by_name text,
  updated_by_role text,

  constraint growth_queue_actions_state_check
    check (state = any (array['open'::text, 'done'::text, 'snoozed'::text])),
  constraint growth_queue_actions_snooze_check
    check (state <> 'snoozed' or snoozed_until is not null)
);

create index if not exists growth_queue_actions_state_idx
  on public.growth_queue_actions (state, snoozed_until);

create index if not exists growth_queue_actions_updated_at_idx
  on public.growth_queue_actions (updated_at desc);

create or replace function public.set_growth_queue_actions_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

do $$
begin
  if not exists (
    select 1
    from pg_trigger
    where tgrelid = 'public.growth_queue_actions'::regclass
      and tgname = 'growth_queue_actions_set_updated_at'
      and not tgisinternal
  ) then
    create trigger growth_queue_actions_set_updated_at
    before update on public.growth_queue_actions
    for each row
    execute function public.set_growth_queue_actions_updated_at();
  end if;
end $$;

comment on table public.growth_queue_actions is
  'PIN-gated Utah CRM Growth Queue state overlay. Service-role-only; generated recommendations remain in leads.html.';
comment on column public.growth_queue_actions.action_key is
  'Stable generated action key, with daily/weekly suffixes for recurring queue items.';
comment on column public.growth_queue_actions.state is
  'open, done, or snoozed. Done and future-snoozed items are hidden by the dashboard.';

alter table public.growth_queue_actions enable row level security;

commit;
