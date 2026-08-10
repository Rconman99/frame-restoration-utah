#!/usr/bin/env node
/**
 * CTA & external-link integrity gate for Frame Roofing Utah.
 *
 * Catches the class of bug that let a broken "Leave a Review" button ship to
 * prod (review CTA pointed at a dead Google listing) + the internal-phone leak
 * (LANDON_PHONE published on city pages) + unfilled placeholder links.
 *
 * Source of truth: data/route-factory/business.json. Change identity THERE.
 *
 * Checks (all BLOCK in --strict):
 *   1. INTERNAL-PHONE LEAK   — any internal_phones_never_publish number in any
 *                              published HTML, in any format (tel:/dashes/dots/
 *                              parens/+1). Caught the 435-302-4422 leak.
 *   2. WRONG GOOGLE LISTING  — any Google review/listing href whose cid or
 *                              data_id != the canonical GBP. Caught cid=16833…,
 *                              including the explicit known_wrong_listing_cids.
 *   3. PLACEHOLDER LINKS     — unfilled tokens in hrefs (YOUR-…, REPLACE,
 *                              PLACEHOLDER, example.com, cid=0, /r/XXXX, ${…},
 *                              {{…}}, TODO). Caught g.page/r/YOUR-REVIEW-LINK.
 *   4. GENERIC SEARCH REVIEW — review/CTA links using google maps/search?q=…
 *                              instead of a specific listing (ambiguous funnel).
 *
 * Default mode is INFORMATIONAL (report, exit 0). Pass --strict to exit 1 on
 * any blocker — that's how CI runs it.
 *
 * Usage:
 *   node scripts/audit-cta-integrity.mjs            # report, exit 0
 *   node scripts/audit-cta-integrity.mjs --strict   # report, exit 1 on blockers
 */

import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const strict = process.argv.includes('--strict');

// "Published" = exactly what Vercel deploys. We derive scope from .vercelignore
// (not a hardcoded skip-list) so the gate audits the real public surface and
// can't drift: internal docs that are vercelignored (cheat sheets, playbooks,
// Landon-Action-Items, google-maps-pins) are correctly out of scope, while
// anything actually deployed is in scope.
const WALK_SKIP = new Set(['node_modules', '.git', '.vercel']); // speed only
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

// gitignore-ish: dir/path patterns match the relative path; bare patterns match
// the basename. Later negations (!pat) can re-include.
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

// Customer-facing = hand-authored static pages a visitor actually lands on.
// These are deployed AND (in the sitemap OR a core customer route). Operational
// /owner tools (PIN-gated trackers, internal playbooks, JS-templated tools) are
// deployed but NOT customer-facing — their client-side ${...} templates and
// Landon's working notes must not trip a customer-CTA gate. Internal docs that
// shouldn't be public at all are a separate .vercelignore hygiene task.
const CUSTOMER_DIRS = ['locations/', 'blog/', 'pages/', 'projects/', 'services/'];
const CUSTOMER_FILES = new Set(['index.html', 'review.html', 'about.html']);
// Public operational/vendor files can be copied into third-party workflows, so
// they must obey the same public NAP rules as customer-facing pages.
const PUBLIC_VENDOR_FILES = new Set(['directory-blitz-tool.html']);
const sitemapRoutes = loadSitemapRoutes();

function loadSitemapRoutes() {
  const p = path.join(repoRoot, 'sitemap.xml');
  const set = new Set();
  if (!fs.existsSync(p)) return set;
  for (const m of fs.readFileSync(p, 'utf8').matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) {
    let route = m[1].replace(/^https?:\/\/[^/]+/, '').replace(/\/+$/, '');
    set.add(route === '' ? '/' : route);
  }
  return set;
}

function routeOf(rel) {
  if (rel === 'index.html') return '/';
  return '/' + rel.replace(/\.html$/, '').replace(/\/index$/, '');
}

function isCustomerFacing(rel) {
  if (!isDeployed(rel)) return false;
  if (PUBLIC_VENDOR_FILES.has(rel)) return true;
  if (CUSTOMER_DIRS.some((d) => rel.startsWith(d))) return true;
  if (CUSTOMER_FILES.has(rel)) return true;
  return sitemapRoutes.has(routeOf(rel));
}

const cfgPath = path.join(repoRoot, 'data/route-factory/business.json');
if (!fs.existsSync(cfgPath)) {
  console.error('✗ missing data/route-factory/business.json (identity source of truth)');
  process.exit(1);
}
const cfg = JSON.parse(fs.readFileSync(cfgPath, 'utf8'));

let deployedNonCustomer = 0;
function walkHtml(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (WALK_SKIP.has(entry.name)) continue;
    const p = path.join(dir, entry.name);
    if (entry.isDirectory()) { walkHtml(p, out); continue; }
    if (!entry.name.endsWith('.html')) continue;
    const rel = path.relative(repoRoot, p);
    if (isCustomerFacing(rel)) out.push(p);
    else if (isDeployed(rel)) deployedNonCustomer++;
  }
  return out;
}

// Strip HTML comments so an explanatory note (e.g. "previously cid=…") can never
// trip a check — only RENDERED markup is audited.
const stripComments = (html) => html.replace(/<!--[\s\S]*?-->/g, '');

// Build a separator-tolerant regex for a phone's digits: +1? then each digit
// group with optional spaces/dashes/dots/parens between. Matches tel:+1435…,
// 435-302-4422, (435) 302-4422, 435.302.4422.
function phoneRegex(display) {
  const digits = display.replace(/\D/g, '');
  const sep = '[\\s().+-]*';
  const body = digits.split('').join(sep);
  return new RegExp(`\\+?1?${sep}${body}`);
}

const PLACEHOLDER_PATTERNS = [
  /your-[a-z-]*link/i, /\breplace[-_ ]?me\b/i, /\bplaceholder\b/i, /lorem ipsum/i,
  /example\.com/i, /\bcid=0\b/i, /\/r\/X{3,}/i, /\bTODO\b/, /\$\{[^}]+\}/, /\{\{[^}]+\}\}/,
  /YOUR[-_][A-Z]/,
];

const hrefRe = /(?:href|src)=["']([^"']+)["']/g;
const cidRe = /[?&]cid=(\d+)/i;
const dataIdRe = /(0x[0-9a-f]+:0x[0-9a-f]+)/i;
const placeidRe = /writereview\?placeid=([A-Za-z0-9_-]+)/i;
const googleReviewRe = /google\.com\/maps|g\.page\/|search\.google\.com\/local\/writereview/i;
const genericSearchRe = /google\.com\/maps\/search\/?\?[^"']*\bquery=|google\.com\/search\?[^"']*\bq=/i;

const blockers = []; // {type, file, detail}
const phoneChecks = (cfg.internal_phones_never_publish || []).map((p) => ({ display: p, re: phoneRegex(p) }));
const wrongCids = new Set(cfg.known_wrong_listing_cids || []);
const canonicalCid = cfg.gbp?.cid;
// Real second offices have their own GBP listing; those cids are registered
// explicitly in business.json (gbp.additional_location_cids) — anything else still blocks.
const extraCids = new Set(cfg.gbp?.additional_location_cids || []);
const canonicalDataId = (cfg.gbp?.data_id || '').toLowerCase();
const canonicalPlaceId = cfg.gbp?.place_id;

const files = walkHtml(repoRoot);
for (const f of files) {
  const rel = path.relative(repoRoot, f);
  const isPublicVendorFile = PUBLIC_VENDOR_FILES.has(rel);
  const raw = fs.readFileSync(f, 'utf8');
  const html = stripComments(raw);

  // 1. internal-phone leak (scan whole rendered body, not just hrefs)
  for (const { display, re } of phoneChecks) {
    if (re.test(html)) blockers.push({ type: 'INTERNAL-PHONE-LEAK', file: rel, detail: `internal-only number ${display} appears in published markup` });
  }

  // per-href checks
  for (const m of html.matchAll(hrefRe)) {
    const href = m[1];

    // 3. placeholder tokens in customer links. Public vendor tools are scanned
    // for NAP/internal-phone leakage, but may contain JS templates like
    // `${item.url}` that are not rendered customer CTAs.
    if (!isPublicVendorFile) {
      for (const p of PLACEHOLDER_PATTERNS) {
        if (p.test(href)) { blockers.push({ type: 'PLACEHOLDER-LINK', file: rel, detail: href }); break; }
      }
    }

    const isGoogleReview = googleReviewRe.test(href);

    // 2. wrong Google listing (cid / data_id mismatch, or a known-dead cid)
    const cidM = href.match(cidRe);
    if (cidM) {
      const cid = cidM[1];
      if (wrongCids.has(cid)) blockers.push({ type: 'WRONG-LISTING(dead)', file: rel, detail: `${href} — known-dead listing cid` });
      else if (canonicalCid && cid !== canonicalCid && !extraCids.has(cid)) blockers.push({ type: 'WRONG-LISTING(cid)', file: rel, detail: `${href} — cid != canonical ${canonicalCid}` });
    }
    if (isGoogleReview) {
      const pM = href.match(placeidRe);
      if (pM && canonicalPlaceId && pM[1] !== canonicalPlaceId) {
        blockers.push({ type: 'WRONG-LISTING(placeid)', file: rel, detail: `${href} — writereview placeid != canonical ${canonicalPlaceId}` });
      }
      const dM = href.match(dataIdRe);
      if (dM && canonicalDataId && dM[1].toLowerCase() !== canonicalDataId) {
        blockers.push({ type: 'WRONG-LISTING(data_id)', file: rel, detail: `${href} — data_id != canonical` });
      }
      // 4. generic search link used as a review/listing target
      if (genericSearchRe.test(href)) {
        blockers.push({ type: 'GENERIC-SEARCH-REVIEW', file: rel, detail: `${href} — points to search results, not a specific listing` });
      }
    }
  }
}

console.log('\n=== CTA & external-link integrity ===');
console.log(`audited ${files.length} public CTA/NAP surfaces · identity: ${cfg.brand} (cid ${canonicalCid})`);
console.log(`(${deployedNonCustomer} deployed operational/owner pages out of scope — see .vercelignore hygiene)`);

if (blockers.length === 0) {
  console.log('✓ no CTA/link integrity issues');
  process.exit(0);
}

// group by type
const byType = new Map();
for (const b of blockers) {
  if (!byType.has(b.type)) byType.set(b.type, []);
  byType.get(b.type).push(b);
}
console.log(`${strict ? '🚨' : '⚠'} ${blockers.length} issue(s)${strict ? '' : ' (informational, non-blocking)'}:`);
for (const [type, items] of byType) {
  console.log(`\n  [${type}] ×${items.length}`);
  for (const it of items.slice(0, 25)) console.log(`    ${it.file}: ${it.detail}`);
  if (items.length > 25) console.log(`    …and ${items.length - 25} more`);
}
process.exit(strict ? 1 : 0);
