#!/usr/bin/env node
/**
 * JSON-LD validity gate for Frame Restoration TX.
 *
 * Parses every `<script type="application/ld+json">` block across all HTML and
 * fails (exit 1) if any block does not parse. Broken JSON-LD silently disables
 * rich-result / AI-citation eligibility, and it's easy to break during content
 * edits (e.g. removing a FAQPage Q&A can leave a trailing comma). This is the
 * structured-data safety net for the AEO strategy.
 *
 * Usage:
 *   node scripts/audit-jsonld.mjs           # exit 1 if any block is invalid
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
// archive/, build-intelligence/, dashboard/ hold internal eval/report HTML (not
// user-facing site pages) whose <script> samples contain escaped-JSON code
// examples that aren't real structured data — exclude them from the gate.
const IGNORE_DIRS = new Set(['node_modules', '.git', '.github', '.vercel', 'archive', 'build-intelligence', 'dashboard']);
const BLOCK = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;

function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(p, out);
    else if (entry.name.endsWith('.html')) out.push(p);
  }
  return out;
}

const files = walkHtml(repoRoot);
let total = 0;
let invalid = 0;
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  let m;
  while ((m = BLOCK.exec(html)) !== null) {
    total += 1;
    try {
      JSON.parse(m[1]);
    } catch (e) {
      invalid += 1;
      console.log(`  ✗ ${path.relative(repoRoot, f)}: ${String(e.message).slice(0, 90)}`);
    }
  }
}

console.log('\n=== JSON-LD validity ===');
console.log(`scanned ${files.length} HTML files, ${total} JSON-LD blocks, invalid: ${invalid}`);
console.log(invalid === 0 ? '✓ all JSON-LD valid' : '🚨 invalid JSON-LD — fix before merge');
process.exit(invalid ? 1 : 0);
