-- Frame Restoration Utah — application-level SMS opt-out state (TCPA / FCC 26-67, 2026-11-11).
-- NOT APPLIED. Read-only audit fix: apply only with Ryan's approval, and BEFORE
-- deploying the edge functions that read it (they fail closed on a missing
-- table: customer texts are blocked, owner alerts are unaffected).
-- Stores no message body. No expiry: deleting a STOP row would make a
-- suppressed number look sendable.

create table if not exists public.sms_contact_preferences (
  customer_number   text primary key,
  suppressed        boolean not null default true,
  last_action       text not null,
  last_message_sid  text,
  updated_at        timestamptz not null default now(),
  constraint sms_contact_preferences_customer_e164_check
    check (customer_number ~ '^\+1[0-9]{10}$'),
  constraint sms_contact_preferences_action_check
    check (last_action = any (array['stop'::text, 'start'::text, 'help'::text]))
);

create or replace function public.apply_utah_sms_contact_preference(
  p_customer_number text,
  p_action text,
  p_message_sid text
)
returns table (suppressed boolean)
language sql
security definer
set search_path = public, pg_temp
as $$
  insert into public.sms_contact_preferences (
    customer_number, suppressed, last_action, last_message_sid, updated_at
  )
  values (
    p_customer_number,
    case when p_action = 'stop' then true else false end,
    p_action,
    nullif(p_message_sid, ''),
    now()
  )
  on conflict (customer_number) do update
    set suppressed = case
      when excluded.last_action = 'stop' then true
      when excluded.last_action = 'start' then false
      else sms_contact_preferences.suppressed
    end,
    last_action = excluded.last_action,
    last_message_sid = excluded.last_message_sid,
    updated_at = now()
  returning sms_contact_preferences.suppressed;
$$;

alter table public.sms_contact_preferences enable row level security;
revoke all on table public.sms_contact_preferences from anon, authenticated;
grant all on table public.sms_contact_preferences to service_role;
revoke all on function public.apply_utah_sms_contact_preference(text, text, text) from public, anon, authenticated;
grant execute on function public.apply_utah_sms_contact_preference(text, text, text) to service_role;
