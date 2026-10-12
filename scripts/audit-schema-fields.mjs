#!/usr/bin/env node
/**
 * Structured-data field check for deployed pages (warning-only for now).
 *
 * Complements scripts/audit-jsonld.mjs (which fails on JSON that does not
 * parse). This walks every HTML page Vercel deploys (respects .vercelignore and
 * the same internal-dir exclusions), and for each JSON-LD node checks:
 *   - LocalBusiness and its subtypes (RoofingContractor, HomeAndConstructionBusiness, …):
 *       required  name, address (PostalAddress with addressLocality + addressRegion)
 *       recommended telephone, url
 *   - Service: required name or serviceType, and provider
 * Bare references ({"@id": …} or {"@type","@id"} with only a name) are skipped:
 * they point at the full business node declared elsewhere.
 *
 * Usage:
 *   node scripts/audit-schema-fields.mjs            # report, exit 0 (non-blocking)
 *   node scripts/audit-schema-fields.mjs --strict   # exit 1 on missing required fields
 *   node scripts/audit-schema-fields.mjs --json out.json
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const strict = process.argv.includes('--strict');
const jsonOut = (() => { const i = process.argv.indexOf('--json'); return i > 0 ? process.argv[i + 1] : null; })();
const IGNORE_DIRS = new Set(['node_modules', '.git', '.github', '.vercel', 'archive', 'build-intelligence', 'dashboard']);
const BLOCK = /<script[^>]*application\/ld\+json[^>]*>([\s\S]*?)<\/script>/gi;
const LOCAL_BUSINESS_TYPES = new Set([
  'LocalBusiness', 'RoofingContractor', 'HomeAndConstructionBusiness', 'GeneralContractor',
  'HousePainter', 'Plumber', 'Electrician', 'HVACBusiness', 'ProfessionalService',
]);

function vercelIgnoreMatchers() {
  const f = path.join(repoRoot, '.vercelignore');
  if (!fs.existsSync(f)) return [];
  return fs.readFileSync(f, 'utf8').split('\n').map((l) => l.trim()).filter((l) => l && !l.startsWith('#') && !l.startsWith('!'))
    .map((pat) => {
      const dir = pat.endsWith('/');
      const p = pat.replace(/^\//, '').replace(/\/$/, '');
      const re = p.replace(/[.+^${}()|[\]\\]/g, '\\$&').replace(/\*\*/g, '\u0000').replace(/\*/g, '[^/]*').replace(/\?/g, '[^/]').replace(/\u0000/g, '.*');
      const anchored = p.includes('/') ? `^${re}` : `(^|/)${re}`;
      return new RegExp(dir ? `${anchored}(/|$)` : `${anchored}($|/)`);
    });
}
const ignored = vercelIgnoreMatchers();

function walk(dir, out = []) {
  for (const e of fs.readdirSync(dir, { withFileTypes: true })) {
    if (IGNORE_DIRS.has(e.name)) continue;
    const p = path.join(dir, e.name);
    const rel = path.relative(repoRoot, p);
    if (ignored.some((re) => re.test(rel))) continue;
    if (e.isDirectory()) walk(p, out);
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}

const types = (n) => [].concat(n?.['@type'] || []);
function* nodes(v, key = null) {
  if (Array.isArray(v)) for (const x of v) yield* nodes(x, key);
  else if (v && typeof v === 'object') {
    yield [v, key];
    for (const [k, x] of Object.entries(v)) if (k !== '@context') yield* nodes(x, k === '@graph' ? null : k);
  }
}
// A business nested as provider/publisher/etc. is usually a pointer to the main
// business entity; a missing address there is a recommendation (add an @id
// reference instead), not a hard error.
const NESTED_KEYS = new Set(['provider', 'publisher', 'author', 'brand', 'seller', 'organizer', 'parentOrganization', 'worksFor', 'about', 'mentions', 'itemReviewed']);
const isReference = (n) => Object.keys(n).every((k) => ['@id', '@type', 'name', 'url', 'sameAs'].includes(k)) && (n['@id'] || !n.address);
const has = (v) => v !== undefined && v !== null && !(typeof v === 'string' && !v.trim()) && !(Array.isArray(v) && !v.length);

export function checkNode(n, parentKey = null) {
  const errors = []; const warnings = []; const t = types(n);
  if (t.some((x) => LOCAL_BUSINESS_TYPES.has(x))) {
    if (isReference(n)) return { kind: null };
    if (!has(n.name)) errors.push('name');
    const a = [].concat(n.address || [])[0];
    if (!has(a)) (NESTED_KEYS.has(parentKey) ? warnings : errors).push(NESTED_KEYS.has(parentKey) ? `address (nested ${parentKey}; prefer an @id reference)` : 'address');
    else if (typeof a === 'object' && !a['@id']) {
      if (!has(a.addressLocality)) errors.push('address.addressLocality');
      if (!has(a.addressRegion)) errors.push('address.addressRegion');
    }
    if (!has(n.telephone)) warnings.push('telephone');
    if (!has(n.url)) warnings.push('url');
    return { kind: 'LocalBusiness', errors, warnings };
  }
  if (t.includes('Service')) {
    if (!has(n.name) && !has(n.serviceType)) errors.push('name|serviceType');
    // A Service offered inside the business's own OfferCatalog (itemOffered) is
    // implicitly provided by that business; elsewhere provider is required.
    if (!has(n.provider)) (parentKey === 'itemOffered' ? warnings : errors).push(parentKey === 'itemOffered' ? 'provider (inside OfferCatalog)' : 'provider');
    if (!has(n.areaServed)) warnings.push('areaServed');
    return { kind: 'Service', errors, warnings };
  }
  return { kind: null };
}

function main() {
  const files = walk(repoRoot);
  const counts = { LocalBusiness: 0, Service: 0 }; const problems = []; let softWarnings = 0; const softFiles = new Set();
  for (const f of files) {
    const html = fs.readFileSync(path.join(repoRoot, f), 'utf8');
    for (const m of html.matchAll(BLOCK)) {
      let data; try { data = JSON.parse(m[1]); } catch { continue; } // parse errors are audit-jsonld.mjs's job
      for (const [n, key] of nodes(data)) {
        const r = checkNode(n, key);
        if (!r.kind) continue;
        counts[r.kind] += 1; softWarnings += r.warnings.length; if (r.warnings.length) softFiles.add(f);
        if (r.errors.length) problems.push({ file: f, type: r.kind, missing: r.errors });
      }
    }
  }
  console.log('=== Structured-data required fields ===');
  console.log(`scanned ${files.length} deployed HTML pages: ${counts.LocalBusiness} LocalBusiness nodes, ${counts.Service} Service nodes`);
  for (const p of problems.slice(0, 200)) {
    const msg = `${p.file}: ${p.type} missing ${p.missing.join(', ')}`;
    console.log(process.env.GITHUB_ACTIONS ? `::warning file=${p.file},title=Schema fields::${msg}` : `  ⚠ ${msg}`);
  }
  if (problems.length > 200) console.log(`  … and ${problems.length - 200} more`);
  console.log(`nodes missing required fields: ${problems.length}; recommended-field gaps: ${softWarnings} across ${softFiles.size} pages`);
  console.log(problems.length ? (strict ? '🚨 missing required schema fields' : '⚠ warnings only (non-blocking)') : '✓ all LocalBusiness/Service nodes have required fields');
  if (jsonOut) fs.writeFileSync(jsonOut, JSON.stringify({ counts, problems }, null, 2));
  if (process.env.GITHUB_STEP_SUMMARY) {
    fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, `### Structured data\n${counts.LocalBusiness} LocalBusiness, ${counts.Service} Service nodes; ${problems.length} missing required fields.\n\n${problems.slice(0, 30).map((p) => `- \`${p.file}\`: ${p.type} missing ${p.missing.join(', ')}`).join('\n')}\n`);
  }
  process.exit(strict && problems.length ? 1 : 0);
}

if (import.meta.url === `file://${process.argv[1]}`) main();
