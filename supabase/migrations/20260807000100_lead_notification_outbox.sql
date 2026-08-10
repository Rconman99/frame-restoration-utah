-- Utah lead intake idempotency + durable, service-role-only notification state.
-- This first phase deliberately creates storage WITHOUT the enqueue trigger.
-- Safe cutover: while the OLD handler is live, apply this file plus additive
-- migrations 20260807000160 and 20260807000165. The old handler never supplies
-- submission_key, so 00165's trigger remains inert for old-handler inserts.
-- Deploy/configure the worker and webhook next; deploy the outbox-aware handler
-- only after recovery health passes. Keeping storage and activation separate
-- still permits rollback between schema steps without dropping durable state.

begin;

alter table public.leads
  add column if not exists submission_key uuid,
  add column if not exists notified boolean,
  add column if not exists notified_at timestamptz,
  add column if not exists notification_attempts integer not null default 0,
  add column if not exists notification_error text;

-- This index name is owned by this migration. Rebuild it transactionally instead
-- of trusting IF NOT EXISTS: a partial/prepared schema may contain a same-named
-- non-unique or wrong-column index. Duplicate data aborts before the drop, and a
-- failed CREATE rolls the whole transaction back without weakening protection.
do $leads_submission_index_preflight$
begin
  if exists (
    select submission_key
      from public.leads
     where submission_key is not null
     group by submission_key
    having count(*) > 1
  ) then
    raise exception
      'duplicate leads.submission_key values block the exact unique index contract';
  end if;

  if to_regclass('public.leads_submission_key_uidx') is not null
    and exists (
      select 1
        from pg_catalog.pg_constraint
       where conindid = to_regclass('public.leads_submission_key_uidx')
    ) then
    raise exception
      'leads_submission_key_uidx is constraint-owned; refusing unsafe index replacement';
  end if;
end
$leads_submission_index_preflight$;

drop index if exists public.leads_submission_key_uidx;
create unique index leads_submission_key_uidx
  on public.leads (submission_key)
  where submission_key is not null;

create table if not exists public.lead_notifications (
  id uuid primary key default gen_random_uuid(),
  lead_id bigint not null references public.leads(id) on delete cascade,
  recipient_role text not null check (recipient_role in ('primary', 'backup')),
  channel text not null default 'email' check (channel = 'email'),
  provider text not null default 'resend' check (provider = 'resend'),
  status text not null default 'pending' check (
    status in ('pending', 'sending', 'accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed')
  ),
  idempotency_key text not null unique,
  delivery_from text,
  delivery_to text,
  delivery_reply_to text,
  delivery_subject text,
  delivery_text text,
  delivery_tag_name text,
  delivery_tag_value text,
  provider_message_id text,
  attempts integer not null default 0,
  retryable boolean not null default true,
  next_attempt_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz,
  last_event_at timestamptz,
  last_error_code text,
  last_error text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (lead_id, recipient_role, channel)
);

-- CREATE TABLE IF NOT EXISTS does not repair an earlier partial/prepared table.
-- Add the complete contract before any index or function references a column;
-- incompatible/null legacy data fails this transaction instead of producing a
-- half-upgraded queue.
alter table public.lead_notifications
  add column if not exists id uuid default gen_random_uuid(),
  add column if not exists lead_id bigint references public.leads(id) on delete cascade,
  add column if not exists recipient_role text,
  add column if not exists channel text default 'email',
  add column if not exists provider text default 'resend',
  add column if not exists status text default 'pending',
  add column if not exists idempotency_key text,
  add column if not exists delivery_from text,
  add column if not exists delivery_to text,
  add column if not exists delivery_reply_to text,
  add column if not exists delivery_subject text,
  add column if not exists delivery_text text,
  add column if not exists delivery_tag_name text,
  add column if not exists delivery_tag_value text,
  add column if not exists provider_message_id text,
  add column if not exists attempts integer default 0,
  add column if not exists retryable boolean default true,
  add column if not exists next_attempt_at timestamptz default now(),
  add column if not exists accepted_at timestamptz,
  add column if not exists delivered_at timestamptz,
  add column if not exists last_event_at timestamptz,
  add column if not exists last_error_code text,
  add column if not exists last_error text,
  add column if not exists created_at timestamptz default now(),
  add column if not exists updated_at timestamptz default now(),
  add column if not exists health_acknowledged_at timestamptz,
  add column if not exists claim_version bigint default 0,
  add column if not exists lease_expires_at timestamptz;

update public.lead_notifications
   set id = coalesce(id, gen_random_uuid()),
       channel = coalesce(channel, 'email'),
       provider = coalesce(provider, 'resend'),
       status = coalesce(status, 'pending'),
       attempts = coalesce(attempts, 0),
       retryable = coalesce(retryable, true),
       next_attempt_at = coalesce(next_attempt_at, now()),
       created_at = coalesce(created_at, now()),
       updated_at = coalesce(updated_at, now()),
       claim_version = coalesce(claim_version, 0);

-- An attempted idempotent request cannot safely acquire a new tag later:
-- Resend correctly treats that as a different payload for the same key. Refuse
-- automatic repair of any attempted pre-tag row; it requires provider-evidence
-- review and explicit operator reconciliation.
do $pretag_attempt_preflight$
begin
  if exists (
    select 1 from public.lead_notifications
     where attempts > 0
       and (
         delivery_from is null or delivery_to is null
         or delivery_subject is null or delivery_text is null
         or delivery_tag_name is distinct from 'frame_notification'
         or delivery_tag_value is distinct from 'utah_owner_lead_v1'
       )
  ) then
    raise exception
      'attempted notification has no provably identical frozen tagged payload';
  end if;
end
$pretag_attempt_preflight$;

-- A never-attempted pending prepared row may safely bind the stable routing tag
-- before its first provider request.
update public.lead_notifications
   set delivery_tag_name = 'frame_notification',
       delivery_tag_value = 'utah_owner_lead_v1'
 where delivery_from is not null
   and delivery_to is not null
   and delivery_subject is not null
   and delivery_text is not null
   and delivery_tag_name is null
   and delivery_tag_value is null
   and attempts = 0
   and status = 'pending'
   and provider_message_id is null
   and accepted_at is null
   and delivered_at is null
   and last_event_at is null;

alter table public.lead_notifications
  alter column id set default gen_random_uuid(),
  alter column id set not null,
  alter column lead_id set not null,
  alter column recipient_role set not null,
  alter column channel set default 'email',
  alter column channel set not null,
  alter column provider set default 'resend',
  alter column provider set not null,
  alter column status set default 'pending',
  alter column status set not null,
  alter column idempotency_key set not null,
  alter column attempts set default 0,
  alter column attempts set not null,
  alter column retryable set default true,
  alter column retryable set not null,
  alter column next_attempt_at set default now(),
  alter column next_attempt_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null,
  alter column updated_at set default now(),
  alter column updated_at set not null,
  alter column claim_version set default 0,
  alter column claim_version set not null;

do $schema_contract$
declare
  expected record;
  actual_type text;
begin
  for expected in
    select * from (values
      ('id', 'uuid'),
      ('lead_id', 'bigint'),
      ('recipient_role', 'text'),
      ('channel', 'text'),
      ('provider', 'text'),
      ('status', 'text'),
      ('idempotency_key', 'text'),
      ('delivery_from', 'text'),
      ('delivery_to', 'text'),
      ('delivery_reply_to', 'text'),
      ('delivery_subject', 'text'),
      ('delivery_text', 'text'),
      ('delivery_tag_name', 'text'),
      ('delivery_tag_value', 'text'),
      ('provider_message_id', 'text'),
      ('attempts', 'integer'),
      ('retryable', 'boolean'),
      ('next_attempt_at', 'timestamp with time zone'),
      ('accepted_at', 'timestamp with time zone'),
      ('delivered_at', 'timestamp with time zone'),
      ('last_event_at', 'timestamp with time zone'),
      ('last_error_code', 'text'),
      ('last_error', 'text'),
      ('created_at', 'timestamp with time zone'),
      ('updated_at', 'timestamp with time zone'),
      ('health_acknowledged_at', 'timestamp with time zone'),
      ('claim_version', 'bigint'),
      ('lease_expires_at', 'timestamp with time zone')
    ) as contract(column_name, data_type)
  loop
    select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
      into actual_type
      from pg_catalog.pg_attribute as attribute
     where attribute.attrelid = 'public.lead_notifications'::regclass
       and attribute.attname = expected.column_name
       and not attribute.attisdropped;
    if actual_type is distinct from expected.data_type then
      raise exception 'lead_notifications.% type %, expected %',
        expected.column_name, actual_type, expected.data_type;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.lead_notifications'::regclass and contype = 'p'
  ) then
    alter table public.lead_notifications
      add constraint lead_notifications_pkey primary key (id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
      join pg_catalog.pg_attribute
        on pg_attribute.attrelid = pg_constraint.conrelid
       and pg_attribute.attname = 'id'
     where pg_constraint.conrelid = 'public.lead_notifications'::regclass
       and pg_constraint.contype = 'p'
       and pg_constraint.conkey = array[pg_attribute.attnum]::smallint[]
  ) then
    raise exception 'lead_notifications primary key must be exactly (id)';
  end if;
end
$schema_contract$;

-- These constraint names are owned by this migration. Recreate them
-- transactionally so a weaker same-named prepared definition cannot bypass the
-- final contract.
alter table public.lead_notifications
  drop constraint if exists lead_notifications_lead_id_fkey,
  drop constraint if exists lead_notifications_values_check,
  drop constraint if exists lead_notifications_delivery_contract_check;

alter table public.lead_notifications
  add constraint lead_notifications_lead_id_fkey foreign key (lead_id)
    references public.leads(id) on delete cascade,
  add constraint lead_notifications_values_check check (
    recipient_role in ('primary', 'backup')
    and channel = 'email'
    and provider = 'resend'
    and status in ('pending', 'sending', 'accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed')
    and attempts between 0 and 8
    and claim_version >= 0
    and char_length(idempotency_key) between 1 and 240
  ),
  add constraint lead_notifications_delivery_contract_check check (
    (
      delivery_from is null and delivery_to is null
      and delivery_reply_to is null and delivery_subject is null
      and delivery_text is null and delivery_tag_name is null
      and delivery_tag_value is null
    ) or (
      delivery_from is not null and delivery_to is not null
      and delivery_subject is not null and delivery_text is not null
      and delivery_tag_name = 'frame_notification'
      and delivery_tag_value = 'utah_owner_lead_v1'
      and char_length(delivery_from) between 3 and 320
      and char_length(delivery_to) between 3 and 254
      and (delivery_reply_to is null or char_length(delivery_reply_to) between 3 and 254)
      and char_length(delivery_subject) between 1 and 500
      and char_length(delivery_text) between 1 and 20000
      and delivery_from !~ '[\r\n]'
      and delivery_to !~ '[\r\n]'
      and coalesce(delivery_reply_to, '') !~ '[\r\n]'
    )
  );

-- A superseded prepared migration activated enqueueing in its schema phase.
-- Refuse to proceed if that trigger already created jobs for legacy/manual
-- leads, because deploying the worker could notify owners about historical
-- rows. A reviewed operator must reconcile those rows explicitly first.
do $prepared_outbox_preflight$
begin
  if exists (
    select 1
      from public.lead_notifications as jobs
      left join public.leads as leads on leads.id = jobs.lead_id
     where leads.id is null or leads.submission_key is null
  ) then
    raise exception
      'unsafe prepared notification jobs exist for legacy/manual leads';
  end if;
end
$prepared_outbox_preflight$;

-- Phase A is storage-only even when repairing the superseded prepared schema.
drop trigger if exists leads_enqueue_notifications on public.leads;
drop function if exists public.enqueue_lead_notifications();

update public.lead_notifications
   set lease_expires_at = updated_at + interval '10 minutes'
 where status = 'sending' and lease_expires_at is null;

alter table public.lead_notifications enable row level security;
revoke all on table public.lead_notifications from public, anon, authenticated;
grant all on table public.lead_notifications to service_role;

create index if not exists lead_notifications_retry_idx
  on public.lead_notifications (next_attempt_at, created_at)
  where status in ('pending', 'failed', 'delayed');
create index if not exists lead_notifications_provider_id_idx
  on public.lead_notifications (provider_message_id)
  where provider_message_id is not null;
create index if not exists lead_notifications_unacknowledged_health_idx
  on public.lead_notifications (status, retryable, updated_at)
  where health_acknowledged_at is null;

-- These correctness indexes are also migration-owned. A same-named hostile or
-- stale definition must never make an IF NOT EXISTS statement silently succeed.
-- Refuse dependency-bearing indexes, reject duplicate data explicitly, then
-- rebuild the exact definitions inside this transaction.
do $notification_unique_index_preflight$
begin
  if exists (
    select idempotency_key
      from public.lead_notifications
     group by idempotency_key
    having count(*) > 1
  ) then
    raise exception
      'duplicate lead notification idempotency keys block the exact unique index contract';
  end if;

  if exists (
    select lead_id, recipient_role, channel
      from public.lead_notifications
     group by lead_id, recipient_role, channel
    having count(*) > 1
  ) then
    raise exception
      'duplicate lead notification routes block the exact unique index contract';
  end if;

  if to_regclass('public.lead_notifications_idempotency_key_uidx') is not null
    and exists (
      select 1
        from pg_catalog.pg_constraint
       where conindid =
         to_regclass('public.lead_notifications_idempotency_key_uidx')
    ) then
    raise exception
      'lead_notifications_idempotency_key_uidx is constraint-owned; refusing unsafe index replacement';
  end if;

  if to_regclass('public.lead_notifications_route_uidx') is not null
    and exists (
      select 1
        from pg_catalog.pg_constraint
       where conindid = to_regclass('public.lead_notifications_route_uidx')
    ) then
    raise exception
      'lead_notifications_route_uidx is constraint-owned; refusing unsafe index replacement';
  end if;
end
$notification_unique_index_preflight$;

drop index if exists public.lead_notifications_idempotency_key_uidx;
drop index if exists public.lead_notifications_route_uidx;

create unique index lead_notifications_idempotency_key_uidx
  on public.lead_notifications (idempotency_key);
create unique index lead_notifications_route_uidx
  on public.lead_notifications (lead_id, recipient_role, channel);

-- Both the inline sender and recovery worker use this one atomic claim. The
-- expected version closes selection/claim ABA races; completion must match the
-- returned incremented version. A bounded lease permits recovery after a dead
-- worker without allowing two live claimants to own the same attempt. The
-- first successful claim also freezes the complete provider payload; retries
-- reuse it verbatim with the same Resend idempotency key even if CRM fields or
-- environment routing change later.
drop function if exists public.claim_lead_notification(uuid, bigint);
drop function if exists public.claim_lead_notification(
  uuid, bigint, text, text, text, text, text
);

create or replace function public.claim_lead_notification(
  p_job_id uuid,
  p_expected_version bigint,
  p_delivery_from text,
  p_delivery_to text,
  p_delivery_reply_to text,
  p_delivery_subject text,
  p_delivery_text text,
  p_delivery_tag_name text,
  p_delivery_tag_value text
)
returns table (
  id uuid,
  lead_id bigint,
  recipient_role text,
  idempotency_key text,
  attempts integer,
  status text,
  retryable boolean,
  claim_version bigint,
  lease_expires_at timestamptz,
  delivery_from text,
  delivery_to text,
  delivery_reply_to text,
  delivery_subject text,
  delivery_text text,
  delivery_tag_name text,
  delivery_tag_value text
)
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
begin
  if p_job_id is null or p_expected_version is null or p_expected_version < 0
    or char_length(coalesce(p_delivery_from, '')) not between 3 and 320
    or char_length(coalesce(p_delivery_to, '')) not between 3 and 254
    or (
      p_delivery_reply_to is not null
      and char_length(p_delivery_reply_to) not between 3 and 254
    )
    or char_length(coalesce(p_delivery_subject, '')) not between 1 and 500
    or char_length(coalesce(p_delivery_text, '')) not between 1 and 20000
    or p_delivery_from ~ '[\r\n]'
    or p_delivery_to ~ '[\r\n]'
    or coalesce(p_delivery_reply_to, '') ~ '[\r\n]'
    or p_delivery_tag_name is distinct from 'frame_notification'
    or p_delivery_tag_value is distinct from 'utah_owner_lead_v1'
  then
    raise exception using
      errcode = '22023',
      message = 'invalid notification claim identity';
  end if;

  return query
  update public.lead_notifications as jobs
     set status = 'sending',
         attempts = jobs.attempts + 1,
         claim_version = jobs.claim_version + 1,
         lease_expires_at = v_now + interval '10 minutes',
         delivery_from = coalesce(jobs.delivery_from, p_delivery_from),
         delivery_to = coalesce(jobs.delivery_to, p_delivery_to),
         delivery_reply_to = case
           when jobs.delivery_from is null then p_delivery_reply_to
           else jobs.delivery_reply_to
         end,
         delivery_subject = coalesce(jobs.delivery_subject, p_delivery_subject),
         delivery_text = coalesce(jobs.delivery_text, p_delivery_text),
         delivery_tag_name = coalesce(jobs.delivery_tag_name, p_delivery_tag_name),
         delivery_tag_value = coalesce(jobs.delivery_tag_value, p_delivery_tag_value),
         updated_at = v_now
   where jobs.id = p_job_id
     and jobs.claim_version = p_expected_version
     and jobs.retryable = true
     and jobs.attempts < 8
     and (
       (
         jobs.delivery_from is null
         and jobs.delivery_to is null
         and jobs.delivery_reply_to is null
         and jobs.delivery_subject is null
         and jobs.delivery_text is null
         and jobs.delivery_tag_name is null
         and jobs.delivery_tag_value is null
       )
       or (
         jobs.delivery_from = p_delivery_from
         and jobs.delivery_to = p_delivery_to
         and jobs.delivery_reply_to is not distinct from p_delivery_reply_to
         and jobs.delivery_subject = p_delivery_subject
         and jobs.delivery_text = p_delivery_text
         and jobs.delivery_tag_name = p_delivery_tag_name
         and jobs.delivery_tag_value = p_delivery_tag_value
       )
     )
     and (
       (
         jobs.status in ('pending', 'failed')
         and jobs.next_attempt_at <= v_now
       )
       or (
         jobs.status = 'sending'
         and coalesce(
           jobs.lease_expires_at,
           jobs.updated_at + interval '10 minutes'
         ) <= v_now
       )
     )
  returning
    jobs.id,
    jobs.lead_id,
    jobs.recipient_role,
    jobs.idempotency_key,
    jobs.attempts,
    jobs.status,
    jobs.retryable,
    jobs.claim_version,
    jobs.lease_expires_at,
    jobs.delivery_from,
    jobs.delivery_to,
    jobs.delivery_reply_to,
    jobs.delivery_subject,
    jobs.delivery_text,
    jobs.delivery_tag_name,
    jobs.delivery_tag_value;
end;
$$;

revoke all on function public.claim_lead_notification(
  uuid, bigint, text, text, text, text, text, text, text
)
  from public, anon, authenticated;
grant execute on function public.claim_lead_notification(
  uuid, bigint, text, text, text, text, text, text, text
)
  to service_role;

comment on function public.claim_lead_notification(
  uuid, bigint, text, text, text, text, text, text, text
) is
  'Service-role-only atomic due/stale claim with a ten-minute lease, monotonic completion version, and immutable provider payload.';

create or replace function public.complete_lead_notification_claim(
  p_job_id uuid,
  p_claim_version bigint,
  p_status text,
  p_retryable boolean,
  p_attempts integer,
  p_provider_message_id text,
  p_accepted_at timestamptz,
  p_next_attempt_at timestamptz,
  p_last_error_code text,
  p_last_error text
)
returns boolean
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lead_id bigint;
  v_role text;
  v_attempts integer;
begin
  if p_job_id is null or p_claim_version is null or p_claim_version < 1
    or p_status not in ('accepted', 'failed')
    or p_attempts is null or p_attempts < 0 or p_attempts > 8
    or coalesce(length(p_provider_message_id), 0) > 240
    or coalesce(length(p_last_error_code), 0) > 240
    or coalesce(length(p_last_error), 0) > 500
    or (
      p_status = 'accepted'
      and (
        p_retryable is distinct from false
        or coalesce(p_provider_message_id, '') = ''
        or p_accepted_at is null
        or p_last_error_code is not null
        or p_last_error is not null
      )
    )
    or (
      p_status = 'failed'
      and (
        coalesce(p_last_error_code, '') = ''
        or p_next_attempt_at is null
        or p_provider_message_id is not null
        or p_accepted_at is not null
      )
    )
  then
    raise exception using
      errcode = '22023',
      message = 'invalid notification completion';
  end if;

  update public.lead_notifications as jobs
     set status = p_status,
         retryable = p_retryable,
         attempts = p_attempts,
         provider_message_id = p_provider_message_id,
         accepted_at = case
           when p_status = 'accepted' then p_accepted_at
           else jobs.accepted_at
         end,
         next_attempt_at = case
           when p_status = 'failed' then p_next_attempt_at
           else jobs.next_attempt_at
         end,
         last_error_code = p_last_error_code,
         last_error = p_last_error,
         -- Every completed attempt starts a new health epoch. In particular,
         -- an old acknowledged retryable failure must not suppress the later
         -- "accepted but no delivery webhook" SLA alarm.
         health_acknowledged_at = null,
         lease_expires_at = null,
         updated_at = clock_timestamp()
   where jobs.id = p_job_id
     and jobs.status = 'sending'
     and jobs.claim_version = p_claim_version
     and p_attempts between greatest(jobs.attempts - 1, 0) and jobs.attempts
  returning jobs.lead_id, jobs.recipient_role, jobs.attempts
  into v_lead_id, v_role, v_attempts;

  if not found then return false; end if;

  if v_role = 'primary' then
    update public.leads
       set notified = p_status = 'accepted',
           notified_at = case
             when p_status = 'accepted' then p_accepted_at
             else notified_at
           end,
           notification_attempts = greatest(
             coalesce(notification_attempts, 0),
             v_attempts
           ),
           notification_error = case
             when p_status = 'accepted' then null
             else p_last_error_code
           end
     where id = v_lead_id;
  end if;

  return true;
end;
$$;

revoke all on function public.complete_lead_notification_claim(
  uuid, bigint, text, boolean, integer, text, timestamptz, timestamptz, text, text
) from public, anon, authenticated;
grant execute on function public.complete_lead_notification_claim(
  uuid, bigint, text, boolean, integer, text, timestamptz, timestamptz, text, text
) to service_role;

comment on function public.complete_lead_notification_claim(
  uuid, bigint, text, boolean, integer, text, timestamptz, timestamptz, text, text
) is
  'Version-CAS notification completion that atomically updates the outbox and primary legacy lead projection.';

create or replace function public.exhaust_lead_notification_claims()
returns integer
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_now timestamptz := clock_timestamp();
  v_count integer;
begin
  with exhausted as (
    update public.lead_notifications as jobs
       set status = 'failed',
           retryable = false,
           last_error_code = 'retry_exhausted',
           last_error = 'Owner email retry limit reached; manual review required.',
           health_acknowledged_at = null,
           claim_version = jobs.claim_version + 1,
           lease_expires_at = null,
           updated_at = v_now
     where jobs.retryable = true
       and jobs.attempts >= 8
       and (
         jobs.status in ('pending', 'failed')
         or (
           jobs.status = 'sending'
           and coalesce(
             jobs.lease_expires_at,
             jobs.updated_at + interval '10 minutes'
           ) <= v_now
         )
       )
    returning jobs.lead_id, jobs.recipient_role, jobs.attempts
  ), primary_projection as (
    update public.leads as leads
       set notified = false,
           notification_attempts = greatest(
             coalesce(leads.notification_attempts, 0),
             exhausted.attempts
           ),
           notification_error = 'retry_exhausted'
      from exhausted
     where exhausted.recipient_role = 'primary'
       and leads.id = exhausted.lead_id
    returning leads.id
  )
  select count(*)::integer
    into v_count
    from exhausted;
  return v_count;
end;
$$;

revoke all on function public.exhaust_lead_notification_claims()
  from public, anon, authenticated;
grant execute on function public.exhaust_lead_notification_claims()
  to service_role;

comment on function public.exhaust_lead_notification_claims() is
  'Atomically terminalizes only unclaimed or lease-expired retry-exhausted jobs and invalidates stale completions.';

create table if not exists public.lead_notification_events (
  event_id text primary key,
  provider_message_id text not null,
  event_type text not null,
  event_status text not null,
  occurred_at timestamptz not null,
  applied_at timestamptz,
  created_at timestamptz not null default now()
);

-- Repair an earlier prepared event table before reconciliation references the
-- newer applied_at receipt. As with the outbox contract above, incompatible or
-- incomplete legacy rows stop the transaction instead of leaving a function
-- that fails only when the first delivery webhook arrives.
alter table public.lead_notification_events
  add column if not exists event_id text,
  add column if not exists provider_message_id text,
  add column if not exists event_type text,
  add column if not exists event_status text,
  add column if not exists occurred_at timestamptz,
  add column if not exists applied_at timestamptz,
  add column if not exists created_at timestamptz default now();

update public.lead_notification_events
   set created_at = coalesce(created_at, now());

alter table public.lead_notification_events
  alter column event_id set not null,
  alter column provider_message_id set not null,
  alter column event_type set not null,
  alter column event_status set not null,
  alter column occurred_at set not null,
  alter column created_at set default now(),
  alter column created_at set not null;

do $event_schema_contract$
declare
  expected record;
  actual_type text;
begin
  for expected in
    select * from (values
      ('event_id', 'text'),
      ('provider_message_id', 'text'),
      ('event_type', 'text'),
      ('event_status', 'text'),
      ('occurred_at', 'timestamp with time zone'),
      ('applied_at', 'timestamp with time zone'),
      ('created_at', 'timestamp with time zone')
    ) as contract(column_name, data_type)
  loop
    select pg_catalog.format_type(attribute.atttypid, attribute.atttypmod)
      into actual_type
      from pg_catalog.pg_attribute as attribute
     where attribute.attrelid = 'public.lead_notification_events'::regclass
       and attribute.attname = expected.column_name
       and not attribute.attisdropped;
    if actual_type is distinct from expected.data_type then
      raise exception 'lead_notification_events.% type %, expected %',
        expected.column_name, actual_type, expected.data_type;
    end if;
  end loop;

  if not exists (
    select 1 from pg_catalog.pg_constraint
     where conrelid = 'public.lead_notification_events'::regclass
       and contype = 'p'
  ) then
    alter table public.lead_notification_events
      add constraint lead_notification_events_pkey primary key (event_id);
  end if;
  if not exists (
    select 1 from pg_catalog.pg_constraint
      join pg_catalog.pg_attribute
        on pg_attribute.attrelid = pg_constraint.conrelid
       and pg_attribute.attname = 'event_id'
     where pg_constraint.conrelid = 'public.lead_notification_events'::regclass
       and pg_constraint.contype = 'p'
       and pg_constraint.conkey = array[pg_attribute.attnum]::smallint[]
  ) then
    raise exception
      'lead_notification_events primary key must be exactly (event_id)';
  end if;
end
$event_schema_contract$;

alter table public.lead_notification_events
  drop constraint if exists lead_notification_events_values_check;
alter table public.lead_notification_events
  add constraint lead_notification_events_values_check check (
    char_length(event_id) between 1 and 240
    and char_length(provider_message_id) between 1 and 240
    and char_length(event_type) between 1 and 240
    and event_status in ('accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed')
  );

alter table public.lead_notification_events enable row level security;
revoke all on table public.lead_notification_events from public, anon, authenticated;
grant all on table public.lead_notification_events to service_role;

create or replace function public.resend_notification_status_rank(
  p_status text
)
returns smallint
language sql
immutable
strict
set search_path = ''
as $$
  select case p_status
    when 'pending' then 0
    when 'sending' then 1
    when 'accepted' then 10
    when 'delayed' then 20
    when 'delivered' then 30
    when 'failed' then 40
    when 'bounced' then 50
    when 'complained' then 60
    else -1
  end::smallint;
$$;

revoke all on function public.resend_notification_status_rank(text)
  from public, anon, authenticated;
grant execute on function public.resend_notification_status_rank(text)
  to service_role;

create or replace function public.reconcile_resend_notification_events(
  p_provider_message_id text default null
)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  event_row record;
  matched_count integer;
  applied_count integer := 0;
begin
  for event_row in
    select event_id, provider_message_id, event_type, event_status, occurred_at
      from public.lead_notification_events
     where applied_at is null
       and (
         p_provider_message_id is null
         or provider_message_id = p_provider_message_id
       )
     order by occurred_at, event_id
     for update skip locked
  loop
    with event_target as (
      select jobs.id,
        (
          jobs.last_event_at is null
          or (
            event_row.occurred_at > jobs.last_event_at
            and public.resend_notification_status_rank(event_row.event_status)
              >= public.resend_notification_status_rank(jobs.status)
          )
          or (
            event_row.occurred_at = jobs.last_event_at
            and public.resend_notification_status_rank(event_row.event_status)
              > public.resend_notification_status_rank(jobs.status)
          )
        ) as should_apply
      from public.lead_notifications as jobs
      where jobs.provider_message_id = event_row.provider_message_id
      for update
    )
    update public.lead_notifications as jobs
       set status = case
             when event_target.should_apply then event_row.event_status
             else jobs.status
           end,
           retryable = case
             when event_target.should_apply then false
             else jobs.retryable
           end,
           delivered_at = case
             when event_target.should_apply
               and event_row.event_status = 'delivered'
               then event_row.occurred_at
             else jobs.delivered_at
           end,
           last_event_at = case
             when event_target.should_apply then event_row.occurred_at
             else jobs.last_event_at
           end,
           last_error_code = case
             when not event_target.should_apply then jobs.last_error_code
             when event_row.event_status in ('delayed', 'bounced', 'complained', 'failed')
               then event_row.event_type
             when event_row.event_status in ('accepted', 'delivered') then null
             else jobs.last_error_code
           end,
           -- A newer provider event starts a new health epoch. Stale/equal
           -- lower-precedence events preserve the acknowledgement unchanged.
           health_acknowledged_at = case
             when event_target.should_apply then null
             else jobs.health_acknowledged_at
           end,
           claim_version = case
             when event_target.should_apply then jobs.claim_version + 1
             else jobs.claim_version
           end,
           lease_expires_at = case
             when event_target.should_apply then null
             else jobs.lease_expires_at
           end,
           updated_at = case
             when event_target.should_apply then clock_timestamp()
             else jobs.updated_at
           end
      from event_target
     where jobs.id = event_target.id;
    get diagnostics matched_count = row_count;

    if matched_count > 0 then
      update public.lead_notification_events
         set applied_at = now()
       where event_id = event_row.event_id and applied_at is null;
      applied_count := applied_count + 1;
    end if;
  end loop;

  return applied_count;
end;
$$;

revoke all on function public.reconcile_resend_notification_events(text)
  from public, anon, authenticated;
grant execute on function public.reconcile_resend_notification_events(text)
  to service_role;

-- A superseded prepared function used this exact signature but returned
-- boolean. PostgreSQL cannot change a function return type with CREATE OR
-- REPLACE, so remove that obsolete contract explicitly before installing the
-- durable applied/duplicate/unmatched result state machine.
drop function if exists public.apply_resend_notification_event(
  text, text, text, text, timestamptz
);

create function public.apply_resend_notification_event(
  p_event_id text,
  p_provider_message_id text,
  p_event_type text,
  p_event_status text,
  p_occurred_at timestamptz
)
returns text
language plpgsql
security definer
set search_path = public, pg_temp
as $$
declare
  inserted_count integer;
  existing_event public.lead_notification_events%rowtype;
  applied_count integer;
begin
  if p_event_status not in ('accepted', 'delivered', 'delayed', 'bounced', 'complained', 'failed') then
    raise exception 'unsupported notification status';
  end if;
  if coalesce(length(p_event_id), 0) > 240
    or coalesce(length(p_provider_message_id), 0) > 240
    or p_event_id = ''
    or p_provider_message_id = '' then
    raise exception 'invalid notification event identity';
  end if;

  insert into public.lead_notification_events (
    event_id, provider_message_id, event_type, event_status, occurred_at
  ) values (
    p_event_id, p_provider_message_id, p_event_type, p_event_status, p_occurred_at
  ) on conflict (event_id) do nothing;
  get diagnostics inserted_count = row_count;

  select * into existing_event
    from public.lead_notification_events
   where event_id = p_event_id;
  if existing_event.provider_message_id <> p_provider_message_id
    or existing_event.event_type <> p_event_type
    or existing_event.event_status <> p_event_status
    or existing_event.occurred_at <> p_occurred_at then
    raise exception 'notification event replay payload mismatch';
  end if;
  if inserted_count = 0 and existing_event.applied_at is not null then
    return 'duplicate';
  end if;

  applied_count := public.reconcile_resend_notification_events(
    p_provider_message_id
  );
  if applied_count > 0 then return 'applied'; end if;
  return 'unmatched';
end;
$$;

revoke all on function public.apply_resend_notification_event(text, text, text, text, timestamptz)
  from public, anon, authenticated;
grant execute on function public.apply_resend_notification_event(text, text, text, text, timestamptz)
  to service_role;

comment on table public.lead_notifications is
  'Durable provider-status outbox for independent primary and backup lead email notifications. Service-role only.';
comment on column public.lead_notifications.status is
  'accepted means provider HTTP acceptance; delivered requires a verified provider webhook event.';
comment on column public.leads.notified is
  'True after the primary owner email is accepted by the provider; not proof of inbox delivery.';
comment on table public.lead_notification_events is
  'Replay-protected Resend delivery metadata. Unmatched early events remain unapplied for scheduled reconciliation; stores no email body or duplicated lead PII.';
comment on column public.lead_notifications.health_acknowledged_at is
  'Operator acknowledgement for a durable notification health alarm. New adverse provider state clears this value.';

commit;
