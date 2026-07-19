#!/usr/bin/env node
/**
 * Backfill `hasMap` + `sameAs` onto every location page's primary RoofingContractor
 * JSON-LD node (AEO Pillar 2 — entity consistency). Source of truth is
 * data/route-factory/business.json -> entity_links. Inserts right after
 * `parentOrganization` (same anchor the review backfill uses), so it composes
 * with pages that already carry a <Review>.
 *
 * Idempotent: skips a page that already has hasMap/sameAs. The canonical values
 * live in business.json; audit-entity-consistency.mjs asserts the pages match.
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const { entity_links: links } = JSON.parse(fs.readFileSync(path.join(repo, 'data/route-factory/business.json'), 'utf8'));
if (!links?.hasMap || !Array.isArray(links.sameAs)) { console.error('business.json entity_links.hasMap/sameAs missing'); process.exit(1); }

// parentOrganization is the RoofingContractor node's last identity property; we
// append after it (keeping its leading indent so siblings align).
const PARENT_RE = /^([ \t]*)"parentOrganization":\s*\{[^{}]*"url":\s*"https:\/\/www\.framerestorationutah\.com"\s*\}/m;

const files = fs.readdirSync(path.join(repo, 'locations')).filter((f) => f.endsWith('.html')).sort();
let changed = 0;
for (const f of files) {
  const file = path.join(repo, 'locations', f);
  let html = fs.readFileSync(file, 'utf8');

  if (/"hasMap"\s*:/.test(html) || /"sameAs"\s*:/.test(html)) { console.log(`skip ${f}: already has hasMap/sameAs`); continue; }
  const m = html.match(PARENT_RE);
  if (!m) { console.log(`ABORT ${f}: parentOrganization anchor not found`); continue; }
  const indent = m[1];
  const i = indent + '  ';

  const sameAsLines = links.sameAs.map((u, n) => `${i}${JSON.stringify(u)}${n < links.sameAs.length - 1 ? ',' : ''}`).join('\n');
  const block =
    `,\n${indent}"hasMap": ${JSON.stringify(links.hasMap)},\n` +
    `${indent}"sameAs": [\n${sameAsLines}\n${indent}]`;

  html = html.replace(PARENT_RE, (full) => full + block);
  fs.writeFileSync(file, html);
  changed++;
}
console.log(`\n${changed}/${files.length} location pages updated with hasMap + sameAs.`);
