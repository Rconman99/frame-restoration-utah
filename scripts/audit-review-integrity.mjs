#!/usr/bin/env node
/**
 * Review & rating integrity gate for Frame Roofing Utah.
 *
 * Codifies the compliance line carried forward from commit 816c280, which had to
 * remove a *cloned* AggregateRating from 45 location pages: "Never re-clone a
 * sitewide rating onto city pages. All review/rating markup must come from real
 * google-reviews-sync data only. Fake/cloned ratings = hard block."
 *
 * Frame is a SINGLE-location business → ONE real Google Business Profile → ONE
 * real aggregate rating. That rating may live on the homepage when it is paired
 * with attributed reviews from the synchronized review pool. Replicating it onto
 * per-city pages is, by definition, the banned clone. The proven pattern (TX:
 * 0/45 AggregateRating, 45/45 Review — and the 2 clean UT pages) is:
 *   location pages carry individual <Review> markup from REAL reviewers, never
 *   an AggregateRating.
 *
 * Checks (BLOCK in --strict):
 *   1. NO-AGGREGATE-ON-CITY — any aggregateRating in a locations/*.html JSON-LD
 *                             block. This is the anti-clone rule (ref 816c280).
 *   2. NO-AGGREGATE-ABOUT  — About cannot carry a bare/self-serving aggregate.
 *   3. HOMEPAGE-EVIDENCE   — homepage aggregate must include attributed reviews.
 *   4. REAL-REVIEWERS-ONLY — any <Review> node whose author is NOT in the real
 *                             sync pool (reviews.json + data/reviews-full.json).
 *                             Catches fabricated/invented reviews.
 *   5. RATING-MATCHES-DATA — a matched reviewer's on-page reviewRating that
 *                             disagrees with their real rating (warning only —
 *                             a reviewer can have given any star value).
 *
 * Source of truth for "real" reviews: reviews.json + data/reviews-full.json,
 * both written by scripts/update-google-reviews.py (SerpAPI Google Maps sync).
 *
 * Default mode is INFORMATIONAL (report, exit 0). Pass --strict to exit 1 on any
 * blocker — that's how the Compliance Gate runs it.
 *
 * Usage:
 *   node scripts/audit-review-integrity.mjs            # report, exit 0
 *   node scripts/audit-review-integrity.mjs --strict   # report, exit 1 on blockers
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const strict = process.argv.includes('--strict');

// ---- real-review source of truth -----------------------------------------
function loadRealAuthors() {
  const authors = new Map(); // normalized name -> { rating(s) seen }
  for (const rel of ['reviews.json', 'data/reviews-full.json']) {
    const p = path.join(repoRoot, rel);
    if (!fs.existsSync(p)) continue;
    let json;
    try { json = JSON.parse(fs.readFileSync(p, 'utf8')); } catch { continue; }
    const list = Array.isArray(json) ? json : (json.reviews || []);
    for (const r of list) {
      const name = normName(r.author || r.name || r.user || '');
      if (!name) continue;
      if (!authors.has(name)) authors.set(name, new Set());
      const rating = Number(r.rating ?? r.stars ?? r.ratingValue);
      if (Number.isFinite(rating)) authors.get(name).add(rating);
    }
  }
  return authors;
}

function normName(s) {
  return String(s).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

// ---- JSON-LD extraction ----------------------------------------------------
function jsonLdBlocks(html) {
  const blocks = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) {
    try { blocks.push(JSON.parse(m[1])); } catch { /* jsonld-validity gate owns parse errors */ }
  }
  return blocks;
}

// recursively collect: does any node carry aggregateRating? + every Review node
function walk(node, acc) {
  if (Array.isArray(node)) { for (const n of node) walk(n, acc); return; }
  if (!node || typeof node !== 'object') return;
  for (const [k, v] of Object.entries(node)) {
    if (k.toLowerCase() === 'aggregaterating' && v) acc.hasAggregate = true;
  }
  const type = node['@type'];
  const types = Array.isArray(type) ? type : [type];
  if (types.includes('Review')) acc.reviews.push(node);
  // Recurse into every object-valued property (incl. the `review` property,
  // which may hold a Review or an array of them). One pass — no explicit
  // re-walk of `review`, which would double-count it.
  for (const v of Object.values(node)) {
    if (v && typeof v === 'object') walk(v, acc);
  }
}

function reviewAuthorName(review) {
  const a = review.author;
  if (!a) return '';
  if (typeof a === 'string') return a;
  if (Array.isArray(a)) return a.map(x => (typeof x === 'string' ? x : x?.name) || '').filter(Boolean).join(', ');
  return a.name || '';
}

function reviewRatingValue(review) {
  const rr = review.reviewRating || review.ratingValue;
  if (!rr) return undefined;
  const v = Number(typeof rr === 'object' ? rr.ratingValue : rr);
  return Number.isFinite(v) ? v : undefined;
}

// ---- scope: location pages (the clone-risk surface) -----------------------
const locDir = path.join(repoRoot, 'locations');
const files = fs.existsSync(locDir)
  ? fs.readdirSync(locDir).filter(f => f.endsWith('.html')).map(f => path.join('locations', f)).sort()
  : [];

const realAuthors = loadRealAuthors();
const blockers = [];
const warnings = [];

function auditReviewNodes(rel, reviews) {
  for (const review of reviews) {
    const rawName = reviewAuthorName(review);
    const name = normName(rawName);
    if (!name) {
      blockers.push({ type: 'real-reviewers-only', file: rel, detail: '<Review> with no author name — cannot verify against sync data.' });
      continue;
    }
    if (!realAuthors.has(name)) {
      blockers.push({
        type: 'real-reviewers-only',
        file: rel,
        detail: `<Review> author "${rawName}" is not in the real sync pool (reviews.json / data/reviews-full.json). Fabricated reviews are a hard block.`,
      });
      continue;
    }
    const onPage = reviewRatingValue(review);
    const realRatings = realAuthors.get(name);
    if (onPage !== undefined && realRatings.size && !realRatings.has(onPage)) {
      warnings.push({
        file: rel,
        detail: `<Review> by "${rawName}" shows ratingValue ${onPage}, but sync data has ${[...realRatings].join('/')} — verify it matches the real review.`,
      });
    }
  }
}

for (const rel of files) {
  const html = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  for (const block of jsonLdBlocks(html)) {
    const acc = { hasAggregate: false, reviews: [] };
    walk(block, acc);

    if (acc.hasAggregate) {
      blockers.push({
        type: 'no-aggregate-on-city',
        file: rel,
        detail: 'AggregateRating on a city page — clone risk. The evidenced GBP rating belongs only on the homepage (ref 816c280). Use individual <Review> markup here instead.',
      });
    }
    auditReviewNodes(rel, acc.reviews);
  }
}

for (const rel of ['pages/about.html', 'index.html']) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const acc = { hasAggregate: false, reviews: [] };
  for (const block of jsonLdBlocks(html)) {
    walk(block, acc);
  }
  if (rel === 'pages/about.html' && acc.hasAggregate) {
    blockers.push({
      type: 'no-aggregate-about',
      file: rel,
      detail: 'About carries a self-serving AggregateRating. Keep review evidence on the canonical homepage only.',
    });
  }
  if (rel === 'index.html' && acc.hasAggregate && acc.reviews.length === 0) {
    blockers.push({
      type: 'homepage-evidence',
      file: rel,
      detail: 'Homepage AggregateRating has no attributed Review nodes from the synchronized review pool.',
    });
  }
  auditReviewNodes(rel, acc.reviews);
}

console.log('\n=== Review & rating integrity ===');
console.log(`audited ${files.length} location pages + homepage/About · real-review pool: ${realAuthors.size} authors`);

if (warnings.length) {
  console.log(`\n⚠ ${warnings.length} warning(s):`);
  for (const w of warnings.slice(0, 25)) console.log(`    ${w.file}: ${w.detail}`);
}

if (blockers.length === 0) {
  console.log('✓ no review/rating integrity issues');
  process.exit(0);
}

const byType = new Map();
for (const b of blockers) {
  if (!byType.has(b.type)) byType.set(b.type, []);
  byType.get(b.type).push(b);
}
console.log(`${strict ? '🚨' : '⚠'} ${blockers.length} blocker(s)${strict ? '' : ' (informational, non-blocking)'}:`);
for (const [type, items] of byType) {
  console.log(`\n  [${type}] ×${items.length}`);
  for (const it of items.slice(0, 25)) console.log(`    ${it.file}: ${it.detail}`);
  if (items.length > 25) console.log(`    …and ${items.length - 25} more`);
}
process.exit(strict ? 1 : 0);
