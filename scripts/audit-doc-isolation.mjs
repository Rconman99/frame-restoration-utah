#!/usr/bin/env node
/**
 * Internal-documentation isolation gate for Frame Roofing Utah.
 *
 * Mirrored from frame-restoration-texas-v2 (TX PR #208), which graduated the CBP
 * refinement loop's draft proposal #2 (internal-documentation-isolation-protocol,
 * source frame-tx#101) into a real, executable check. Utah has the identical
 * exposure surface (static HTML + handoff/plan docs in the repo) and was covered
 * by `.vercelignore`'s `*.md` rule but UNGATED — this enforces it.
 *
 * Risk it closes: this is a static-HTML site — Vercel serves the repo as files,
 * so any markdown NOT excluded by .vercelignore is publicly fetchable
 * (e.g. framerestorationutah.com/AEO-BUILDOUT-HANDOFF-2026-06-03.md would serve the
 * raw planning doc). Internal handoffs/plans/audits/owner-notes must never ship.
 *
 * Invariant: NO .md file is in the public build tree. Markdown is documentation,
 * never a customer page. If a doc is ever meant to be public, allow it explicitly
 * with a negation in .vercelignore (e.g. `!public-thing.md`) — isDeployed honors it.
 *
 * Check (BLOCK in --strict):
 *   DOC-EXPOSURE — any .md whose path is NOT excluded by .vercelignore (would deploy).
 *
 * Default INFORMATIONAL (exit 0). --strict exits 1 on any blocker — how CI runs it.
 *
 * Usage:
 *   node scripts/audit-doc-isolation.mjs            # report, exit 0
 *   node scripts/audit-doc-isolation.mjs --strict   # report, exit 1 on exposure
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const strict = process.argv.includes('--strict');

const WALK_SKIP = new Set(['node_modules', '.git', '.vercel', '.claude']);

// --- .vercelignore parser + matcher (same logic as audit-cta-integrity.mjs) ---
const ignoreMatchers = loadVercelIgnore();
function loadVercelIgnore() {
  const p = path.join(repoRoot, '.vercelignore');
  if (!fs.existsSync(p)) return [];
  const out = [];
  for (let line of fs.readFileSync(p, 'utf8').split('\n')) {
    line = line.trim();
    if (!line || line.startsWith('#')) continue;
    const neg = line.startsWith('!');
    if (neg) line = line.slice(1);
    const pat = line.replace(/^\//, '');
    const hasSlash = pat.includes('/') && !pat.endsWith('/');
    const isDir = pat.endsWith('/');
    const base = isDir ? pat.slice(0, -1) : pat;
    const reStr = base.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '[^/]*').replace(/\?/g, '.');
    out.push({ re: new RegExp('^' + reStr + (isDir ? '(/|$)' : '$')), hasSlash, isDir, neg });
  }
  return out;
}
function isDeployed(rel) {
  const base = path.basename(rel);
  let ignored = false;
  for (const m of ignoreMatchers) {
    const target = (m.hasSlash || m.isDir) ? rel : base;
    let hit = m.isDir ? m.re.test(rel) : m.re.test(target);
    // Gitignore-style patterns that match a directory also ignore everything
    // below it. This matters for `data/*`: it matches each immediate child
    // directory while later negations can still allow exact top-level feeds.
    if (!hit && m.hasSlash && !m.isDir) {
      const parts = rel.split('/');
      for (let index = 1; index < parts.length; index += 1) {
        if (m.re.test(parts.slice(0, index).join('/'))) {
          hit = true;
          break;
        }
      }
    }
    if (hit) ignored = !m.neg ? true : false;
  }
  return !ignored;
}

// --- collect every .md in the repo (skip never-deployed tooling dirs) ---
function walk(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.git')) continue;
    if (WALK_SKIP.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walk(full, acc);
    else if (ent.name.toLowerCase().endsWith('.md')) acc.push(path.relative(repoRoot, full));
  }
}

function walkFiles(dir, acc) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (ent.name.startsWith('.git')) continue;
    if (WALK_SKIP.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    if (ent.isDirectory()) walkFiles(full, acc);
    else acc.push(path.relative(repoRoot, full));
  }
}

const mdFiles = [];
walk(repoRoot, mdFiles);
mdFiles.sort();

const exposed = mdFiles.filter((rel) => isDeployed(rel));
const weeklyReportRoot = path.join(repoRoot, 'data', 'weekly-reports');
const trackedSensitiveSnapshots = [];
if (fs.existsSync(weeklyReportRoot)) {
  walkFiles(weeklyReportRoot, trackedSensitiveSnapshots);
}
trackedSensitiveSnapshots.sort();
const weeklyReportBoundaryMissing = isDeployed(
  'data/weekly-reports/_deployment-boundary-sentinel.json',
);

const publicDataAllowlist = new Set([
  'data/blog-quality-benchmark.json',
  'data/blog-traction.json',
]);
const dataFiles = [];
const dataRoot = path.join(repoRoot, 'data');
if (fs.existsSync(dataRoot)) walkFiles(dataRoot, dataFiles);
dataFiles.sort();
const deployedDataFiles = dataFiles.filter((rel) => isDeployed(rel));
const unexpectedDeployedData = deployedDataFiles.filter(
  (rel) => !publicDataAllowlist.has(rel),
);
const missingPublicData = [...publicDataAllowlist].filter(
  (rel) => !fs.existsSync(path.join(repoRoot, rel)) || !isDeployed(rel),
);

const allFiles = [];
walkFiles(repoRoot, allFiles);
const publicDataReferences = new Set();
for (const rel of allFiles) {
  if (!isDeployed(rel) || !/\.(?:html|js)$/i.test(rel)) continue;
  const source = fs.readFileSync(path.join(repoRoot, rel), 'utf8');
  for (const match of source.matchAll(/(?:^|["'`(])\/?(data\/[A-Za-z0-9._/-]+\.json)(?=[?"'`)])/g)) {
    publicDataReferences.add(match[1]);
  }
}
const unexpectedPublicDataReferences = [...publicDataReferences]
  .filter((rel) => !publicDataAllowlist.has(rel))
  .sort();
const internalDeploySentinels = [
  '.claude/settings.json',
  '.github/workflows/compliance-gate.yml',
  '.~lock.private.xlsx#',
  'build-intelligence/customer-request-ledger.json',
  'deno.lock',
  'qa/receipts/private.json',
  'screenshots/mobile-audit/diagnostics.json',
  'state.json',
];
const exposedInternalSentinels = internalDeploySentinels.filter(isDeployed);

console.log('\n=== Internal-documentation isolation ===');
console.log(`scanned ${mdFiles.length} markdown files · ${mdFiles.length - exposed.length} correctly excluded from deploy`);

if (
  exposed.length === 0 &&
  trackedSensitiveSnapshots.length === 0 &&
  !weeklyReportBoundaryMissing &&
  unexpectedDeployedData.length === 0 &&
  missingPublicData.length === 0 &&
  unexpectedPublicDataReferences.length === 0 &&
  exposedInternalSentinels.length === 0
) {
  console.log(`✓ no internal docs or customer reporting snapshots in the public build tree; ${deployedDataFiles.length} allowlisted aggregate data feeds`);
  process.exit(0);
}

if (exposed.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} ${exposed.length} markdown file(s) WOULD deploy publicly${strict ? '' : ' (informational)'}:`);
  for (const rel of exposed.slice(0, 50)) {
    console.log(`    ${rel}  →  https://www.framerestorationutah.com/${rel}`);
  }
  if (exposed.length > 50) console.log(`    …and ${exposed.length - 50} more`);
  console.log('  Fix: add a matching rule to .vercelignore (e.g. `*.md`), or `!file.md` to intentionally publish one.');
}

if (weeklyReportBoundaryMissing) {
  console.log(`${strict ? '🚨' : '⚠'} data/weekly-reports/ is not excluded by .vercelignore.`);
}
if (trackedSensitiveSnapshots.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} ${trackedSensitiveSnapshots.length} customer reporting snapshot file(s) remain under data/weekly-reports/.`);
  for (const rel of trackedSensitiveSnapshots.slice(0, 20)) {
    console.log(`    ${rel}`);
  }
  console.log('  Fix: move customer-level reports to access-controlled storage; never commit them to this public repository.');
}
if (unexpectedDeployedData.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} ${unexpectedDeployedData.length} non-allowlisted data file(s) would deploy publicly:`);
  for (const rel of unexpectedDeployedData.slice(0, 50)) console.log(`    ${rel}`);
  console.log('  Fix: keep `data/*` default-denied; add an exception only for an intentionally public aggregate feed.');
}
if (missingPublicData.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} required aggregate dashboard feed(s) are missing or excluded:`);
  for (const rel of missingPublicData) console.log(`    ${rel}`);
}
if (unexpectedPublicDataReferences.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} deployed browser code references non-allowlisted data feed(s):`);
  for (const rel of unexpectedPublicDataReferences) console.log(`    ${rel}`);
}
if (exposedInternalSentinels.length > 0) {
  console.log(`${strict ? '🚨' : '⚠'} internal tooling/deployment path(s) are not excluded:`);
  for (const rel of exposedInternalSentinels) console.log(`    ${rel}`);
}
process.exit(strict ? 1 : 0);
