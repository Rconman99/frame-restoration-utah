#!/usr/bin/env node
// Exact-prefix Utah migration runner. It cannot replay historical SQL or repair history.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {tmpdir, platform, arch} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const TARGET = '20260914200000';
export const BASENAME = TARGET + '_reconcile_call_screenings.sql';
export const TARGET_HASH = 'e64d1bcb8978ddfd796b0e1de563d899f0a9371ca6ed2b964ee27a257b18f2b9';
export const DECISION_SOURCE_MD5 = 'bc21e445d8b7d242a84f1f321e7a9c22';
export const RECONCILE_SOURCE_MD5 = 'a8e8c4a21fe5325c3cf9a8f3a9e54f40';
export const FINALIZE_SOURCE_MD5 = 'a44e5241a32886df76eef9676935a09b';
export const CLI_HASH = '42a9fe8b8a266bc0fbde804c08efb75cc0653480e91ba3f20fba1c3c27a7b49a';
export const CLI_VERSION = '2.116.0';
export const PROJECT = 'hdcflshhomzildwqlmwh';
export const REPO = 'frame-restoration-utah';
export const HISTORY = ('20260320023416 20260320023541 20260320202722 20260320202912 20260320210930 20260409044027 20260410182354 20260411003850 20260411004150 20260427211024 20260427211116 20260427211814 20260427214847 20260427223827 20260427223851 20260507211125 20260508000203 20260511015537 20260511220802 20260512005558 20260527064542 20260608205857 20260610 20260807000090 20260807000095 20260807000100 20260807000125 20260807000140 20260807000150 20260807000160 20260807000165 20260807000170 20260812010000 20260905200000 20260910200000').split(' ');
export const GUARD = "do $$ begin raise exception 'OWNER_CONNECT_REMOTE_HISTORY_GUARD_SELECTED'; end $$;\n";
const check = (value, message) => { if (!value) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);

export function validRemote(remote) {
  const path='Rconman99/'+REPO;
  return ['https://github.com/'+path,'git@github.com:'+path]
    .some(expected => remote===expected || remote===expected+'.git');
}
export function rows(value) {
  const result = Array.isArray(value) ? value : value?.rows;
  check(Array.isArray(result), 'unexpected SQL result shape');
  return result;
}
export function validateHistory(history, recorded) {
  check(equal(history,[...HISTORY,...(recorded ? [TARGET] : [])].sort()), 'production migration history drift');
}
export function validateList(value, recorded) {
  const list = value?.migrations;
  check(Array.isArray(list) && list.length === HISTORY.length + 1, 'migration list size drift');
  check(equal(list.map(x => x.local).sort(),[...HISTORY,TARGET].sort()), 'unexpected local migration');
  validateHistory(list.map(x => x.remote).filter(Boolean).sort(),recorded);
  check(list.every(x => x.local === x.remote || (!recorded && x.local === TARGET && x.remote === '')), 'unexpected pending migration');
}
const PROBE = `select
  (select jsonb_agg(version::text order by version::text) from supabase_migrations.schema_migrations) as history,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260914200000') as recorded,
  to_regprocedure('public.commit_owner_screen_decision(text,text)') is not null as decision_present,
  to_regprocedure('public.reconcile_screened_call_lead(text)') is not null as reconcile_present,
  to_regprocedure('public.finalize_owner_screen_decision(text,text)') is not null as finalize_present,
  to_regclass('public.call_screenings') is not null as screening_present,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='call_logs' and column_name in ('call_sid','from_number','to_number','city','status','notes','source_page','lead_id')) as call_columns,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='leads' and column_name in ('id','created_at','name','phone','address','city','source_page','call_source','commission_eligible','status','tier','tier_classifier','tier_reason','notes','submission_key')) as lead_columns,
  (select md5(p.prosrc) from pg_proc p where p.oid=to_regprocedure('public.commit_owner_screen_decision(text,text)')) as decision_source_md5,
  (select md5(p.prosrc) from pg_proc p where p.oid=to_regprocedure('public.reconcile_screened_call_lead(text)')) as reconcile_source_md5,
  (select md5(p.prosrc) from pg_proc p where p.oid=to_regprocedure('public.finalize_owner_screen_decision(text,text)')) as finalize_source_md5,
  (select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=""']
    from pg_proc p where p.oid=to_regprocedure('public.commit_owner_screen_decision(text,text)')) as decision_security,
  (select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=""']
    from pg_proc p where p.oid=to_regprocedure('public.reconcile_screened_call_lead(text)')) as reconcile_security,
  (select p.prosecdef and pg_get_userbyid(p.proowner)='postgres' and p.proconfig @> array['search_path=""']
    from pg_proc p where p.oid=to_regprocedure('public.finalize_owner_screen_decision(text,text)')) as finalize_security,
  exists(select 1 from pg_trigger t where t.tgrelid='public.leads'::regclass
    and t.tgname='leads_enqueue_notifications' and t.tgenabled='O'
    and position('new.submission_key is not null' in lower(pg_get_functiondef(t.tgfoid))) > 0) as notification_guarded,
  case when to_regprocedure('public.reconcile_screened_call_lead(text)') is not null
    and to_regprocedure('public.commit_owner_screen_decision(text,text)') is not null
    and to_regprocedure('public.finalize_owner_screen_decision(text,text)') is not null then
    not has_function_privilege('anon','public.reconcile_screened_call_lead(text)','execute')
    and not has_function_privilege('authenticated','public.reconcile_screened_call_lead(text)','execute')
    and not has_function_privilege('anon','public.commit_owner_screen_decision(text,text)','execute')
    and not has_function_privilege('authenticated','public.commit_owner_screen_decision(text,text)','execute')
    and not has_function_privilege('anon','public.finalize_owner_screen_decision(text,text)','execute')
    and not has_function_privilege('authenticated','public.finalize_owner_screen_decision(text,text)','execute')
    else null end as browser_revoked,
  case when to_regprocedure('public.reconcile_screened_call_lead(text)') is not null
    and to_regprocedure('public.commit_owner_screen_decision(text,text)') is not null
    and to_regprocedure('public.finalize_owner_screen_decision(text,text)') is not null then
    has_function_privilege('service_role','public.reconcile_screened_call_lead(text)','execute')
    and has_function_privilege('service_role','public.commit_owner_screen_decision(text,text)','execute')
    and has_function_privilege('service_role','public.finalize_owner_screen_decision(text,text)','execute')
    else null end as service_access`;
export function validateProbe(data, expectedRecorded) {
  check(data.length === 1, 'catalog probe requires exactly one row');
  const s=data[0];
  check(typeof s.recorded === 'boolean', 'missing migration state');
  if (expectedRecorded !== undefined) check(s.recorded === expectedRecorded, 'unexpected target state');
  validateHistory(s.history,s.recorded);
  check(s.screening_present && s.call_columns === 8 && s.lead_columns === 15 && s.notification_guarded, 'required screening/CRM notification schema missing');
  check(
    [s.decision_present,s.reconcile_present,s.finalize_present].every(value => value === s.recorded),
    'partial or unrecorded target function set; stop without repair'
  );
  if (s.recorded) check(
    s.decision_source_md5 === DECISION_SOURCE_MD5 &&
    s.reconcile_source_md5 === RECONCILE_SOURCE_MD5 &&
    s.finalize_source_md5 === FINALIZE_SOURCE_MD5 &&
    s.decision_security && s.reconcile_security && s.finalize_security &&
    s.browser_revoked && s.service_access,
    'reviewed private function body/security postflight failed'
  );
  return s;
}

export function main(args) {
  const [mode,...extra]=args;
  check(['preflight','apply'].includes(mode) && !extra.length,'Use: node scripts/voice-screening-owner-connect-migration.mjs preflight|apply');
  const sha=process.env.RELEASE_SHA, cli=process.env.SUPABASE_BIN;
  check(/^[0-9a-f]{40}$/.test(sha || ''),'RELEASE_SHA must be an exact commit');
  check(process.env.OWNER_CONNECT_MIGRATION_EXCLUSIVE_WRITER_ACK === sha,'claim the Utah migration-writer window and bind acknowledgement to RELEASE_SHA');
  check(platform()==='darwin' && arch()==='arm64','reviewed CLI requires macOS arm64');
  check(cli && hash(fs.readFileSync(cli))===CLI_HASH,'official Supabase '+CLI_VERSION+' binary hash required');
  check(!process.env.SUPABASE_ACCESS_TOKEN && !process.env.SUPABASE_NO_KEYRING,'use the existing Keychain profile, without token overrides');
  const run=(bin,argv,cwd=process.cwd())=>{
    const r=spawnSync(bin,argv,{cwd,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
    check(r.status===0,'command failed: '+bin+' '+argv.slice(0,3).join(' ')+' (no secret output printed)');
    return r;
  };
  const git=(...argv)=>run('git',argv).stdout.trim();
  const requireMain=()=>{git('fetch','--quiet','origin','main');check(git('rev-parse','origin/main')===sha && git('rev-parse','HEAD')===sha,'exact current-main checkout required');};
  check(validRemote(git('remote','get-url','origin')),'Utah repository/host mismatch');
  requireMain();
  check(git('status','--porcelain')==='','release checkout must be clean');
  check(run(cli,['--version']).stdout.trim()===CLI_VERSION,'CLI version mismatch');
  const migration=run('git',['show',sha+':supabase/migrations/'+BASENAME]).stdout;
  check(hash(migration)===TARGET_HASH,'migration bytes differ from reviewed target');
  const receipt=fs.mkdtempSync(join(tmpdir(),'utah-owner-connect-migration-'));
  fs.chmodSync(receipt,0o700);
  console.log('receipt_dir='+receipt);
  const save=(name,data)=>fs.writeFileSync(join(receipt,name),typeof data==='string'?data:JSON.stringify(data,null,2),{mode:0o600});
  save('release.json',{project:PROJECT,sha,mode,migration:BASENAME,migration_sha256:TARGET_HASH,cli_sha256:CLI_HASH,cli_version:CLI_VERSION});
  const auth=run(cli,['--debug','--agent','no','--output-format','json','projects','list']);
  save('auth-debug.private.txt',auth.stderr);
  const projects=JSON.parse(auth.stdout).projects;
  check(Array.isArray(projects) && projects.filter(p=>p.id===PROJECT).length===1,'Keychain profile cannot resolve Utah project');
  check(auth.stderr.includes('Using access token for profile: supabase') && auth.stderr.includes('Using profile: supabase (supabase.co)') && !/Using access token from (env var|file)/.test(auth.stderr),'unexpected credential source/host');
  const runner=join(receipt,'runner');fs.mkdirSync(runner,{mode:0o700});
  const sb=(...argv)=>run(cli,['--agent','no','--output-format','json',...argv],runner);
  sb('init');
  sb('link','--project-ref',PROJECT,'--yes');
  check(fs.readFileSync(join(runner,'supabase/.temp/project-ref'),'utf8').trim()===PROJECT,'linked project mismatch');
  const pooler=new URL(fs.readFileSync(join(runner,'supabase/.temp/pooler-url'),'utf8').trim());
  check(pooler.protocol==='postgresql:' && pooler.password==='' && decodeURIComponent(pooler.username).endsWith('.'+PROJECT),'unexpected linked database');
  const probe=()=>rows(JSON.parse(sb('db','query','--linked',PROBE).stdout));
  const before=probe(), state=validateProbe(before);
  save('catalog.before.json',before);
  const migrations=join(runner,'supabase/migrations');fs.mkdirSync(migrations,{recursive:true,mode:0o700});
  const expected=new Map(HISTORY.map(v=>[v+'_remote_applied_history_guard.sql',GUARD]));
  expected.set(state.recorded ? TARGET+'_remote_applied_history_guard.sql' : BASENAME,state.recorded ? GUARD : migration);
  for (const [name,body] of expected) fs.writeFileSync(join(migrations,name),body,{mode:0o600,flag:'wx'});
  const manifest=()=>{
    check(equal(fs.readdirSync(migrations).sort(),[...expected.keys()].sort()),'runner file set drift');
    for(const [name,body] of expected) check(fs.lstatSync(join(migrations,name)).isFile() && hash(fs.readFileSync(join(migrations,name)))===hash(body),'runner content drift');
  };
  manifest();
  save('runner-manifest.json',[...expected].map(([name,body])=>({name,sha256:hash(body)})));
  const list=JSON.parse(sb('migration','list','--linked').stdout);
  validateList(list,state.recorded);save('migration-list.before.json',list);
  const final=probe();validateProbe(final,state.recorded);save('catalog.final-preflight.json',final);
  check(equal(before,final),'catalog drift during preflight');
  requireMain();manifest();
  if(mode==='preflight'){console.log('preflight_passed=true');return;}
  if(!state.recorded){
    const result=sb('migration','up','--linked','--include-all','--yes');
    save('migration-up.stdout.json',result.stdout);save('migration-up.stderr.txt',result.stderr);
    const output=JSON.parse(result.stdout);
    check(output.message==='Migrations applied' && Array.isArray(output.applied) && output.applied.length===1 && output.applied[0].split('/').at(-1)===BASENAME,'unexpected applied migration receipt; stop without repair');
    check(!/remote_applied_history_guard/.test(result.stdout+result.stderr),'poison guard selected; stop without repair');
  }
  const after=probe();validateProbe(after,true);save('catalog.postflight.json',after);
  const finalList=JSON.parse(sb('migration','list','--linked').stdout);validateList(finalList,true);save('migration-list.after.json',finalList);
  console.log('migration_verified='+BASENAME+' project='+PROJECT);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){try{main(process.argv.slice(2));}catch(e){console.error('Hard stop: '+e.message);process.exitCode=1;}}
