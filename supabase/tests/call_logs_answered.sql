-- Synthetic contract for the one-time answered backfill; run only in the isolated
-- local test database, after call_logs_answered_fixture.sql and after each apply
-- of 20261027220000_call_logs_answered.sql (a second apply must change nothing).
do $$
declare
  r record;
  mismatches text[] := '{}';
begin
  assert (select data_type = 'boolean' from information_schema.columns
          where table_schema = 'public' and table_name = 'call_logs'
            and column_name = 'answered'), 'call_logs.answered is not a boolean column';
  assert (select col_description(attrelid, attnum) is not null from pg_attribute
          where attrelid = 'public.call_logs'::regclass and attname = 'answered'),
    'call_logs.answered has no column comment';
  for r in
    select v.n, v.expected, v.why, c.call_sid is not null as present, c.answered
    from (values
      (120, true, 'ring route, bridged with talk time'),
      (121, true, 'answered with talk time'),
      (122, null, 'completed with no talk time stays unknown'),
      (123, null, 'completed with no stored duration stays unknown'),
      (124, false, 'no-answer'),
      (125, false, 'busy'),
      (126, false, 'failed'),
      (127, false, 'canceled'),
      (128, false, 'voicemail after a missed press-one Dial (lead linked before dialing)'),
      (129, null, 'voicemail from a caller screened out before any Dial'),
      (130, false, 'voicemail after the owner pressed two'),
      (131, false, 'voicemail after the owner whisper timed out'),
      (132, false, 'voicemail after an unbridged whisper leg with no stored decision'),
      (133, null, 'voicemail from the legacy interview, which never dialed'),
      (134, false, 'declined whisper with no voicemail'),
      (135, null, 'accepted call whose Dial-action update was lost stays unknown'),
      (136, null, 'hung up at the keypad prompt'),
      (137, null, 'blocked caller'),
      (138, null, 'declined solicitation'),
      (139, null, 'ringing with no Dial outcome stays unknown')
    ) as v(n, expected, why)
    left join public.call_logs c on c.call_sid = 'CA' || lpad(v.n::text, 32, '0')
    order by v.n
  loop
    assert r.present, format('fixture row %s missing (%s)', r.n, r.why);
    if r.answered is distinct from r.expected then
      mismatches := mismatches || format('%s: answered=%s, expected %s', r.why,
        coalesce(r.answered::text, 'NULL'), coalesce(r.expected::text, 'NULL'));
    end if;
  end loop;
  assert cardinality(mismatches) = 0, array_to_string(mismatches, '; ');
end $$;
