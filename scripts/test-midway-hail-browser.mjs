import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:4187';
const local=new URL(base).hostname==='127.0.0.1';
assert(local||/^https:\/\/frame-restoration-utah-[a-z0-9-]+\.vercel\.app$/.test(base));
const browser=await chromium.launch();
let checks=0;
try{
 for(const [width,height] of [[320,568],[360,800],[393,852],[430,932],[740,360],[1440,1000]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await ctx.route('**/*',route=>{
   const request=route.request();const u=new URL(request.url());
   if(!['GET','HEAD'].includes(request.method())||/posthog|google-analytics/.test(u.hostname))return route.abort();
   return route.continue();
  });
  const page=await ctx.newPage();
  await page.goto(base+'/blog/midway/hail-roof-inspection-midway'+(local?'.html':''));
  await page.locator('main').waitFor();
  assert(await page.locator('.hail-hero img').evaluate(img=>img.complete&&img.naturalWidth>0));checks++;
  assert(await page.locator('.hail-hero h1').evaluate(e=>getComputedStyle(e).color==='rgb(255, 255, 255)'));checks++;
  assert(await page.locator('.hail-hero').evaluate(e=>getComputedStyle(e).backgroundColor==='rgb(11, 64, 96)'));checks++;
  for(const link of await page.locator('.hail-actions a').all()){
   await link.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));
   await page.waitForTimeout(100);
   assert(await link.evaluate(e=>{const r=e.getBoundingClientRect();return r.height>=44&&r.width>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Inline CTA inaccessible after scroll');checks++;
  }
  await page.locator('.hail-faq summary').first().click();assert(await page.locator('.hail-faq details').first().getAttribute('open')!==null);checks++;
  await page.evaluate(()=>scrollTo(0,0));
  if(width<=900){await page.locator('#menuBtn').click();assert(await page.locator('#navLinks').isVisible());await page.locator('#menuBtn').click();checks++;}
  await ctx.close();
 }
 console.log('PASS Midway rendered semantics: '+checks+' checks; no calls, texts or forms submitted');
}finally{await browser.close();}
