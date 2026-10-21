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
 * Also fails on HTML character references (`&amp;`, `&mdash;`, `&#8217;`, …)
 * inside JSON-LD string values. `<script>` content is raw text, so the browser
 * and Google never decode them: "Gutters &amp; Guards" reaches the structured
 * data as those literal characters. Write the real character instead.
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
// Named (2+ letters, so "Q&A;" or "R&D;" can't match), decimal and hex references.
const HTML_ENTITY = /&(?:#\d+|#x[0-9a-f]+|[a-z]{2,}[0-9]*);/i;
// Two Sandy breadcrumb names still carry "&mdash;". Those pages are byte-pinned by
// data/rank-tracker/SANDY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json, so the fix belongs
// to the lane that regenerates that diagnosis. The hold-out expires on its own: once
// a listed page is clean, this gate fails until the entry is removed.
const ENTITY_HOLDOUTS = new Set([
  'blog/sandy/roof-leak-repair-sandy-84070.html',
  'blog/sandy/spring-hail-damage-roof.html',
]);

function findEntityStrings(node, out = []) {
  if (typeof node === 'string') {
    const hit = node.match(HTML_ENTITY);
    if (hit) out.push({ entity: hit[0], text: node });
  } else if (node && typeof node === 'object') {
    for (const value of Object.values(node)) findEntityStrings(value, out);
  }
  return out;
}

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
let entities = 0;
const heldOut = new Set();
for (const f of files) {
  const html = fs.readFileSync(f, 'utf8');
  const rel = path.relative(repoRoot, f);
  let m;
  while ((m = BLOCK.exec(html)) !== null) {
    total += 1;
    let data;
    try {
      data = JSON.parse(m[1]);
    } catch (e) {
      invalid += 1;
      console.log(`  ✗ ${rel}: ${String(e.message).slice(0, 90)}`);
      continue;
    }
    for (const hit of findEntityStrings(data)) {
      if (ENTITY_HOLDOUTS.has(rel)) {
        heldOut.add(rel);
        console.log(`  ⏸ ${rel}: HTML entity ${hit.entity} held out (pinned page, see ENTITY_HOLDOUTS)`);
        continue;
      }
      entities += 1;
      console.log(`  ✗ ${rel}: HTML entity ${hit.entity} in JSON-LD string "${hit.text.slice(0, 70)}"`);
    }
  }
}

let staleHoldouts = 0;
for (const rel of ENTITY_HOLDOUTS) {
  if (heldOut.has(rel)) continue;
  staleHoldouts += 1;
  console.log(`  ✗ ${rel}: no HTML entity left in its JSON-LD — remove it from ENTITY_HOLDOUTS`);
}

console.log('\n=== JSON-LD validity ===');
console.log(`scanned ${files.length} HTML files, ${total} JSON-LD blocks, invalid: ${invalid}, entity strings: ${entities}, held out: ${heldOut.size}`);
if (invalid) console.log('🚨 invalid JSON-LD — fix before merge');
if (entities) console.log('🚨 HTML entities inside JSON-LD strings — write the literal character instead');
if (staleHoldouts) console.log('🚨 stale ENTITY_HOLDOUTS entry — the pinned page is clean now');
if (!invalid && !entities && !staleHoldouts) console.log('✓ all JSON-LD valid');
process.exit(invalid || entities || staleHoldouts ? 1 : 0);
