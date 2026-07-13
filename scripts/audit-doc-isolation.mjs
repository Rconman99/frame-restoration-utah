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
    const hit = m.isDir ? m.re.test(rel) : m.re.test(target);
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

const mdFiles = [];
walk(repoRoot, mdFiles);
mdFiles.sort();

const exposed = mdFiles.filter((rel) => isDeployed(rel));

console.log('\n=== Internal-documentation isolation ===');
console.log(`scanned ${mdFiles.length} markdown files · ${mdFiles.length - exposed.length} correctly excluded from deploy`);

if (exposed.length === 0) {
  console.log('✓ no internal docs in the public build tree');
  process.exit(0);
}

console.log(`${strict ? '🚨' : '⚠'} ${exposed.length} markdown file(s) WOULD deploy publicly${strict ? '' : ' (informational)'}:`);
for (const rel of exposed.slice(0, 50)) {
  console.log(`    ${rel}  →  https://www.framerestorationutah.com/${rel}`);
}
if (exposed.length > 50) console.log(`    …and ${exposed.length - 50} more`);
console.log('  Fix: add a matching rule to .vercelignore (e.g. `*.md`), or `!file.md` to intentionally publish one.');
process.exit(strict ? 1 : 0);
