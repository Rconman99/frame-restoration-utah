#!/usr/bin/env node
/**
 * Competitor SERP + Ads scan for Frame Roofing Utah.
 *
 * Pulls SerpAPI Google SERP for our priority KW × cities, captures:
 *   - Where competitors appear in organic top 10
 *   - Where competitors appear in paid (top_ads / shopping_ads)
 *   - Local pack presence (GBP)
 *
 * Output: data/competitor-ads-report-{YYYY-MM-DD}.json + .md summary
 *
 * Cost: ~$0.005/call × ~30 queries = ~$0.15 per full sweep
 *
 * Required env: SERPAPI_KEY
 *   SERPAPI_KEY=... node scripts/competitor-ads.mjs
 *
 * Reuse Frame Utah's existing SerpAPI key (already used for review-sync).
 *
 * Dry-run mode: if SERPAPI_KEY is unset, prints the queries it WOULD run
 * and the estimated spend, exits with code 0. No spend.
 */

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

// Tracked competitors (Wave 1 confirmed) — domains we look for in SERP results
const COMPETITORS = [
  { name: 'roofingutah.com', domain: 'roofingutah.com', notes: 'exact-match domain, content-DORMANT since 2024-05-31' },
  { name: 'utahroofingcompany.com', domain: 'utahroofingcompany.com', notes: 'no blog, 22 URLs total' },
  { name: 'reignroofing.com', domain: 'reignroofing.com', notes: 'placeholder — verify' },
  { name: 'frameroofingutah.com', domain: 'frameroofingutah.com', notes: 'us — for own positioning' },
];

const PRIORITY_KW = [
  'roofer in {city}',
  'roof repair {city} utah',
  'roof replacement {city}',
  'ice dam removal {city}',
  'wind damage roof {city}',
];

const PRIORITY_CITIES = [
  { name: 'Park City', state: 'UT' },
  { name: 'Heber City', state: 'UT' },
  { name: 'Draper', state: 'UT' },
  { name: 'Salt Lake City', state: 'UT' },
  { name: 'Cottonwood Heights', state: 'UT' },
  { name: 'Bountiful', state: 'UT' },
];

const SERPAPI_KEY = process.env.SERPAPI_KEY;

async function fetchSerp({ q, location }) {
  const url = new URL('https://serpapi.com/search.json');
  url.searchParams.set('engine', 'google');
  url.searchParams.set('q', q);
  url.searchParams.set('location', location);
  url.searchParams.set('hl', 'en');
  url.searchParams.set('gl', 'us');
  url.searchParams.set('api_key', SERPAPI_KEY);
  const res = await fetch(url);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
  return res.json();
}

function competitorHitsInResults(serp, competitors) {
  const hits = {};
  for (const c of competitors) hits[c.domain] = { organic: [], paid: [], localPack: false };
  const all = [
    ...(serp.organic_results || []).map((r, i) => ({ kind: 'organic', position: i + 1, link: r.link, title: r.title })),
    ...(serp.ads || []).map((r, i) => ({ kind: 'paid', position: i + 1, link: r.link, title: r.title })),
  ];
  for (const r of all) {
    if (!r.link) continue;
    for (const c of competitors) {
      if (r.link.includes(c.domain)) hits[c.domain][r.kind].push({ position: r.position, title: r.title, link: r.link });
    }
  }
  for (const c of competitors) {
    if ((serp.local_results?.places || []).some((p) => (p.links?.website || '').includes(c.domain))) {
      hits[c.domain].localPack = true;
    }
  }
  return hits;
}

async function main() {
  const queries = [];
  for (const kw of PRIORITY_KW) {
    for (const city of PRIORITY_CITIES) {
      const q = kw.replaceAll('{city}', city.name);
      const location = `${city.name}, ${city.state}, United States`;
      queries.push({ q, location, city: city.name, kw });
    }
  }

  if (!SERPAPI_KEY) {
    console.log('\n[competitor-ads] DRY RUN — SERPAPI_KEY not set');
    console.log(`  queries:        ${queries.length}`);
    console.log(`  est spend:      $${(queries.length * 0.005).toFixed(2)}`);
    console.log(`  competitors:    ${COMPETITORS.map((c) => c.name).join(', ')}`);
    console.log(`  cities:         ${PRIORITY_CITIES.map((c) => c.name).join(', ')}`);
    console.log(`  keywords:       ${PRIORITY_KW.length}`);
    console.log('\n  To fire: SERPAPI_KEY=... npm run competitor-ads');
    console.log('  (reuse the Frame Utah review-sync key)\n');
    return;
  }

  console.log(`\n[competitor-ads] LIVE — running ${queries.length} SerpAPI queries…`);
  const results = [];
  for (const [idx, q] of queries.entries()) {
    process.stdout.write(`  [${idx + 1}/${queries.length}] ${q.q} (${q.city})…`);
    try {
      const serp = await fetchSerp({ q: q.q, location: q.location });
      const hits = competitorHitsInResults(serp, COMPETITORS);
      results.push({ ...q, hits, total_organic: (serp.organic_results || []).length, has_local_pack: !!serp.local_results });
      console.log(` ✓`);
    } catch (err) {
      console.log(` ✗ ${err.message}`);
      results.push({ ...q, error: err.message });
    }
  }

  const dataDir = join(PROJECT_ROOT, 'data');
  if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });
  const date = new Date().toISOString().slice(0, 10);
  const jsonPath = join(dataDir, `competitor-ads-report-${date}.json`);
  writeFileSync(jsonPath, JSON.stringify({ generatedAt: new Date().toISOString(), competitors: COMPETITORS, results }, null, 2) + '\n');

  // Summary markdown
  const summary = [];
  summary.push(`# Frame Utah — Competitor SERP Scan`);
  summary.push(`\n**Generated:** ${date}\n`);
  summary.push(`## Competitor presence by domain\n`);
  summary.push(`| Competitor | Organic hits | Paid hits | Local-pack appearances |`);
  summary.push(`|---|---|---|---|`);
  for (const c of COMPETITORS) {
    let organic = 0, paid = 0, local = 0;
    for (const r of results) {
      if (!r.hits) continue;
      organic += (r.hits[c.domain]?.organic || []).length;
      paid += (r.hits[c.domain]?.paid || []).length;
      if (r.hits[c.domain]?.localPack) local += 1;
    }
    summary.push(`| ${c.name} | ${organic} | ${paid} | ${local} / ${queries.length} |`);
  }
  const mdPath = join(dataDir, `competitor-ads-report-${date}.md`);
  writeFileSync(mdPath, summary.join('\n') + '\n');
  console.log(`\n[competitor-ads] done.`);
  console.log(`  json:  ${jsonPath}`);
  console.log(`  md:    ${mdPath}`);
}

main().catch((err) => { console.error(err); process.exit(1); });
