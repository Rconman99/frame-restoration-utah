-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — call_logs (inbound voice relay)
-- Authored 2026-06-14 from live schema capture. id = bigint identity.
-- UNIQUE(call_sid) for Twilio idempotency. FK lead_id → leads(id).
--
-- TEMPLATE NOTE: live has `forwarded_to text DEFAULT '<operator phone>'`. That default
-- is an operator-specific value, so it is intentionally OMITTED here — the relay edge
-- function sets forwarded_to explicitly. Each territory wires its own number.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.call_logs (
  id               bigint generated always as identity,
  created_at       timestamptz default now(),
  call_sid         text not null,
  from_number      text not null,
  to_number        text,
  forwarded_to     text,
  duration_seconds integer,
  status           text default 'initiated',
  recording_url    text,
  city             text,
  source_page      text,
  lead_id          bigint,
  notes            text,
  constraint call_logs_pkey primary key (id),
  constraint call_logs_call_sid_key unique (call_sid),
  constraint call_logs_lead_id_fkey foreign key (lead_id) references public.leads (id)
);

comment on table public.call_logs is 'Inbound call tracking via the Twilio relay edge function.';

create index if not exists idx_call_logs_created_at on public.call_logs using btree (created_at desc);
create index if not exists idx_call_logs_from_number on public.call_logs using btree (from_number);
