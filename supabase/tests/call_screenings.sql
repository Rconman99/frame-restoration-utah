-- Synthetic fixture contract; run only in the isolated local test database.
begin;
insert into public.call_logs(call_sid,from_number,to_number,city,status,source_page)
values ('CA22222222222222222222222222222222','+12145550123','+14352928802','Salt Lake City, UT','screening','test');
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
do $$ begin
  assert public.commit_owner_screen_decision('CA22222222222222222222222222222222',null) is null, 'NULL decision accepted';
  assert (select owner_decision is null from public.call_screenings where call_sid='CA22222222222222222222222222222222'), 'NULL decision mutated screening';
  assert (select status='screened-owner-accepted' from public.call_logs where call_sid='CA22222222222222222222222222222222'), 'NULL decision mutated call log';
  assert public.reconcile_screened_call_lead('CA22222222222222222222222222222222') is null, 'undecided screening created a lead';
  assert public.finalize_owner_screen_decision('CA22222222222222222222222222222222','accepted') = 'accepted', 'owner decision finalization failed';
  assert public.commit_owner_screen_decision('CA22222222222222222222222222222222','voicemail') = 'accepted', 'retry rewound terminal decision';
end $$;
insert into public.call_logs(call_sid,from_number,to_number,status,source_page) values
  ('CA33333333333333333333333333333333','+12145550124','+14352928802','screened-awaiting-owner','test'),
  ('CA44444444444444444444444444444444','+12145550125','+14352928802','screened-awaiting-owner','test');
insert into public.call_screenings(call_sid,script_version,stage,state) values
  ('CA33333333333333333333333333333333','test-v2','done','{"stage":"done","action":"connect","name":"","purpose":"","reason":"caller_response","turns":[]}'),
  ('CA44444444444444444444444444444444','test-v2','done','{"stage":"done","action":"connect","name":"","purpose":"","reason":"caller_response","turns":[]}');
do $$ begin
  assert public.commit_owner_screen_decision('CA33333333333333333333333333333333','voicemail') = 'voicemail', 'voicemail decision commit failed';
  assert public.commit_owner_screen_decision('CA44444444444444444444444444444444','timeout') = 'timeout', 'timeout decision commit failed';
  assert public.reconcile_screened_call_lead('CA33333333333333333333333333333333') is null, 'voicemail screening created a lead';
  assert public.reconcile_screened_call_lead('CA44444444444444444444444444444444') is null, 'timeout screening created a lead';
end $$;
alter table public.call_screenings alter column stage drop not null;
insert into public.call_logs(call_sid,from_number,to_number,status,source_page)
values ('CA55555555555555555555555555555555','+12145550126','+14352928802','screened-awaiting-owner','test');
insert into public.call_screenings(call_sid,script_version,stage,state)
values ('CA55555555555555555555555555555555','test-v2',null,'{"stage":"done","action":"connect","name":"","purpose":"","reason":"caller_response","turns":[]}');
do $$ begin
  assert public.commit_owner_screen_decision('CA55555555555555555555555555555555','accepted') is null, 'NULL stage accepted';
  assert (select owner_decision is null from public.call_screenings where call_sid='CA55555555555555555555555555555555'), 'NULL stage mutated screening';
  assert (select status='screened-awaiting-owner' from public.call_logs where call_sid='CA55555555555555555555555555555555'), 'NULL stage mutated call log';
end $$;
delete from public.call_logs where call_sid='CA55555555555555555555555555555555';
alter table public.call_screenings alter column stage set not null;
insert into public.call_logs(call_sid,from_number,to_number,status,source_page)
values ('CA66666666666666666666666666666666','unknown','+14352928802','screened-awaiting-owner','test');
insert into public.call_screenings(call_sid,script_version,stage,state)
values ('CA66666666666666666666666666666666','test-v2','done','{"stage":"done","action":"connect","name":"","purpose":"","reason":"caller_response","turns":[]}');
do $$
declare rejected boolean := false;
begin
  begin
    perform public.finalize_owner_screen_decision('CA66666666666666666666666666666666','accepted');
  exception when others then
    rejected := true;
  end;
  assert rejected, 'accepted call without a lead did not fail';
  assert (select owner_decision is null from public.call_screenings where call_sid='CA66666666666666666666666666666666'), 'failed finalization did not roll back decision';
  assert (select lead_id is null from public.call_logs where call_sid='CA66666666666666666666666666666666'), 'failed finalization linked a lead';
end $$;
do $$ begin
  assert (select owner_accepted=1 and confirmed_bridged=0 and human_reviewed=0 from public.call_screening_daily where script_version='test-v2'), 'acceptance incorrectly counted as connection/review';
  begin
    update public.call_screenings set review_label='customer' where call_sid='CA22222222222222222222222222222222';
    raise exception 'Review without provenance accepted';
  exception when check_violation then null; end;
end $$;
do $$
declare first_lead bigint;
declare retry_lead bigint;
begin
  first_lead := public.reconcile_screened_call_lead('CA22222222222222222222222222222222');
  retry_lead := public.reconcile_screened_call_lead('CA22222222222222222222222222222222');
  assert first_lead is not null and retry_lead = first_lead, 'reconciliation was not idempotent';
  assert (select count(*) = 1 from public.leads), 'duplicate lead created';
  assert (select lead_id = first_lead from public.call_logs where call_sid='CA22222222222222222222222222222222'), 'lead was not linked atomically';
  assert (select submission_key is null from public.leads where id=first_lead), 'call reconciliation touched notification idempotency';
  assert not exists(select from public.lead_notifications where lead_id=first_lead), 'call reconciliation enqueued an owner notification';
  assert (select call_source='google_website' and commission_eligible from public.leads where id=first_lead), 'tracking attribution was not preserved';
  assert public.reconcile_screened_call_lead('not-a-call-sid') is null, 'invalid SID accepted';
  assert not has_function_privilege('anon','public.reconcile_screened_call_lead(text)','execute'), 'anonymous reconciliation exposed';
  assert not has_function_privilege('authenticated','public.reconcile_screened_call_lead(text)','execute'), 'authenticated reconciliation exposed';
  assert has_function_privilege('service_role','public.reconcile_screened_call_lead(text)','execute'), 'service reconciliation access missing';
  assert not has_function_privilege('anon','public.commit_owner_screen_decision(text,text)','execute'), 'anonymous decision commit exposed';
  assert has_function_privilege('service_role','public.commit_owner_screen_decision(text,text)','execute'), 'service decision commit access missing';
  assert not has_function_privilege('authenticated','public.finalize_owner_screen_decision(text,text)','execute'), 'authenticated decision finalization exposed';
  assert has_function_privilege('service_role','public.finalize_owner_screen_decision(text,text)','execute'), 'service decision finalization access missing';
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
  assert not exists(select from public.call_screenings where call_sid='CA22222222222222222222222222222222'), 'deleting parent did not remove private trace';
end $$;
rollback;
