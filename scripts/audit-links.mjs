#!/usr/bin/env node
/**
 * Internal-link integrity report for Frame Restoration TX.
 *
 * Scans every .html file for local hrefs that don't resolve to a file,
 * directory, `<path>.html`, `<path>/index.html`, or a non-host-conditional
 * Vercel redirect/rewrite. External schemes (http/https/tel/mailto/sms/data/
 * javascript), in-page anchors (#...), and protocol-relative (//...) links are
 * skipped.
 *
 * Default mode is INFORMATIONAL: it prints a report and exits 0, so it can run
 * as a non-blocking CI signal without failing builds on the existing
 * content-gap links (e.g. planned-but-unbuilt city blog posts).
 *
 * Pass `--strict` to exit 1 when any broken link is found.
 *
 * Usage:
 *   node scripts/audit-links.mjs            # report, exit 0
 *   node scripts/audit-links.mjs --strict   # report, exit 1 if broken links
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const strict = process.argv.includes('--strict');
const SKIP = /^(https?:|tel:|mailto:|sms:|data:|javascript:|#|\/\/)/i;
const IGNORE_DIRS = new Set(['node_modules', '.git', '.github', '.vercel']);

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
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
console.log('\n=== internal link integrity ===');
console.log(`scanned ${files.length} HTML files`);
if (entries.length === 0) {
  console.log('✓ no broken internal links');
  process.exit(0);
}
console.log(`${strict ? '🚨' : '⚠'} ${entries.length} distinct unresolved local links${strict ? '' : ' (informational, non-blocking)'}:`);
for (const [href, refs] of entries) {
  console.log(`  ${String(refs.size).padStart(3)}× ${href}`);
}
process.exit(strict && entries.length ? 1 : 0);
