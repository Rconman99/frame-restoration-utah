#!/usr/bin/env node
/**
 * Internal-link integrity report for Frame Restoration Utah (static half of
 * the broken-link loop; the live half is scripts/check-broken-links.mjs).
 *
 * Scans every .html file for local hrefs that don't resolve to a file,
 * directory, `<path>.html`, `<path>/index.html`, or a non-host-conditional
 * Vercel redirect/rewrite. External schemes (http/https/tel/mailto/sms/data/
 * javascript), in-page anchors (#...), and protocol-relative (//...) links are
 * skipped. Nothing is fetched: this script never touches the network.
 *
 * Default mode is INFORMATIONAL: it prints a report and exits 0, so it can run
 * as a non-blocking CI signal without failing builds on the existing
 * content-gap links (e.g. planned-but-unbuilt city blog posts).
 *
 * Pass `--strict` to exit 1 when any broken link is found.
 *
 * The repo root is derived from this file's location, NOT from the working
 * directory. A launchd job starts with cwd `/` unless the plist sets
 * WorkingDirectory; the old cwd-based root made the walker start at `/`, hit
 * EPERM on protected macOS folders, and crash before scanning a single page.
 * `--root <dir>` (or FRAME_UTAH_REPO) overrides it when auditing a worktree.
 *
 * Usage:
 *   node scripts/audit-links.mjs            # report, exit 0
 *   node scripts/audit-links.mjs --strict   # report, exit 1 if broken links
 *   node scripts/audit-links.mjs --json     # machine-readable report on stdout
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const argv = process.argv.slice(2);
const strict = argv.includes('--strict');
const asJson = argv.includes('--json');
const rootFlag = argv.indexOf('--root');
const repoRoot = path.resolve(
  rootFlag !== -1 && argv[rootFlag + 1]
    ? argv[rootFlag + 1]
    : process.env.FRAME_UTAH_REPO || path.join(path.dirname(fileURLToPath(import.meta.url)), '..'),
);
if (!fs.existsSync(path.join(repoRoot, 'index.html'))) {
  console.error(`audit-links: ${repoRoot} does not look like the site root (no index.html)`);
  process.exit(2);
}
const SKIP = /^(https?:|tel:|mailto:|sms:|data:|javascript:|#|\/\/)/i;
// Only audit LIVE, served pages. archive/, build-intelligence/, dashboard/,
// data/, images/ hold internal drafts/reports (not served); the SKIP_FILES are
// stray root drafts (index-redesign.html etc.) that aren't in the sitemap or nav.
const IGNORE_DIRS = new Set(['node_modules', '.git', '.github', '.vercel', 'archive', 'build-intelligence', 'dashboard', 'data', 'images']);
const SKIP_FILES = new Set(['index-redesign.html', 'leads.html', 'directory-blitz-tool.html', 'directory-tracker.html']);

const unreadable = [];
function walkHtml(dir, out = []) {
  let entries;
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true });
  } catch (error) {
    // An unreadable folder (EPERM/EACCES on macOS, a dangling symlink) is a
    // warning, not a crash: the rest of the site still gets audited.
    unreadable.push(`${path.relative(repoRoot, dir) || '.'}: ${error.code || error.message}`);
    return out;
  }
  for (const entry of entries) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, out);
    else if (entry.name.endsWith('.html') && !SKIP_FILES.has(entry.name)) out.push(p);
  }
  return out;
}

function resolvesLocal(href) {
  const target = href.split('#')[0].split('?')[0].replace(/^\/+/, '').replace(/\/+$/, '');
  if (!target) return true; // root / bare anchor
  const candidates = [target, `${target}.html`, path.join(target, 'index.html')];
  if (candidates.some((c) => fs.existsSync(path.join(repoRoot, c)))) return true;
  return resolvesViaVercel(target);
}

function resolvesViaVercel(target) {
  const vercelPath = path.join(repoRoot, 'vercel.json');
  if (!fs.existsSync(vercelPath)) return false;

  try {
    const vercel = JSON.parse(fs.readFileSync(vercelPath, 'utf8'));
    const routes = [...(vercel.redirects || []), ...(vercel.rewrites || [])];
    const normalizedTarget = `/${target}`;
    return routes.some((entry) => {
      if (entry.has?.length) return false;
      return vercelSourceMatches(entry.source, normalizedTarget)
        || vercelSourceMatches(entry.source, `${normalizedTarget}/`);
    });
  } catch (error) {
    console.warn(`WARN: could not parse vercel.json: ${error.message}`);
    return false;
  }
}

function vercelSourceMatches(source, target) {
  if (source === target) return true;
  const sourceParts = source.replace(/\/+$/, '').split('/').filter(Boolean);
  const targetParts = target.replace(/\/+$/, '').split('/').filter(Boolean);

  for (let i = 0; i < sourceParts.length; i += 1) {
    const sourcePart = sourceParts[i];
    const targetPart = targetParts[i];

    if (sourcePart.startsWith(':') && (sourcePart.endsWith('*') || sourcePart.includes('(.*)'))) {
      return true;
    }
    if (targetPart === undefined) return false;
    if (sourcePart.startsWith(':')) continue;
    if (sourcePart !== targetPart) return false;
  }

  return sourceParts.length === targetParts.length;
}

const broken = new Map(); // href -> Set(files)
const files = walkHtml(repoRoot);
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  for (const m of html.matchAll(/href=["']([^"']+)["']/g)) {
    const href = m[1];
    if (SKIP.test(href)) continue;
    if (!resolvesLocal(href)) {
      if (!broken.has(href)) broken.set(href, new Set());
      broken.get(href).add(path.relative(repoRoot, f));
    }
  }
}

const entries = [...broken.entries()].sort((a, b) => b[1].size - a[1].size);
if (files.length === 0) {
  // Zero files scanned is a failed audit, not a clean one.
  console.error(`audit-links: no HTML files found under ${repoRoot}`);
  process.exit(2);
}
if (asJson) {
  console.log(JSON.stringify({
    root: repoRoot,
    scanned: files.length,
    broken: entries.map(([href, refs]) => ({ href, sources: [...refs].sort() })),
    unreadable,
  }, null, 2));
  process.exit(strict && entries.length ? 1 : 0);
}
console.log('\n=== internal link integrity ===');
console.log(`root ${repoRoot}`);
console.log(`scanned ${files.length} HTML files`);
for (const u of unreadable) console.log(`  WARN unreadable: ${u}`);
if (entries.length === 0) {
  console.log('✓ no broken internal links');
  process.exit(0);
}
console.log(`${strict ? '🚨' : '⚠'} ${entries.length} distinct unresolved local links${strict ? '' : ' (informational, non-blocking)'}:`);
for (const [href, refs] of entries) {
  console.log(`  ${String(refs.size).padStart(3)}× ${href}`);
}
process.exit(strict && entries.length ? 1 : 0);
