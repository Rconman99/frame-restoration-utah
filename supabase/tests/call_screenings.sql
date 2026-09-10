-- Synthetic fixture contract; run only in the isolated local test database.
begin;
insert into public.call_logs(call_sid,status,source_page) values ('CA22222222222222222222222222222222','screening','test');
insert into public.call_screenings(call_sid,script_version,stage,state) values
('CA22222222222222222222222222222222','test-v2','purpose','{"stage":"purpose","action":"gather","name":"","purpose":"","reason":"awaiting_purpose","turns":[]}');
update public.call_screenings set stage='done',state='{"stage":"done","action":"connect","name":"Synthetic Jamie","purpose":"Roof inspection","reason":"service_request","turns":[]}'
where call_sid='CA22222222222222222222222222222222' and stage='purpose';
do $$ begin
  assert (select status='screened-awaiting-owner' and notes like '%caller-reported%' and notes like '%Roof inspection%' from public.call_logs where call_sid='CA22222222222222222222222222222222'), 'atomic log/evidence update failed';
  assert not has_table_privilege('anon','public.call_screenings','select'), 'anonymous trace exposed';
  assert not has_table_privilege('authenticated','public.call_screenings','select'), 'generic authenticated trace exposed';
  assert not has_table_privilege('anon','public.call_screening_daily','select'), 'anonymous metrics exposed';
  assert has_table_privilege('service_role','public.call_screenings','select'), 'operator access missing';
  assert (select relrowsecurity from pg_class where oid='public.call_screenings'::regclass), 'RLS missing';
end $$;
update public.call_logs set status='screened-owner-accepted' where call_sid='CA22222222222222222222222222222222';
update public.call_screenings set state=state || '{"name":"late replay"}' where call_sid='CA22222222222222222222222222222222';
do $$ begin
  assert (select status='screened-owner-accepted' and notes like '%Synthetic Jamie%' from public.call_logs where call_sid='CA22222222222222222222222222222222'), 'late trace rewound owner or CRM evidence';
end $$;
update public.call_screenings set owner_decision='accepted' where call_sid='CA22222222222222222222222222222222';
do $$ begin
  assert (select owner_accepted=1 and confirmed_bridged=0 and human_reviewed=0 from public.call_screening_daily where script_version='test-v2'), 'acceptance incorrectly counted as connection/review';
  begin
    update public.call_screenings set review_label='customer' where call_sid='CA22222222222222222222222222222222';
    raise exception 'Review without provenance accepted';
  exception when check_violation then null; end;
end $$;
update public.call_screenings set bridged=true,review_label='solicitation',reviewed_by='synthetic operator',reviewed_at=now()
where call_sid='CA22222222222222222222222222222222';
do $$ begin
  assert (select confirmed_bridged=1 and human_reviewed=1 and reviewed_sales_calls_bridged=1 from public.call_screening_daily where script_version='test-v2'), 'outcome/review aggregation failed';
end $$;
set local role service_role;
select count(*) as operator_visible_synthetic_rows from public.call_screenings where script_version='test-v2';
reset role;
delete from public.call_logs where call_sid='CA22222222222222222222222222222222';
do $$ begin
  assert not exists(select from public.call_screenings where script_version='test-v2'), 'deleting parent did not remove private trace';
end $$;
rollback;
