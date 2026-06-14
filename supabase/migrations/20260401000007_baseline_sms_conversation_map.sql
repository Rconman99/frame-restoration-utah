-- ─────────────────────────────────────────────────────────────────────────────
-- Phase 0 HARDENED BASELINE — sms_conversation_map (sticky reply routing)
-- Authored 2026-06-14 from live schema capture.
-- Live shape: id uuid PRIMARY KEY + UNIQUE(customer_number) (not customer_number-as-PK).
-- The relay upserts on customer_number.
-- ─────────────────────────────────────────────────────────────────────────────

create table if not exists public.sms_conversation_map (
  id              uuid not null default gen_random_uuid(),
  customer_number text not null,
  last_message_at timestamptz default now(),
  constraint sms_conversation_map_pkey primary key (id),
  constraint sms_conversation_map_customer_number_key unique (customer_number)
);
