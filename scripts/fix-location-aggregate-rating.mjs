#!/usr/bin/env node
// Rating-integrity fix (Option A): remove the business-wide AggregateRating from
// service-area pages so Frame's real Google rating (4.9 / 248, source of truth =
// reviews.json) lives ONLY on the canonical home/org entity — not cloned across
// 45 service-area pages, which is a Google rich-results + duplicated-markup risk.
//
// Surgical + safe: removes only the `"aggregateRating": { ... }` property from
// each application/ld+json block, validates the block still parses as JSON, and
// leaves everything else byte-identical (minimal diff). Idempotent.
//
// Usage:
//   node scripts/fix-location-aggregate-rating.mjs locations/*.html            # dry-run (default)
//   node scripts/fix-location-aggregate-rating.mjs --apply locations/*.html    # write changes
//
// Do NOT pass index.html — the home/org page keeps the canonical rating.

import fs from 'node:fs';

const args = process.argv.slice(2);
const apply = args.includes('--apply');
const files = args.filter((a) => !a.startsWith('--'));
if (!files.length) {
  console.error('Usage: node scripts/fix-location-aggregate-rating.mjs [--apply] <files...>');
  process.exit(2);
}

const LD = /(<script[^>]*type=["']application\/ld\+json["'][^>]*>)([\s\S]*?)(<\/script>)/gi;
let filesChanged = 0;
let blocksChanged = 0;
const warnings = [];

for (const file of files) {
  const original = fs.readFileSync(file, 'utf8');
  let fileChanged = false;
  const next = original.replace(LD, (m, open, body, close) => {
    if (!body.includes('"aggregateRating"')) return m;
    // Flat object only ([^{}]* — aggregateRating has scalar props), comma either side.
    const stripped = body
      .replace(/,\s*"aggregateRating"\s*:\s*\{[^{}]*\}/g, '')
      .replace(/"aggregateRating"\s*:\s*\{[^{}]*\}\s*,/g, '');
    if (stripped === body) return m;
    try {
      JSON.parse(stripped);
    } catch {
      warnings.push(`${file}: removal would break JSON — left unchanged (inspect manually)`);
      return m;
    }
    blocksChanged += 1;
    fileChanged = true;
    return `${open}${stripped}${close}`;
  });
  if (fileChanged) {
    filesChanged += 1;
    if (apply) fs.writeFileSync(file, next);
  }
  console.log(`${fileChanged ? (apply ? 'FIXED ' : 'WOULDFIX') : 'skip   '} ${file}`);
}

for (const w of warnings) console.warn(`! ${w}`);
console.log(
  `\n${apply ? 'Applied' : 'Dry-run'}: ${blocksChanged} aggregateRating block(s) across ${filesChanged} file(s)` +
    `${apply ? ' removed.' : ' would be removed. Re-run with --apply to write.'}`,
);
