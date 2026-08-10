#!/usr/bin/env node
/**
 * Entity-consistency gate for Frame Roofing Utah (AEO Pillar 2).
 *
 * AI engines only resolve a citation to ONE business when its identity links
 * agree across every page (and the third-party directories). This asserts that
 * every locations/*.html primary RoofingContractor node carries hasMap + sameAs
 * EXACTLY matching the keystone in data/route-factory/business.json -> entity_links.
 * Drift (a page missing them, a stray/altered URL, a missing profile) = block.
 *
 * Checks (BLOCK in --strict):
 *   1. PRESENT      — primary RoofingContractor node has hasMap + sameAs.
 *   2. HASMAP-MATCH — hasMap === keystone.hasMap.
 *   3. SAMEAS-MATCH — sameAs set === keystone.sameAs set (no missing, no extras).
 *
 * Default INFORMATIONAL (exit 0). --strict exits 1 on blockers — how CI runs it.
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const strict = process.argv.includes('--strict');
const { entity_links: keystone } = JSON.parse(fs.readFileSync(path.join(repo, 'data/route-factory/business.json'), 'utf8'));
const wantMap = keystone?.hasMap;
const wantSame = new Set(keystone?.sameAs || []);
// A page whose NAP is a real second office carries THAT office's GBP map identity
// (entity_links.location_overrides["<file>"].hasMap); anything unlisted keeps the keystone.
const mapOverrides = keystone?.location_overrides || {};

function jsonLdBlocks(html) {
  const out = [];
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(html))) { try { out.push(JSON.parse(m[1])); } catch { /* jsonld-validity owns parse errors */ } }
  return out;
}
// find the primary RoofingContractor node (the LocalBusiness — has address/telephone)
function findPrimary(node) {
  if (Array.isArray(node)) { for (const n of node) { const r = findPrimary(n); if (r) return r; } return null; }
  if (!node || typeof node !== 'object') return null;
  const t = node['@type'];
  const ts = Array.isArray(t) ? t : [t];
  if (ts.includes('RoofingContractor') && (node.telephone || node.address)) return node;
  for (const v of Object.values(node)) { if (v && typeof v === 'object') { const r = findPrimary(v); if (r) return r; } }
  return null;
}

const files = fs.readdirSync(path.join(repo, 'locations')).filter((f) => f.endsWith('.html')).sort();
const blockers = [];

for (const f of files) {
  const html = fs.readFileSync(path.join(repo, 'locations', f), 'utf8');
  let node = null;
  for (const b of jsonLdBlocks(html)) { node = findPrimary(b); if (node) break; }
  if (!node) { blockers.push({ file: f, detail: 'no primary RoofingContractor node found' }); continue; }

  const wantMapFor = mapOverrides[f]?.hasMap || wantMap;
  if (!node.hasMap) blockers.push({ file: f, detail: 'missing hasMap' });
  else if (node.hasMap !== wantMapFor) blockers.push({ file: f, detail: `hasMap "${node.hasMap}" != expected "${wantMapFor}"` });

  const same = Array.isArray(node.sameAs) ? node.sameAs : (node.sameAs ? [node.sameAs] : null);
  if (!same) { blockers.push({ file: f, detail: 'missing sameAs' }); continue; }
  const have = new Set(same);
  const missing = [...wantSame].filter((u) => !have.has(u));
  const extra = [...have].filter((u) => !wantSame.has(u));
  if (missing.length) blockers.push({ file: f, detail: `sameAs missing: ${missing.join(', ')}` });
  if (extra.length) blockers.push({ file: f, detail: `sameAs has non-canonical entries: ${extra.join(', ')}` });
}

console.log('\n=== Entity consistency (hasMap + sameAs) ===');
console.log(`audited ${files.length} location pages · keystone: ${wantSame.size} sameAs + hasMap`);
if (blockers.length === 0) { console.log('✓ all pages match the business.json keystone'); process.exit(0); }
console.log(`${strict ? '🚨' : '⚠'} ${blockers.length} blocker(s)${strict ? '' : ' (informational)'}:`);
for (const b of blockers.slice(0, 50)) console.log(`    ${b.file}: ${b.detail}`);
if (blockers.length > 50) console.log(`    …and ${blockers.length - 50} more`);
process.exit(strict ? 1 : 0);
