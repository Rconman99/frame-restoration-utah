-- ONLY for an empty disposable test database. Run after call_screenings_fixture.sql
-- and both call_screenings migrations, before 20261027220000_call_logs_answered.sql.
-- One synthetic call per final state that handle-call or the owner-decision RPC
-- leaves behind, so the one-time answered backfill can be checked row by row.
alter table public.call_logs add column if not exists duration_seconds integer;

insert into public.leads(name, phone, source_page, submission_key) values
  ('Synthetic ring caller', '+18015550101', 'inbound-call', null),
  ('Synthetic press-one caller', '+18015550102', 'inbound-call', null);

insert into public.call_logs(call_sid, from_number, to_number, status,
                             duration_seconds, lead_id, source_page)
select 'CA' || lpad(v.n::text, 32, '0'), '+1801555' || lpad(v.n::text, 4, '0'),
       '+14352928802', v.status, v.duration, l.id, 'test'
from (values
  (120, 'completed',               40,   '+18015550101'),
  (121, 'answered',                30,   null),
  (122, 'completed',               0,    '+18015550101'),
  (123, 'completed',               null, null),
  (124, 'no-answer',               null, '+18015550101'),
  (125, 'busy',                    null, '+18015550102'),
  (126, 'failed',                  null, null),
  (127, 'canceled',                null, null),
  (128, 'voicemail',               null, '+18015550102'),
  (129, 'voicemail',               null, null),
  (130, 'voicemail',               null, null),
  (131, 'voicemail',               null, null),
  (132, 'voicemail',               null, null),
  (133, 'voicemail',               null, null),
  (134, 'screened-owner-rejected', null, null),
  (135, 'screened-owner-accepted', null, null),
  (136, 'screening',               null, null),
  (137, 'blocked-spam',            null, null),
  (138, 'screened-solicitation',   null, null),
  (139, 'ringing',                 null, '+18015550101')
) as v(n, status, duration, lead_phone)
left join public.leads l on l.phone = v.lead_phone;

-- Legacy owner-whisper traces. None of these call_logs statuses is one the
-- screening trigger rewrites, so the seeded statuses stay as written above.
insert into public.call_screenings(call_sid, script_version, stage, state,
                                   owner_decision, bridged)
select 'CA' || lpad(v.n::text, 32, '0'), 'test-v2', 'done',
       jsonb_build_object('stage', 'done', 'action', v.action, 'name', '',
                          'purpose', '', 'reason', v.reason,
                          'turns', '[]'::jsonb),
       v.owner_decision, v.bridged
from (values
  (130, 'connect',   'caller_response',       'voicemail', false),
  (131, 'connect',   'caller_response',       'timeout',   null),
  (132, 'connect',   'caller_response',       null,        false),
  (133, 'voicemail', 'no_input_after_repair', null,        null),
  (134, 'connect',   'caller_response',       'voicemail', false),
  (135, 'connect',   'caller_response',       'accepted',  true)
) as v(n, action, reason, owner_decision, bridged);
