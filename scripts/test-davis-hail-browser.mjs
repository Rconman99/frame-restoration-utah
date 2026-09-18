import {chromium} from 'playwright';
import assert from 'node:assert/strict';
import {createReadOnlyRouteHandler} from './lib/davis-browser-routing.mjs';
const base=process.argv[2]||'http://127.0.0.1:4192';
const local=new URL(base).hostname==='127.0.0.1';
assert(local||base==='https://www.framerestorationutah.com'||/^https:\/\/frame-restoration-utah-[a-z0-9-]+\.vercel\.app$/.test(base));
const browser=await chromium.launch();
let checks=0;
try{
 for(const city of ['layton','farmington']) for(const [width,height] of [[320,568],[360,800],[393,852],[430,932],[740,360],[1440,1000]]){
  const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
  await ctx.route('**/*',createReadOnlyRouteHandler(base,process.env.SURFACE_GATE_PROTECTION_BYPASS_SECRET));
  const page=await ctx.newPage();
  await page.goto(base+`/blog/${city}/hail-roof-inspection-${city}`+(local?'.html':''));
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
  await page.locator(`[data-cta="${city}-hail-inspection"]`).click();
  await page.waitForURL(url=>url.searchParams.get('roof_guide')===city&&url.hash==='#contact');
  await page.waitForFunction(()=>Boolean(window.FrameHailGuideContext));
  assert.equal(await page.locator('#heroForm .hail-guide-context, #leadForm .hail-guide-context').count(),2);checks++;
  assert((await page.locator('#leadForm .hail-guide-context').textContent()).includes(city[0].toUpperCase()+city.slice(1)));checks++;
  const payload=await page.evaluate(()=>{const p={city:'Actual town',issue:'inspection',message:'No leak reported',utm_source:'google',sms_consent:false};window.FrameHailGuideContext.apply(p);return p;});
  assert.deepEqual(payload,{city:'Actual town',issue:'inspection',message:'No leak reported',utm_source:'google',sms_consent:false,source_page:'/?roof_guide='+city});checks++;
  // Finish buffered same-origin requests before closing their context; otherwise
  // a late image response raises TargetClosedError in the route callback.
  // Keep a deny-all page guard while context routes drain.
  await page.route('**/*',route=>route.abort());
  await ctx.unrouteAll({behavior:'wait'});
  await ctx.close();
 }
 console.log('PASS Davis guides rendered semantics: '+checks+' checks; no calls, texts or forms submitted');
}finally{await browser.close();}
