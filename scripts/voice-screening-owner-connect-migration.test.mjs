import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {BASENAME,CLI_HASH,CLI_VERSION,DECISION_SOURCE_MD5,FINALIZE_SOURCE_MD5,GUARD,HISTORY,RECONCILE_SOURCE_MD5,TARGET,TARGET_HASH,rows,validRemote,validateHistory,validateList,validateProbe} from './voice-screening-owner-connect-migration.mjs';

test('owner-connect migration and CLI bytes are pinned; history placeholders are poison',()=>{
  assert.equal(createHash('sha256').update(readFileSync(new URL('../supabase/migrations/'+BASENAME,import.meta.url))).digest('hex'),TARGET_HASH);
  assert.equal(CLI_VERSION,'2.116.0');
  assert.match(CLI_HASH,/^[0-9a-f]{64}$/);
  assert.match(GUARD,/raise exception/);
  assert.equal(HISTORY.at(-1),'20260910200000');
});
test('SQL envelopes and the exact Utah remote are constrained',()=>{
  assert.deepEqual(rows([{ok:true}]),[{ok:true}]);
  assert.deepEqual(rows({rows:[{ok:true}]}),[{ok:true}]);
  assert.throws(()=>rows({data:[]}));
  assert.ok(validRemote('https://github.com/Rconman99/frame-restoration-utah.git'));
  assert.ok(validRemote('git@github.com:Rconman99/frame-restoration-utah'));
  assert.equal(validRemote('https://github.com.evil.invalid/Rconman99/frame-restoration-utah'),false);
  assert.equal(validRemote('https://github.com/Rconman99/frame-restoration-texas-v2'),false);
});
test('only exact live history plus the single owner-connect target is admitted',()=>{
  validateHistory(HISTORY,false);
  validateHistory([...HISTORY,TARGET].sort(),true);
  assert.throws(()=>validateHistory([...HISTORY,'20260915000000'].sort(),false));
  assert.throws(()=>validateHistory(HISTORY.slice(1),false));
  const list={migrations:[...HISTORY.map(v=>({local:v,remote:v})),{local:TARGET,remote:''}]};
  validateList(list,false);
  assert.throws(()=>validateList(list,true));
  assert.throws(()=>validateList({migrations:[...list.migrations,{local:'20260915000000',remote:''}]},false));
});
test('catalog validation rejects partial schema and public execution',()=>{
  const before={history:HISTORY,recorded:false,decision_present:false,reconcile_present:false,finalize_present:false,screening_present:true,call_columns:8,lead_columns:15,notification_guarded:true};
  validateProbe([before],false);
  assert.throws(()=>validateProbe([{...before,decision_present:true}],false));
  assert.throws(()=>validateProbe([{...before,reconcile_present:true,finalize_present:true}],false));
  assert.throws(()=>validateProbe([{...before,call_columns:7}],false));
  assert.throws(()=>validateProbe([{...before,lead_columns:14}],false));
  const after={...before,history:[...HISTORY,TARGET].sort(),recorded:true,decision_present:true,reconcile_present:true,finalize_present:true,decision_source_md5:DECISION_SOURCE_MD5,reconcile_source_md5:RECONCILE_SOURCE_MD5,finalize_source_md5:FINALIZE_SOURCE_MD5,decision_security:true,reconcile_security:true,finalize_security:true,browser_revoked:true,service_access:true};
  validateProbe([after],true);
  assert.throws(()=>validateProbe([{...after,browser_revoked:false}],true));
  assert.throws(()=>validateProbe([{...after,service_access:false}],true));
  assert.throws(()=>validateProbe([{...after,decision_source_md5:'wrong'}],true));
  assert.throws(()=>validateProbe([{...after,reconcile_security:false}],true));
  assert.throws(()=>validateProbe([{...after,notification_guarded:false}],true));
});
