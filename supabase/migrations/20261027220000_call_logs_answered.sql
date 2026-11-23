-- Utah: explicit answered vs missed on call_logs.
-- MIGRATION FILE ONLY — not applied. Apply before deploying handle-call from
-- this PR (the code writes this column). The backfill reads call_screenings,
-- so 20260910200000_call_screenings must already be applied.
alter table public.call_logs add column if not exists answered boolean;
comment on column public.call_logs.answered is
  'true = Landon/caller bridged (DialBridged=true, or DialCallStatus completed with talk time; a carrier-voicemail pickup also bridges); false = a Dial to Landon was missed (no-answer/busy/failed/canceled, or an unbridged or declined whisper). NULL = unknown, or the caller never reached a Dial (screened out before ringing).';

-- One-time backfill (runs when applied) from the stored final status. It
-- mirrors the live handler, which only decides answered from a Dial action:
-- a declined whisper (screened-owner-rejected) is missed, and a voicemail is
-- missed only when a Dial is evidenced, either a linked lead (the ring and
-- press-one routes link one before dialing) or a legacy whisper leg recorded
-- unbridged or declined. Callers screened out before any Dial stay NULL.
update public.call_logs set answered = true
 where answered is null and status in ('completed', 'answered')
   and coalesce(duration_seconds, 0) > 0;
update public.call_logs c set answered = false
 where c.answered is null
   and (c.status in ('no-answer', 'busy', 'failed', 'canceled',
                     'screened-owner-rejected')
        or (c.status = 'voicemail'
            and (c.lead_id is not null
                 or exists (select 1 from public.call_screenings s
                             where s.call_sid = c.call_sid
                               and (s.bridged is false
                                    or s.owner_decision in ('voicemail', 'timeout'))))));
