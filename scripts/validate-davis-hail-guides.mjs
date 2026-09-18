import fs from 'node:fs';
import assert from 'node:assert/strict';
for (const city of ['layton','farmington']) {
 const route=`/blog/${city}/hail-roof-inspection-${city}`;
 const html=fs.readFileSync(`.${route}.html`,'utf8');
 const canonical=`https://www.framerestorationutah.com${route}`;
 assert.equal((html.match(/<h1[ >]/g)||[]).length,1);
 assert(html.includes(`rel="canonical" href="${canonical}"`));
 assert(html.includes('name="frame-release" content="davis-hail-20260918a"'));
 assert(html.includes('/track-attribution.js')&&html.includes('/track-clicks.js?v=2'));
 assert(!/tel:(?!\+14352928802)/.test(html));
 assert(html.includes('sms:+14352928802'));
 assert(!/IMG_5856|AggregateRating|ReviewRating|humanWritten|24\/7|same-day service|golf.ball.size|baseball.size|insurance approval/i.test(html));
 assert(html.includes('not evidence of damage from a current storm'));
 assert(html.includes('background:#0b4060')&&html.includes('.hail-hero h1'));
 const graph=JSON.parse(html.match(/<script type="application\/ld\+json">\s*([\s\S]*?)\s*<\/script>/)[1])['@graph'];
 const article=graph.find(x=>x['@type']==='BlogPosting');
 assert.equal(article.mainEntityOfPage,canonical);
 assert.equal(article.author['@type'],'Organization');
 assert.equal(article.publisher['@id'],'https://www.framerestorationutah.com/#organization');
 assert.equal(article.spatialCoverage.name,city[0].toUpperCase()+city.slice(1)+', Utah');
 assert.equal(article.datePublished,'2026-09-18');
 assert.equal(article.citation,'https://api.weather.gov/products/b3fe6d64-4c42-4e74-9e80-10219b113785');
 assert(html.includes('2:24 p.m. MDT')&&html.includes('3:00 p.m. MDT')&&html.includes('radar-indicated'));
 assert(html.includes('/?roof_guide='+city+'#contact'));
 assert(html.includes('Frame Restoration Utah LLC · 142 S Main St, Heber City, UT 84032'));
 assert(html.includes('docs/DAVIS-COUNTY-HAIL-2026-09-18.md'));
 const faq=graph.find(x=>x['@type']==='FAQPage').mainEntity;
 const visible=[...html.matchAll(/<details><summary>(.*?)<\/summary><p>(.*?)<\/p><\/details>/g)];
 assert.equal(faq.length,6);assert.equal(visible.length,6);
 faq.forEach((q,i)=>{assert.equal(q.name,visible[i][1]);assert.equal(q.acceptedAnswer.text,visible[i][2]);});
 for(const file of ['blog/index.html',`locations/${city}.html`,'index.html','pages/storm-damage.html'])assert(fs.readFileSync(file,'utf8').includes(`href="${route}"`),`${file}: missing ${city} discovery`);
 assert.equal(fs.readFileSync('sitemap.xml','utf8').split(`<loc>${canonical}</loc>`).length-1,1);
 const text=html.match(/<article[\s\S]*?<\/article>/)[0].replace(/<[^>]*>/g,' ');
 assert(text.split(/\s+/).length>=1150,`${city}: editorial floor`);
 assert(!text.includes('100%'));
 console.log(`PASS ${city}: identity, safe claims, real-photo disclosure, FAQ parity, attribution, discovery, editorial floor`);
}
for(const file of ['index.html','pages/storm-damage.html']) {
 const html=fs.readFileSync(file,'utf8');
 const module=html.match(/<section[^>]*data-davis-discovery="20260918b"[\s\S]*?<\/section>/)?.[0];
 assert(module,`${file}: missing dated Davis feature`);
 assert(module.includes('<time datetime="2026-09-18">September 18, 2026</time>'));
 assert(module.includes('does not confirm damage to your roof'));
 assert(!/utm_|SLC|Salt Lake|today|now|guarantee/i.test(module),'No internal campaign overwrite or unsupported urgency/SLC damage');
 assert(module.includes(`href="${file==='index.html'?'#contact':'/#contact'}"`));
 for(const city of ['midway','hideout','charleston'])assert(html.includes(`/blog/${city}/hail-roof-inspection-${city}`));
}
console.log('PASS Davis amplification: dated safe module, two entry points, original guides preserved, no internal UTM reset');
