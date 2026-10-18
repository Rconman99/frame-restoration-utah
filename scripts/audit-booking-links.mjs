#!/usr/bin/env node
/**
 * Booking-link guard for Frame Roofing Utah.
 *
 * WHY THIS EXISTS
 * Every "Free Inspection" / "Book Online" / "schedule online" CTA used to carry a
 * Google Calendar appointment link as its href. That link went dead (Google now
 * answers 404 "Dynamic Link Not Found") while 411 copies of it sat on 162 live
 * pages. Nobody noticed because global-modal.js intercepts the click and opens
 * the on-site lead modal: the href only mattered as the no-JS / open-in-new-tab
 * / copy-the-link fallback, and that fallback is exactly what was broken.
 *
 * The fix (2026-10-17): the fallback href is the homepage lead form (/#contact,
 * form#leadForm -> Supabase handle-lead) and the modal keys off the
 * data-booking-trigger attribute instead of the calendar host. This gate makes
 * the dead link unable to come back through ANY route: hand edits, the blog
 * generator (scripts/generate-blog-post.py), the nav rewriter (fix-locations.py),
 * JS selectors (global-modal.js) or Playwright tests (scripts/test-mobile-ui.mjs).
 *
 * WHAT IT CHECKS
 * Every git-tracked file (so untracked scratch files cannot trip it) is scanned
 * for either forbidden token. Any hit outside the excluded paths fails the run
 * (exit 1). There is no informational mode: a dead customer-facing link is never
 * a ratchet.
 *
 * EXCLUDED (records, not surfaces):
 *   archive/       frozen historical pages, vercelignored, intentionally untouched
 *   docs/history/  retired CLAUDE.md history (PR #323): a log of what was said
 *   screenshots/   captured mobile-audit DOM snapshots, vercelignored and already
 *                  listed as an internal deploy sentinel in audit-doc-isolation.mjs.
 *                  They record what the page looked like when it was audited;
 *                  rewriting the href inside them would falsify that record, and
 *                  nothing under screenshots/ is served or used to generate pages.
 *   this script    it has to name the tokens it forbids
 *
 * Usage:
 *   node scripts/audit-booking-links.mjs    # exit 1 on any hit
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const SELF = 'scripts/audit-booking-links.mjs';
const EXCLUDED_PREFIXES = ['archive/', 'docs/history/', 'screenshots/'];
const FORBIDDEN = ['calendar.app.google', 'cR4bBSWfb9TQ28UF8'];
const EXPECTED = 'href="/#contact" data-booking-trigger';

function trackedFiles() {
  return execFileSync('git', ['ls-files', '-z'], { cwd: repoRoot, encoding: 'utf8' })
    .split('\0')
    .filter(Boolean);
}

function isExcluded(rel) {
  return rel === SELF || EXCLUDED_PREFIXES.some((prefix) => rel.startsWith(prefix));
}

// Search the raw bytes first (cheap, and safe on images/binaries); only decode
// to text for the files that actually contain a token.
function findHits(rel) {
  const buf = fs.readFileSync(path.join(repoRoot, rel));
  const tokens = FORBIDDEN.filter((token) => buf.indexOf(token) !== -1);
  if (!tokens.length) return null;
  const lines = buf.toString('utf8').split('\n');
  const matching = [];
  lines.forEach((line, i) => {
    if (tokens.some((token) => line.includes(token))) matching.push(i + 1);
  });
  return { rel, tokens, lines: matching };
}

let scanned = 0;
const hits = [];
for (const rel of trackedFiles()) {
  if (isExcluded(rel)) continue;
  const abs = path.join(repoRoot, rel);
  if (!fs.existsSync(abs) || !fs.statSync(abs).isFile()) continue;
  scanned += 1;
  const hit = findHits(rel);
  if (hit) hits.push(hit);
}

console.log('\n=== Booking-link guard ===');
console.log(`scanned ${scanned} tracked files (excluded: ${EXCLUDED_PREFIXES.join(', ')})`);

if (!hits.length) {
  console.log('PASS: no tracked file outside the exclusions references the dead booking link');
  process.exit(0);
}

const occurrences = hits.reduce((sum, hit) => sum + hit.lines.length, 0);
console.error(`FAIL: dead booking link referenced in ${hits.length} file(s), ${occurrences} line(s)`);
for (const hit of hits) {
  const where = hit.lines.slice(0, 3).join(',') + (hit.lines.length > 3 ? ',…' : '');
  console.error(`  - ${hit.rel}:${where}  (${hit.lines.length} line(s); ${hit.tokens.join(' + ')})`);
}
console.error(`\nBooking CTAs must use ${EXPECTED} — global-modal.js opens the lead modal from data-booking-trigger.`);
process.exit(1);
