import {chromium} from 'playwright';
import assert from 'node:assert/strict';
const base=process.argv[2]||'http://127.0.0.1:4192';
assert(!process.env.SURFACE_GATE_PROTECTION_BYPASS_SECRET,'Protected previews use shared surface gate only');
assert(['http://127.0.0.1:4192','https://www.framerestorationutah.com'].includes(base));
const local=base.startsWith('http:');
const browser=await chromium.launch();let checks=0;
try {
 for(const path of [local?'/index.html':'/',local?'/pages/storm-damage.html':'/pages/storm-damage']) {
  for(const [width,height] of [[320,568],[360,800],[393,852],[430,932],[740,360],[1440,1000]]) {
   const ctx=await browser.newContext({viewport:{width,height},serviceWorkers:'block'});
   await ctx.route('**/*',route=>{
    const request=route.request();const url=new URL(request.url());
    if(!['GET','HEAD'].includes(request.method())||/posthog|google-analytics/.test(url.hostname))return route.abort();
    return route.continue();
   });
   const page=await ctx.newPage();await page.goto(base+path);await page.locator('main').waitFor();
   const module=page.locator('[data-davis-discovery="20260918b"]');
   assert.equal(await module.count(),1);checks++;
   assert.equal(await module.locator('a').count(),3);checks++;
   assert.equal(await module.locator('time').getAttribute('datetime'),'2026-09-18');checks++;
   assert.equal(await module.locator('h2').evaluate(e=>getComputedStyle(e).color),'rgb(11, 64, 96)');checks++;
   assert.equal(await module.evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(238, 244, 249)');checks++;
   for(const link of await module.locator('a').all()) {
    await link.evaluate(e=>e.scrollIntoView({block:'center',behavior:'instant'}));await page.waitForTimeout(100);
    assert(await link.evaluate(e=>{const r=e.getBoundingClientRect();return r.width>=44&&r.height>=44&&e.contains(document.elementFromPoint(r.x+r.width/2,r.y+r.height/2));}),'Davis link not tappable after scrolling');checks++;
    assert(!(await link.getAttribute('href')).includes('utm_'));checks++;
   }
   await module.locator('a[href$="#contact"]').click();
   await page.waitForURL(u=>u.hash==='#contact');assert(await page.locator('#contact').count()===1);checks++;
   assert.equal(await page.locator('#leadForm input[name="sms_consent"]').isChecked(),false);checks++;
   await ctx.close();
  }
 }
 console.log(`PASS Davis discovery: ${checks} checks across 2 routes / 6 viewports; no sends, submissions or analytics`);
} finally {await browser.close();}
