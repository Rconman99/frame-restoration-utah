#!/usr/bin/env node
// Exact-prefix migration runner. No historical SQL, raw mutation query or repair.
import {spawnSync} from 'node:child_process';
import {createHash} from 'node:crypto';
import * as fs from 'node:fs';
import {tmpdir, platform, arch} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';

export const TARGET = '20260910200000';
export const BASENAME = TARGET + '_call_screenings.sql';
export const TARGET_HASH = 'b8835d8f7c62ca106ca46cd0f12702dd0fbae081842db4b9cefbcb5f4667f59f';
const CLI_HASH = 'ad4957e507ffc178fa27dd9256eb666f34bade172058b66e97f230413564494a';
export const GUARD = "do $$ begin raise exception 'VOICE_REMOTE_HISTORY_GUARD_SELECTED'; end $$;\n";
export const MARKETS = Object.freeze({
  utah: {project:'hdcflshhomzildwqlmwh', repo:'frame-restoration-utah', history:('20260320023416 20260320023541 20260320202722 20260320202912 20260320210930 20260409044027 20260410182354 20260411003850 20260411004150 20260427211024 20260427211116 20260427211814 20260427214847 20260427223827 20260427223851 20260507211125 20260508000203 20260511015537 20260511220802 20260512005558 20260527064542 20260608205857 20260610 20260807000090 20260807000095 20260807000100 20260807000125 20260807000140 20260807000150 20260807000160 20260807000165 20260807000170 20260812010000 20260905200000').split(' ')},
  texas: {project:'wroaxatalhzslxkfmpse', repo:'frame-restoration-texas-v2', history:('20260526120000 20260526120100 20260526120200 20260526120300 20260602004500 20260603030000 20260608120000 20260608130000 20260612120000 20260613120000 20260626180000 20260723120000 20260807170000 20260817190000 20260819000000 20260904210000 20260904220000 20260905200000').split(' ')}
});
const check = (value, message) => { if (!value) throw new Error(message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const equal = (a,b) => JSON.stringify(a) === JSON.stringify(b);
export function validRemote(market, remote) {
  if (!Object.hasOwn(MARKETS,market) || typeof remote !== 'string') return false;
  const path='Rconman99/'+MARKETS[market].repo;
  return ['https://github.com/'+path,'git@github.com:'+path]
    .some(expected => remote===expected || remote===expected+'.git');
}
export function rows(value) {
  const result = Array.isArray(value) ? value : value?.rows;
  check(Array.isArray(result), 'unexpected SQL result shape');
  return result;
}
export function validateHistory(market, history, recorded) {
  check(Object.hasOwn(MARKETS,market), 'unsupported market');
  check(equal(history,[...MARKETS[market].history,...(recorded ? [TARGET] : [])].sort()), 'production migration history drift');
}
export function validateList(market, value, recorded) {
  const list = value?.migrations;
  check(Array.isArray(list) && list.length === MARKETS[market].history.length + 1, 'migration list size drift');
  const expected = [...MARKETS[market].history,TARGET].sort();
  check(equal(list.map(x => x.local).sort(),expected), 'unexpected local migration');
  validateHistory(market,list.map(x => x.remote).filter(Boolean).sort(),recorded);
  check(list.every(x => x.local === x.remote || (!recorded && x.local === TARGET && x.remote === '')), 'unexpected pending migration');
}
const PROBE = `select
  (select jsonb_agg(version::text order by version::text) from supabase_migrations.schema_migrations) as history,
  to_regclass('public.call_screenings') is not null as target_present,
  to_regclass('public.call_screening_daily') is not null as view_present,
  exists(select 1 from supabase_migrations.schema_migrations where version='20260910200000') as recorded,
  (select count(*) from information_schema.columns where table_schema='public' and table_name='call_logs' and column_name in ('call_sid','from_number','to_number','status','notes','source_page','lead_id')) as parent_columns,
  (select relrowsecurity from pg_class where oid=to_regclass('public.call_screenings')) as rls,
  (select count(*) from pg_policies where schemaname='public' and tablename='call_screenings') as policies,
  (select count(*) from pg_trigger where tgrelid=to_regclass('public.call_screenings') and tgname='sync_call_screening_log' and tgenabled='O') as triggers,
  (select reloptions @> array['security_invoker=true'] from pg_class where oid=to_regclass('public.call_screening_daily')) as invoker,
  case when to_regclass('public.call_screenings') is not null and to_regclass('public.call_screening_daily') is not null then
    not exists(select 1 from (values ('anon'),('authenticated')) r(role) cross join (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE'),('TRUNCATE'),('REFERENCES'),('TRIGGER')) p(privilege)
      where has_table_privilege(r.role,'public.call_screenings',p.privilege) or has_table_privilege(r.role,'public.call_screening_daily',p.privilege))
    else null end as browser_revoked,
  case when to_regclass('public.call_screenings') is not null and to_regclass('public.call_screening_daily') is not null then
    not exists(select 1 from (values ('SELECT'),('INSERT'),('UPDATE'),('DELETE')) p(privilege)
      where not has_table_privilege('service_role','public.call_screenings',p.privilege))
    and has_table_privilege('service_role','public.call_screening_daily','SELECT')
    else null end as service_access`;
export function validateProbe(market, data, expectedRecorded) {
  check(data.length === 1, 'catalog probe requires exactly one row');
  const s=data[0];
  check(typeof s.recorded === 'boolean', 'missing migration state');
  if (expectedRecorded !== undefined) check(s.recorded === expectedRecorded, 'unexpected target state');
  validateHistory(market,s.history,s.recorded);
  check(s.parent_columns === 7, 'required call-log schema missing');
  check(s.target_present === s.recorded && s.view_present === s.recorded, 'partial/unrecorded target schema; stop without repair');
  if (s.recorded) check(s.rls && s.policies === 0 && s.triggers === 1 && s.invoker && s.browser_revoked && s.service_access, 'private schema postflight failed');
  return s;
}
export function main(args) {
  const [market,mode,...extra]=args;
  check(Object.hasOwn(MARKETS,market) && ['preflight','apply'].includes(mode) && !extra.length,'Use: node scripts/voice-screening-migration.mjs utah|texas preflight|apply');
  const config=MARKETS[market], sha=process.env.RELEASE_SHA, cli=process.env.SUPABASE_BIN;
  check(/^[0-9a-f]{40}$/.test(sha || ''),'RELEASE_SHA must be an exact commit');
  check(process.env.VOICE_MIGRATION_EXCLUSIVE_WRITER_ACK === sha,'claim the market migration-writer window and bind acknowledgement to RELEASE_SHA');
  check(platform()==='darwin' && arch()==='arm64','reviewed CLI requires macOS arm64');
  check(cli && hash(fs.readFileSync(cli))===CLI_HASH,'official Supabase 2.113.0 binary hash required');
  check(!process.env.SUPABASE_ACCESS_TOKEN && !process.env.SUPABASE_NO_KEYRING,'use the existing Keychain profile, without token overrides');
  const run=(bin,argv,cwd=process.cwd())=>{
    const r=spawnSync(bin,argv,{cwd,encoding:'utf8',timeout:120000,maxBuffer:4*1024*1024});
    check(r.status===0,'command failed: '+bin+' '+argv.slice(0,3).join(' ')+' (no secret output printed)');
    return r;
  };
  const git=(...argv)=>run('git',argv).stdout.trim();
  const requireMain=()=>{git('fetch','--quiet','origin','main');check(git('rev-parse','origin/main')===sha && git('rev-parse','HEAD')===sha,'exact current-main checkout required');};
  check(validRemote(market,git('remote','get-url','origin')),'market/repository/host mismatch');
  requireMain();
  check(git('status','--porcelain')==='','release checkout must be clean');
  check(run(cli,['--version']).stdout.trim()==='2.113.0','CLI version mismatch');
  const migration=run('git',['show',sha+':supabase/migrations/'+BASENAME]).stdout;
  check(hash(migration)===TARGET_HASH,'migration bytes differ from reviewed target');
  const receipt=fs.mkdtempSync(join(tmpdir(),'voice-'+market+'-migration-'));
  fs.chmodSync(receipt,0o700);
  console.log('receipt_dir='+receipt);
  const save=(name,data)=>fs.writeFileSync(join(receipt,name),typeof data==='string'?data:JSON.stringify(data,null,2),{mode:0o600});
  save('release.json',{market,project:config.project,sha,mode,migration:BASENAME,migration_sha256:TARGET_HASH,cli_sha256:CLI_HASH});
  const auth=run(cli,['--debug','--agent','no','--output-format','json','projects','list']);
  save('auth-debug.private.txt',auth.stderr);
  const projects=JSON.parse(auth.stdout).projects;
  check(Array.isArray(projects) && projects.filter(p=>p.id===config.project).length===1,'Keychain profile cannot resolve project');
  check(auth.stderr.includes('Using access token for profile: supabase') && auth.stderr.includes('Using profile: supabase (supabase.co)') && !/Using access token from (env var|file)/.test(auth.stderr),'unexpected credential source/host');
  const runner=join(receipt,'runner');fs.mkdirSync(runner,{mode:0o700});
  const sb=(...argv)=>run(cli,['--agent','no','--output-format','json',...argv],runner);
  sb('init');
  sb('link','--project-ref',config.project,'--yes');
  check(fs.readFileSync(join(runner,'supabase/.temp/project-ref'),'utf8').trim()===config.project,'linked project mismatch');
  const pooler=new URL(fs.readFileSync(join(runner,'supabase/.temp/pooler-url'),'utf8').trim());
  check(pooler.protocol==='postgresql:' && pooler.password==='' && decodeURIComponent(pooler.username).endsWith('.'+config.project),'unexpected linked database');
  const probe=()=>rows(JSON.parse(sb('db','query','--linked',PROBE).stdout));
  const before=probe(), state=validateProbe(market,before);
  save('catalog.before.json',before);
  const migrations=join(runner,'supabase/migrations');fs.mkdirSync(migrations,{recursive:true,mode:0o700});
  const expected=new Map(config.history.map(v=>[v+'_remote_applied_history_guard.sql',GUARD]));
  expected.set(state.recorded ? TARGET+'_remote_applied_history_guard.sql' : BASENAME,state.recorded ? GUARD : migration);
  for (const [name,body] of expected) fs.writeFileSync(join(migrations,name),body,{mode:0o600,flag:'wx'});
  const manifest=()=>{
    check(equal(fs.readdirSync(migrations).sort(),[...expected.keys()].sort()),'runner file set drift');
    for(const [name,body] of expected) check(fs.lstatSync(join(migrations,name)).isFile() && hash(fs.readFileSync(join(migrations,name)))===hash(body),'runner content drift');
  };
  manifest();
  save('runner-manifest.json',[...expected].map(([name,body])=>({name,sha256:hash(body)})));
  const list=JSON.parse(sb('migration','list','--linked').stdout);
  validateList(market,list,state.recorded);save('migration-list.before.json',list);
  const final=probe();validateProbe(market,final,state.recorded);save('catalog.final-preflight.json',final);
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
  const after=probe();validateProbe(market,after,true);save('catalog.postflight.json',after);
  const finalList=JSON.parse(sb('migration','list','--linked').stdout);validateList(market,finalList,true);save('migration-list.after.json',finalList);
  console.log('migration_verified='+BASENAME+' project='+config.project);
}
if(process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href){try{main(process.argv.slice(2));}catch(e){console.error('Hard stop: '+e.message);process.exitCode=1;}}
