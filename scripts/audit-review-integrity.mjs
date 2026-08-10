#!/usr/bin/env node
/**
 * Review & rating integrity gate for Frame Roofing Utah.
 *
 * Codifies the compliance line carried forward from commit 816c280 and Google's
 * review-snippet policy. Frame may show its current, attributed Google rating and
 * reviews visibly, but must not mark them up as a self-serving AggregateRating.
 *
 * Frame is a SINGLE-location business → ONE real Google Business Profile → ONE
 * real aggregate rating. The visible count/rating must match reviews.json on
 * every page. Individual Review nodes must still map to the synchronized pool.
 *
 * Checks (BLOCK in --strict):
 *   1. NO-SELF-SERVING-AGGREGATE — any aggregateRating in public HTML.
 *   2. VISIBLE-COUNT-PARITY — visible Google review counts match reviews.json.
 *   3. REAL-REVIEWERS-ONLY — any <Review> node whose author is NOT in the real
 *                             sync pool (reviews.json + data/reviews-full.json).
 *                             Catches fabricated/invented reviews.
 *   4. RATING-MATCHES-DATA — a matched reviewer's on-page reviewRating that
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
const IGNORE_DIRS = new Set(['.git', '.github', '.vercel', 'archive', 'dashboard', 'docs', 'node_modules', 'qa', 'screenshots', 'vendor']);
const VISIBLE_REVIEW_COUNT_PATTERNS = [
  /\d(?:\.\d)? from (\d+) Google reviews/gi,
  /(\d+) (?:five-star|Google) reviews and counting/gi,
  /See All (\d+) Google Reviews/gi,
  /<div class="lbl">(\d+) Google Reviews<\/div>/gi,
];
const VISIBLE_REVIEW_RATING_PATTERNS = [
  /([1-5](?:\.\d)?) from \d+ Google reviews/gi,
  /★★★★★ ([1-5](?:\.\d)?)\s*&nbsp;See All \d+ Google Reviews/gi,
  /<div class="(?:num|big)">([1-5](?:\.\d)?)&#9733;<\/div>/gi,
  /([1-5](?:\.\d)?)-star rated/gi,
];

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

function publicHtmlFiles(dir = repoRoot, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory() && IGNORE_DIRS.has(entry.name)) continue;
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) publicHtmlFiles(full, out);
    else if (entry.name.endsWith('.html')) out.push(path.relative(repoRoot, full));
  }
  return out;
}

function loadAggregate() {
  try {
    const data = JSON.parse(fs.readFileSync(path.join(repoRoot, 'reviews.json'), 'utf8'));
    return {
      count: Number(data?.aggregate?.review_count),
      rating: Number(data?.aggregate?.rating),
    };
  } catch {
    return { count: NaN, rating: NaN };
  }
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
        detail: 'AggregateRating on a city page — self-serving clone risk. Keep the evidenced GBP rating visible and attributed instead.',
      });
    }
    auditReviewNodes(rel, acc.reviews);
  }
}

const publicFiles = publicHtmlFiles().sort();
for (const rel of publicFiles.filter((file) => !file.startsWith('locations/'))) {
  const full = path.join(repoRoot, rel);
  if (!fs.existsSync(full)) continue;
  const html = fs.readFileSync(full, 'utf8');
  const acc = { hasAggregate: false, reviews: [] };
  for (const block of jsonLdBlocks(html)) {
    walk(block, acc);
  }
  if (acc.hasAggregate) {
    blockers.push({
      type: 'no-self-serving-aggregate',
      file: rel,
      detail: 'Public HTML carries a self-serving AggregateRating. Keep the synchronized GBP rating visible and attributed instead.',
    });
  }
  auditReviewNodes(rel, acc.reviews);
}

const aggregate = loadAggregate();
if (!Number.isFinite(aggregate.count) || !Number.isFinite(aggregate.rating)) {
  blockers.push({
    type: 'review-source',
    file: 'reviews.json',
    detail: 'Missing numeric aggregate.review_count or aggregate.rating.',
  });
} else {
  for (const rel of publicFiles) {
    const html = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
    for (const pattern of VISIBLE_REVIEW_COUNT_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const found = Number(match[1]);
        if (found !== aggregate.count) {
          blockers.push({
            type: 'visible-count-parity',
            file: rel,
            detail: `Visible Google review count ${found} must match reviews.json aggregate ${aggregate.count}.`,
          });
        }
      }
    }
    for (const pattern of VISIBLE_REVIEW_RATING_PATTERNS) {
      pattern.lastIndex = 0;
      let match;
      while ((match = pattern.exec(html)) !== null) {
        const found = Number(match[1]);
        if (found !== aggregate.rating) {
          blockers.push({
            type: 'visible-rating-parity',
            file: rel,
            detail: `Visible Google rating ${found} must match reviews.json aggregate ${aggregate.rating}.`,
          });
        }
      }
    }
  }
}

console.log('\n=== Review & rating integrity ===');
console.log(`audited ${publicFiles.length} public HTML files · real-review pool: ${realAuthors.size} authors`);

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
