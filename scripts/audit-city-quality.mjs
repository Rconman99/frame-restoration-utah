#!/usr/bin/env node
// Per-city quality gate — corpus-level companion to audit-route-batch.mjs.
//
// audit-route-batch.mjs checks each page in isolation (schema, leakage, links,
// compliance copy). This script adds the checks that can only be made by looking
// at the whole location corpus at once — the ones that prevent a national-scale
// Google "scaled content abuse" / doorway-page demotion:
//
//   1. differentiation  — body too similar to another city page          (red-copy)
//   2. local-substance  — page is template-with-{city}-swapped, no unique (red-copy)
//   3. depth            — too thin                                        (red-copy)
//   4. concentration    — a jargon term saturates the corpus (>cap)       (yellow / red-copy)
//   5. rating-integrity — AggregateRating with no verifiable review data  (red-block)
//   6. nap-integrity    — NAP conflicts with source-of-truth record       (red-block)
//   7. moat-readiness   — reviews below the ~150 AI-citation threshold    (yellow, off-site)
//
// Fail-closed: anything that cannot be scored is blocked or warned, never
// silently passed. Deterministic only ($0) — pair with an optional local-LLM
// substance check upstream; the LLM verdict may only downgrade, never upgrade.
//
// Usage:
//   node scripts/audit-city-quality.mjs --manifest data/route-factory/<batch>.json
//   node scripts/audit-city-quality.mjs locations/frisco.html locations/plano.html
//
// Config (optional) lives under manifest.cityQuality; defaults below.

import fs from 'node:fs';
import path from 'node:path';

const DEFAULTS = {
  simThreshold: 0.70,        // > this body-overlap vs another city = red-copy
  minUniqueShingleRatio: 0.30, // < this share of content unique to the city = red-copy (template swap)
  minUniqueWords: 500,
  concentrationCap: 50,      // a jargon term appearing > this many times site-wide = saturation
  reviewThreshold: 150,      // ~AI-citation review floor per location (flag only)
  concentrationTerms: [      // jargon prone to saturation; tune per market (UT, not TX)
    'insurance claim', 'insurance claims', 'roof replacement', 'storm damage',
    'hail damage', 'roof repair', 'free inspection', 'deductible'
  ]
};

const args = process.argv.slice(2);
function usage() {
  console.error('Usage: node scripts/audit-city-quality.mjs [--manifest path] [locations/*.html ...]');
  process.exit(2);
}

let manifestPath = null;
const explicitFiles = [];
for (let i = 0; i < args.length; i += 1) {
  if (args[i] === '--manifest') { manifestPath = args[++i]; if (!manifestPath) usage(); }
  else if (args[i] === '--help' || args[i] === '-h') usage();
  else explicitFiles.push(args[i]);
}

let manifest = {};
if (manifestPath) manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
const cfg = { ...DEFAULTS, ...(manifest.cityQuality || {}) };

// ---- target city pages from the batch (route-batch convention) ----
function isCityPage(file) {
  return /(^|\/)locations\/[^/]+\.html$/.test(file);
}
const routeFiles = (manifest.newRoutes || []).map((r) => r.file).filter(Boolean);
const targets = [...new Set([...routeFiles, ...explicitFiles])].filter(isCityPage);
if (targets.length === 0) {
  console.log('PASS (no city/location pages in this batch — nothing for the city gate to check).');
  process.exit(0);
}

// ---- corpus = every live location page UNION the batch targets ----
const corpus = new Set(targets);
if (fs.existsSync('locations')) {
  for (const f of fs.readdirSync('locations')) {
    if (f.endsWith('.html')) corpus.add(path.join('locations', f));
  }
}

const issues = [];   // → FAIL (exit 1)
const warnings = []; // → printed, non-blocking
const verdicts = {}; // file → worst tier
function addIssue(file, tier, msg) {
  issues.push({ file, msg });
  rankVerdict(file, tier);
}
function addWarning(file, msg, tier = 'yellow') {
  warnings.push({ file, msg });
  rankVerdict(file, tier);
}
const ORDER = ['green', 'yellow', 'red-copy', 'red-structural', 'red-block'];
function rankVerdict(file, tier) {
  const cur = verdicts[file] || 'green';
  if (ORDER.indexOf(tier) > ORDER.indexOf(cur)) verdicts[file] = tier;
}

// ---- helpers ----
function visibleText(html) {
  return html
    .replace(/<!--[\s\S]*?-->/g, ' ')
    .replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&[a-z]+;/gi, ' ')
    .replace(/\s+/g, ' ')
    .toLowerCase()
    .trim();
}
function words(text) { return text.match(/[a-z0-9§]+/gi) || []; }
function shingles(text, k = 8) {
  const w = words(text);
  const s = new Set();
  for (let i = 0; i + k <= w.length; i += 1) s.add(w.slice(i, i + k).join(' '));
  return s;
}
function jaccard(a, b) {
  if (!a.size && !b.size) return 0;
  let inter = 0;
  for (const x of a) if (b.has(x)) inter += 1;
  return inter / (a.size + b.size - inter);
}
function extractJsonLd(html) {
  const blocks = [];
  const re = /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m; while ((m = re.exec(html)) !== null) blocks.push(m[1].trim());
  return blocks;
}

// ---- precompute text/shingles for the whole corpus ----
const text = {}, shingleSets = {}, missing = [];
for (const file of corpus) {
  if (!fs.existsSync(file)) { if (targets.includes(file)) missing.push(file); continue; }
  const html = fs.readFileSync(file, 'utf8');
  text[file] = { html, text: visibleText(html) };
  shingleSets[file] = shingles(text[file].text);
}
for (const f of missing) addIssue(f, 'red-structural', 'File does not exist.');

// ---- NAP source-of-truth (optional but recommended) ----
let nap = manifest.cityQuality?.napRecord || null;
if (!nap && fs.existsSync('data/route-factory/nap.json')) {
  try { nap = JSON.parse(fs.readFileSync('data/route-factory/nap.json', 'utf8')); } catch { /* ignore */ }
}

// ---- per-target checks ----
for (const file of targets) {
  if (!text[file]) continue;
  const { html } = text[file];
  const t = text[file].text;
  const mine = shingleSets[file];

  // 1 + 2: differentiation + local-substance (corpus-level)
  let worst = { file: null, sim: 0 };
  const others = [...corpus].filter((f) => f !== file && shingleSets[f]);
  const union = new Set();
  for (const f of others) {
    const sim = jaccard(mine, shingleSets[f]);
    if (sim > worst.sim) worst = { file: f, sim };
    for (const sh of shingleSets[f]) union.add(sh);
  }
  if (others.length === 0) {
    addWarning(file, 'differentiation: no other location pages to compare against yet (corpus of 1) — re-run as the corpus grows.');
  } else {
    if (worst.sim > cfg.simThreshold) {
      addIssue(file, 'red-copy', `differentiation: ${(worst.sim * 100).toFixed(0)}% body overlap with ${worst.file} (cap ${(cfg.simThreshold * 100)}%).`);
    }
    let uniqueCount = 0;
    for (const sh of mine) if (!union.has(sh)) uniqueCount += 1;
    const ratio = mine.size ? uniqueCount / mine.size : 0;
    if (mine.size && ratio < cfg.minUniqueShingleRatio) {
      addIssue(file, 'red-copy', `local-substance: only ${(ratio * 100).toFixed(0)}% of content is unique to this city (floor ${(cfg.minUniqueShingleRatio * 100)}%) — looks like a {city}-swapped template.`);
    }
  }

  // 3: depth
  const uniqWords = new Set(words(t)).size;
  if (uniqWords < cfg.minUniqueWords) {
    addIssue(file, 'red-copy', `depth: ${uniqWords} unique words (floor ${cfg.minUniqueWords}).`);
  }

  // 5: rating integrity (red-block — never ship a rating you can't substantiate)
  const hasRating = /aggregateRating/i.test(html);
  if (hasRating) {
    const route = (manifest.newRoutes || []).find((r) => r.file === file);
    const reviewCount = route?.reviewCount ?? manifest.cityQuality?.reviewCounts?.[file];
    if (reviewCount === undefined) {
      addIssue(file, 'red-block', 'rating-integrity: AggregateRating present but no verifiable review count (set newRoutes[].reviewCount or cityQuality.reviewCounts).');
    } else if (reviewCount <= 0) {
      addIssue(file, 'red-block', 'rating-integrity: AggregateRating present with 0 real reviews.');
    }
  }

  // 6: NAP integrity (red-block on conflict; warn if no record wired)
  if (nap) {
    for (const field of ['name', 'address', 'phone']) {
      const val = nap[field];
      if (val && !html.includes(val)) {
        addIssue(file, 'red-block', `nap-integrity: ${field} does not match source-of-truth ("${val}").`);
      }
    }
  } else {
    addWarning(file, 'nap-integrity: no NAP source-of-truth wired (cityQuality.napRecord or data/route-factory/nap.json) — exact-match skipped.');
  }

  // 7: moat readiness (yellow, off-site)
  const route = (manifest.newRoutes || []).find((r) => r.file === file);
  const reviewCount = route?.reviewCount ?? manifest.cityQuality?.reviewCounts?.[file];
  if (typeof reviewCount === 'number' && reviewCount < cfg.reviewThreshold) {
    addWarning(file, `moat: ${reviewCount} reviews vs ~${cfg.reviewThreshold} AI-citation threshold (off-site — Landon/compliant requests only).`);
  }
}

// 4: concentration (corpus-wide saturation — the 2026-05-24 incident guard)
const corpusText = Object.values(text).map((x) => x.text).join(' ');
for (const term of cfg.concentrationTerms) {
  const re = new RegExp(term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
  const count = (corpusText.match(re) || []).length;
  if (count > cfg.concentrationCap) {
    // localize the worst offender for the tier; corpus-wide saturation is a yellow flag,
    // but a single page carrying a large share is red-copy (keyword stuffing).
    let worstFile = null, worstShare = 0;
    for (const file of targets) {
      if (!text[file]) continue;
      const c = (text[file].text.match(re) || []).length;
      const share = count ? c / count : 0;
      if (share > worstShare) { worstShare = share; worstFile = file; }
    }
    if (worstFile && worstShare >= 0.5) {
      addIssue(worstFile, 'red-copy', `concentration: "${term}" appears ${count}x site-wide (cap ${cfg.concentrationCap}); this page carries ${(worstShare * 100).toFixed(0)}% — keyword stuffing.`);
    } else {
      addWarning(worstFile || targets[0], `concentration: "${term}" appears ${count}x site-wide (cap ${cfg.concentrationCap}) — redistribute via FAQ schema / vary phrasing.`);
    }
  }
}

// ---- report (matches audit-route-batch.mjs conventions) ----
if (warnings.length) {
  console.log('WARNINGS');
  for (const w of warnings) console.log(`- ${w.file}: ${w.msg}`);
}
console.log('VERDICTS');
for (const file of targets) console.log(`- ${file}: ${verdicts[file] || 'green'}`);

if (issues.length) {
  console.error('FAIL');
  for (const it of issues) console.error(`- ${it.file}: ${it.msg}`);
  console.error('Reds block publish. red-block (NAP/rating) requires human clearance — Request input to Landon/Ryan.');
  process.exit(1);
}
console.log('PASS');
console.log(`Checked ${targets.length} city page(s) against a corpus of ${corpus.size}.`);
