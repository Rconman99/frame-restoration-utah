-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — sms_logs (inbound/outbound SMS relay log)
-- Authored 2026-06-14 from live schema capture. id = uuid. UNIQUE(message_sid).
-- FK lead_id → leads(id).
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_logs (
  id          uuid not null default gen_random_uuid(),
  created_at  timestamptz default now(),
  message_sid text,
  direction   text not null,
  from_number text not null,
  to_number   text not null,
  body        text,
  city        text,
  source_page text,
  lead_id     bigint,
  notes       text,
  constraint sms_logs_pkey primary key (id),
  constraint sms_logs_message_sid_key unique (message_sid),
  constraint sms_logs_direction_check check (direction = any (array['inbound'::text, 'outbound'::text])),
  constraint sms_logs_lead_id_fkey foreign key (lead_id) references public.leads (id)
);

create index if not exists idx_sms_logs_created_at on public.sms_logs using btree (created_at desc);
create index if not exists idx_sms_logs_from_number on public.sms_logs using btree (from_number);
