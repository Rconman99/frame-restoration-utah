"""Synthetic PostgreSQL race: old-password login queues behind reset's lock."""
import subprocess,sys
container=sys.argv[1]
def sql(query):
 return subprocess.check_output(['docker','exec','-i',container,'psql','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'],input=query,text=True).strip()
sql("truncate public.crm_password_resets,public.crm_recovery_rate_limits; select * from public.crm_request_password_reset('Example Owner','owner@example.test',repeat('a',64),repeat('c',64)); select public.crm_mark_password_reset_delivery(repeat('a',64),true);")
p=subprocess.Popen(['docker','exec','-i',container,'psql','-U','postgres','-Atq','-v','ON_ERROR_STOP=1'],stdin=subprocess.PIPE,stdout=subprocess.PIPE,text=True)
p.stdin.write("begin; select pg_advisory_xact_lock(1579608555); select 'LOCKED'; select * from public.crm_complete_password_reset(repeat('a',64),'race new password',repeat('6',64),repeat('d',64)); select pg_sleep(1); commit;\n");p.stdin.close()
while True:
 line=p.stdout.readline()
 if not line: raise RuntimeError('reset lock was not acquired')
 if line.strip()=='LOCKED': break
assert sql("select count(*) from public.authenticate_dashboard_access('12345678',repeat('5',64));")=='0'
assert p.wait()==0
assert sql("select count(*) from public.authenticate_dashboard_access('race new password',repeat('6',64));")=='1'
print('PASS: reset serializes with credential login; old password cannot regain access')
