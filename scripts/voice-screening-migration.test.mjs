import assert from 'node:assert/strict';
import test from 'node:test';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {MARKETS,TARGET,BASENAME,TARGET_HASH,GUARD,rows,validRemote,validateHistory,validateList,validateProbe} from './voice-screening-migration.mjs';

test('migration hash pins reviewed bytes; history placeholders are poison',()=>{
  assert.equal(createHash('sha256').update(readFileSync(new URL('../supabase/migrations/'+BASENAME,import.meta.url))).digest('hex'),TARGET_HASH);
  assert.match(GUARD,/raise exception/);
  assert.deepEqual(Object.keys(MARKETS),['utah','texas']);
});
test('both CLI SQL envelopes are parsed, other shapes fail',()=>{
  assert.deepEqual(rows([{ok:true}]),[{ok:true}]);
  assert.deepEqual(rows({rows:[{ok:true}]}),[{ok:true}]);
  assert.throws(()=>rows({data:[]}));
});
test('release remote must be the exact market repository on GitHub',()=>{
  for(const market of Object.keys(MARKETS)){
    const path='Rconman99/'+MARKETS[market].repo;
    assert.ok(validRemote(market,'https://github.com/'+path+'.git'));
    assert.ok(validRemote(market,'git@github.com:'+path));
    for(const remote of ['https://other.invalid/'+path,'https://github.com.evil.invalid/'+path,'https://github.com/unrelated/'+path,'https://github.com/'+path+'?other=true'])
      assert.equal(validRemote(market,remote),false);
  }
  assert.equal(validRemote('idaho','https://github.com/Rconman99/frame-idaho-web'),false);
  assert.equal(validRemote('utah','https://github.com/Rconman99/frame-restoration-texas-v2'),false);
});
for(const market of Object.keys(MARKETS)){
  test(market+' admits only exact history and the single intended pending migration',()=>{
    const base=MARKETS[market].history;
    validateHistory(market,base,false);
    validateHistory(market,[...base,TARGET].sort(),true);
    assert.throws(()=>validateHistory(market,[...base,'20260911000000'].sort(),false));
    assert.throws(()=>validateHistory(market,base.slice(1),false));
    const list={migrations:[...base.map(v=>({local:v,remote:v})),{local:TARGET,remote:''}]};
    validateList(market,list,false);
    assert.throws(()=>validateList(market,list,true));
    assert.throws(()=>validateList(market,{migrations:[...list.migrations,{local:'20260911000000',remote:''}]},false));
  });
  test(market+' rejects partial schema and missing privacy controls',()=>{
    const before={history:MARKETS[market].history,recorded:false,target_present:false,view_present:false,parent_columns:7};
    validateProbe(market,[before],false);
    assert.throws(()=>validateProbe(market,[{...before,target_present:true}],false));
    assert.throws(()=>validateProbe(market,[{...before,parent_columns:6}],false));
    const after={...before,history:[...before.history,TARGET].sort(),recorded:true,target_present:true,view_present:true,rls:true,policies:0,triggers:1,invoker:true,browser_revoked:true,service_access:true};
    validateProbe(market,[after],true);
    for(const field of ['rls','invoker','browser_revoked','service_access']) assert.throws(()=>validateProbe(market,[{...after,[field]:false}],true));
    assert.throws(()=>validateProbe(market,[{...after,policies:1}],true));
  });
}
