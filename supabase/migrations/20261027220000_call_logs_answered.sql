-- Utah: explicit answered vs missed on call_logs.
-- MIGRATION FILE ONLY — not applied. Apply before deploying handle-call from
-- this PR (the code writes this column).
alter table public.call_logs add column if not exists answered boolean;
comment on column public.call_logs.answered is
  'true = Landon/caller bridged (DialBridged=true, or DialCallStatus completed with talk time); false = missed (no-answer/busy/failed/canceled or unbridged). NULL = unknown.';

-- One-time backfill (runs when applied) from the stored final status.
update public.call_logs set answered = true
 where answered is null and status in ('completed', 'answered')
   and coalesce(duration_seconds, 0) > 0;
update public.call_logs set answered = false
 where answered is null
   and status in ('no-answer', 'busy', 'failed', 'canceled', 'voicemail');
