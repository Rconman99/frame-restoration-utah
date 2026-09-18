import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
const home = fs.readFileSync('index.html', 'utf8');
const storm = fs.readFileSync('pages/storm-damage.html', 'utf8');
for (const html of [home, storm]) {
  assert(html.includes('data-hail-campaign="20260917a"'));
  assert(html.includes('/hail-campaign.css?v=20260917a'));
  for (const city of ['midway', 'hideout', 'charleston']) {
    assert(html.includes(`href="/blog/${city}/hail-roof-inspection-${city}"`), `${city} crawlable discovery`);
  }
}
assert(home.includes('/hail-guide-context.js?v=20260917a'));
assert.equal(home.split('FrameHailGuideContext.apply(payload)').length - 1, 2);
assert(!/within 15 minutes/i.test(home));
assert(!/within 24 hours|45[–-]60 days|golf.ball.sized|24\/7/i.test(storm));
const faq = [...storm.matchAll(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/g)].map(m => JSON.parse(m[1])).find(x => x['@type'] === 'FAQPage');
const visible = storm.slice(storm.indexOf('<!-- FAQ Section -->'));
for (const i of [0, 2]) assert(visible.includes(faq.mainEntity[i].acceptedAnswer.text), 'Repaired FAQ must match visible answer');
for (const city of ['midway', 'hideout', 'charleston']) {
  const html = fs.readFileSync(`blog/${city}/hail-roof-inspection-${city}.html`, 'utf8');
  assert(html.includes('data-hail-campaign="20260917a"'));
  assert(html.includes(`href="/?roof_guide=${city}#contact"`));
  assert(!html.includes('href="/#contact"'), 'Every static guide-to-contact link carries context');
  assert(!/href="\/\?[^"\s]*utm_/i.test(html), 'No internal acquisition reset');
}
console.log('PASS hail campaign: crawlable discovery, versioned scoped assets, form integration, safe claims and repaired FAQ parity');
const script = fs.readFileSync('hail-guide-context.js', 'utf8');
for (const key of ['midway', 'hideout', 'charleston']) {
  const window = { location: { pathname: '/', search: `?roof_guide=${key}&email=private%40example.test` } };
  vm.runInNewContext(script, { window, URLSearchParams, document: { querySelectorAll: () => [] } });
  for (const message of [undefined, '', 'Active leak', 'x'.repeat(5000)]) {
    const payload = { source_page: '/', city: 'Heber City', issue: 'leak', message, landing_page: '/original', utm_source: 'google', sms_consent: false };
    const before = structuredClone(payload);
    window.FrameHailGuideContext.apply(payload);
    assert.deepEqual(payload, { ...before, source_page: `/?roof_guide=${key}` }, 'Only the bounded actual submit URL may change; classifier/PII/acquisition fields are immutable');
  }
}
console.log('PASS guide context: 12 classifier-input invariance cases, including empty and 5000-character messages; arbitrary query PII excluded');
