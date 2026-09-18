import assert from 'node:assert/strict';
import {createReadOnlyRouteHandler} from './lib/davis-browser-routing.mjs';
const base='https://preview.example.test';
const marker='QA_TEST_BYPASS';
const handler=createReadOnlyRouteHandler(base,marker);
async function exercise(url,method='GET',incoming={}){
 const calls=[];
 const response={status:()=>302,headers:()=>({location:'https://external.example.test/after-redirect'})};
 const route={request:()=>({url:()=>url,method:()=>method,headers:()=>incoming}),
  abort:()=>calls.push(['abort']),continue:opts=>calls.push(['continue',opts]),
  fetch:async opts=>{calls.push(['fetch',opts]);return response;},
  fulfill:opts=>calls.push(['fulfill',opts])};
 await handler(route);return {calls,response};
}
let r=await exercise(base+'/page');
assert.equal(r.calls[0][0],'fetch');
assert.equal(r.calls[0][1].headers['x-vercel-protection-bypass'],marker);
assert.equal(r.calls[0][1].maxRedirects,0);
assert.equal(r.calls[1][0],'fulfill');
assert.equal(r.calls[1][1].response,r.response);
for(const url of ['https://external.example.test/font','https://external.example.test/after-redirect','http://preview.example.test/','https://preview.example.test.evil.test/']){
 r=await exercise(url,'GET',{'x-vercel-protection-bypass':marker,'X-Vercel-Skip-Toolbar':'1',accept:'*/*'});
 assert.deepEqual(r.calls,[['continue',{headers:{accept:'*/*'}}]]);
}
assert.deepEqual((await exercise(base+'/submit','POST')).calls,[['abort']]);
assert.deepEqual((await exercise('https://us.i.posthog.com/e/')).calls,[['abort']]);
let unprotected;
await createReadOnlyRouteHandler(base)( {request:()=>({url:()=>base,method:()=> 'GET',headers:()=>({})}),continue:opts=>unprotected=opts} );
assert.deepEqual(unprotected,{headers:{}});
console.log('PASS read-only QA routing: bypass scoped to exact origin, no redirect forwarding, foreign headers stripped, unsafe methods and analytics blocked');
