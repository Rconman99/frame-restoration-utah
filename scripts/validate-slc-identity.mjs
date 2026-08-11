#!/usr/bin/env node
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const pagePath = path.join(repo, 'locations/salt-lake-city.html');
const businessPath = path.join(repo, 'data/route-factory/business.json');
const html = fs.readFileSync(pagePath, 'utf8');
const business = JSON.parse(fs.readFileSync(businessPath, 'utf8'));

const EXPECTED_CID = '5689850818145735734';
const EXPECTED_MAP = `https://www.google.com/maps?cid=${EXPECTED_CID}`;
const EXPECTED_PHONE = '+14352928802';
const MARKER = `slc-identity-adoption-v1:${EXPECTED_CID}`;

function jsonLdBlocks(source) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let match;
  while ((match = re.exec(source))) blocks.push(JSON.parse(match[1]));
  return blocks;
}

function walk(node, predicate) {
  if (Array.isArray(node)) {
    for (const value of node) {
      const found = walk(value, predicate);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== 'object') return null;
  if (predicate(node)) return node;
  for (const value of Object.values(node)) {
    const found = walk(value, predicate);
    if (found) return found;
  }
  return null;
}

const blocks = jsonLdBlocks(html);
const contractor = walk(blocks, (node) => {
  const types = Array.isArray(node['@type']) ? node['@type'] : [node['@type']];
  return types.includes('RoofingContractor') && node.telephone;
});

assert.ok(contractor, 'SLC page must expose one primary RoofingContractor node');
assert.equal(contractor.name, 'Frame Restoration Utah LLC.');
assert.equal(contractor.telephone, EXPECTED_PHONE);
assert.equal(contractor.hasMap, EXPECTED_MAP);
assert.equal(contractor.address, undefined, 'SLC service-area profile must not publish a storefront address');
assert.equal(contractor.geo, undefined, 'SLC service-area profile must not publish storefront coordinates');

const expectedHours = [
  {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday'],
    opens: '08:00',
    closes: '19:00'
  },
  {
    '@type': 'OpeningHoursSpecification',
    dayOfWeek: 'Saturday',
    opens: '08:00',
    closes: '18:00'
  }
];
assert.deepEqual(contractor.openingHoursSpecification, expectedHours);

const override = business.entity_links?.location_overrides?.['salt-lake-city.html'];
assert.ok(override, 'SLC must have a location-specific entity override');
assert.equal(override.hasMap, EXPECTED_MAP);
assert.deepEqual(new Set(contractor.sameAs), new Set(override.sameAs));
assert.ok(contractor.sameAs.includes(EXPECTED_MAP));
assert.ok(contractor.areaServed?.some?.((place) => place?.name === 'Salt Lake City'));
assert.ok(contractor.areaServed?.some?.((place) => place?.name === 'Millcreek'));

const required = [
  MARKER,
  '(435) 292-8802',
  'Mon&ndash;Fri 8am&ndash;7pm, Sat 8am&ndash;6pm, Sun closed',
  'Home services only; the Google Business Profile does not publish a customer storefront address.',
  'Headquarters: 142 S Main St, Heber City, UT 84032',
  'Salt Lake City Building Services',
  'Salt Lake City Historic Preservation',
  'National Weather Service Salt Lake City'
];
for (const value of required) assert.ok(html.includes(value), `SLC page missing required evidence: ${value}`);

const forbidden = [
  '+18014620526',
  '(801) 462-0526',
  '3920 S 1500 E',
  'Salt Lake City Office',
  '24/7',
  '24-48 hours',
  '$8,000',
  '$28,000',
  '1-4 days',
  '2-4 weeks',
  '5-10 years',
  '1,300+',
  '20–30°F',
  '50%+',
  "We're 15 minutes away",
  '10-year workmanship warranty',
  'workers\' compensation',
  'BBB A+ accredited',
  'yelp.com/biz/frame-restoration-heber-city',
  'gohebervalley.com',
  'angi.com/companylist/us/ut/heber-city',
  'thumbtack.com/ut/heber-city',
  'nextdoor.com/page/frame-restoration-utah-llc-heber-city-ut',
  'Frame+Restoration+Utah/@40.5069'
];
for (const value of forbidden) assert.ok(!html.includes(value), `SLC page contains forbidden identity/claim drift: ${value}`);

const projectAssets = [
  'images/projects/cities/salt-lake-city-residential-reroof-2026.webp',
  'images/projects/cities/millcreek-commercial-reroof-2025.webp',
  'images/projects/cities/holladay-residential-reroof-2025.webp'
];
for (const asset of projectAssets) {
  assert.ok(fs.existsSync(path.join(repo, asset)), `Missing SLC regional project asset: ${asset}`);
  assert.ok(html.includes(`/${asset}`), `SLC page does not render project asset: ${asset}`);
}

console.log('SLC identity adoption contract: PASS');
