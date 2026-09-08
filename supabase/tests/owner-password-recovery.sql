\set ON_ERROR_STOP on
create function pg_temp.assert(ok boolean,label text) returns void language plpgsql as $$begin if ok is distinct from true then raise exception '%',label; end if; end$$;
insert into public.report_access(id,name,role,active,pin,pin_hash,session_version,recovery_email) values
 ('11111111-1111-4111-8111-111111111111','Example Owner','viewer',true,null,repeat('1',64),1,'owner@example.test'),
 ('22222222-2222-4222-8222-222222222222','Other Owner','admin',true,null,repeat('2',64),1,'other@example.test');
select pg_temp.assert(not has_function_privilege('anon','public.crm_complete_password_reset(text,text,text,text)','EXECUTE'),'anonymous completion RPC allowed');
select pg_temp.assert(not has_table_privilege('authenticated','public.crm_password_resets','SELECT'),'browser token table read allowed');
select pg_temp.assert((select count(*)=0 from public.crm_request_password_reset('Example Owner','wrong@example.test',repeat('a',64),repeat('c',64))),'wrong email matched');
select pg_temp.assert((select count(*)=1 from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64))),'confirmed request failed');
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('3',64),repeat('d',64))),'undelivered link accepted');
select public.crm_mark_password_reset_delivery(repeat('a',64),true);
select pg_temp.assert((select count(*)=0 from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('b',64),repeat('c',64))),'cooldown ignored');
select pg_temp.assert((select reset_status='password_unavailable' from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('2',64),repeat('d',64))),'credential collision not rejected');
select pg_temp.assert((select reset_status='ok' from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('3',64),repeat('d',64))),'delivered reset failed');
select pg_temp.assert((select pin is null and pin_hash=repeat('3',64) and session_version=2 and role='viewer' from public.report_access where name='Example Owner'),'password/version/role invariant failed');
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'token replay accepted');
select pg_temp.assert((select count(*)=1 from public.authenticate_dashboard_access('long new password ',repeat('3',64))),'new full password rejected by login RPC');
select pg_temp.assert((select count(*)=0 from public.authenticate_dashboard_access('old-test-pin',repeat('1',64))),'old credential still matches');
-- Independent cases use synthetic state only, outside real owner accounts.
truncate public.crm_password_resets,public.crm_recovery_rate_limits;
select * from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64));
select public.crm_mark_password_reset_delivery(repeat('a',64),false);
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'failed delivery usable');
truncate public.crm_password_resets,public.crm_recovery_rate_limits;
select * from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64));
select public.crm_mark_password_reset_delivery(repeat('a',64),true);
update public.crm_password_resets set created_at=now()-interval '1 hour',expires_at=now()-interval '1 second';
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'expired link usable');
truncate public.crm_password_resets,public.crm_recovery_rate_limits;
select * from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64));
select public.crm_mark_password_reset_delivery(repeat('a',64),true);
update public.report_access set recovery_email='changed@example.test' where name='Example Owner';
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'changed mailbox link usable');
update public.report_access set recovery_email='owner@example.test' where name='Example Owner';
select public.reset_dashboard_access_credential('11111111-1111-4111-8111-111111111111','12345678',repeat('5',64));
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'admin password reset did not invalidate old recovery link');
truncate public.crm_password_resets,public.crm_recovery_rate_limits;
select * from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64));
select public.crm_mark_password_reset_delivery(repeat('a',64),true);
update public.report_access set active=false where name='Example Owner';
select pg_temp.assert((select count(*)=0 from public.crm_complete_password_reset(repeat('a',64),'long new password ',repeat('4',64),repeat('d',64))),'inactive account recovered');
update public.report_access set active=true where name='Example Owner';
truncate public.crm_password_resets,public.crm_recovery_rate_limits;
select public.crm_allow_recovery_attempt('request',repeat('f',64)) from generate_series(1,5);
select pg_temp.assert(not public.crm_allow_recovery_attempt('request',repeat('f',64)),'sixth client attempt allowed');
select 'PASS: owner recovery SQL security cases';

do $$begin
 begin
  insert into public.report_access(name,role,active,pin,pin_hash,recovery_email) values (' example owner ','admin',true,null,repeat('9',64),'owner@example.test');
  raise exception 'ambiguous normalized recovery identity accepted';
 exception when unique_violation then null; end;
end$$;
