-- Frame Roofing Utah — relay idempotency (Codex audit parity with TX)
-- Migration: create `processed_webhooks` (process-once claim)
-- Created:   2026-06-08
--
-- ─── What this is ──────────────────────────────────────────────────────────
-- Twilio retries webhooks on timeout/5xx. Without a process-once key, a retry of
-- Landon's inbound SMS can send the customer a SECOND text or place a SECOND
-- outbound CALL. (CODEX audit HIGH — backported from TX.)
--
-- handle-sms (and handle-call) "claims" each webhook by inserting its Twilio SID
-- here BEFORE any side effect that must happen once. The PK makes the claim
-- atomic — a duplicate-key error (23505) means "already processed", so the
-- handler returns empty TwiML and does nothing further.
--
-- event_key convention:
--   sms:<MessageSid>                  — handle-sms operator/customer send
--   call:<CallSid>                    — handle-call inbound call
--   callstatus:<CallSid>:<CallStatus> — handle-call status callbacks
--
-- Service-role-only: RLS enabled with NO policies (matches the other relay tables).

begin;

create table if not exists public.processed_webhooks (
  event_key   text primary key,
  created_at  timestamptz not null default now()
);

alter table public.processed_webhooks enable row level security;

commit;
