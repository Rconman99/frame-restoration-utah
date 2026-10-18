#!/usr/bin/env node
/**
 * Frame guards: four blocking checks on customer-served files.
 *
 * WHY THIS EXISTS
 * These rules used to live only in agent prompts. Prompts drift and get
 * skimmed; a failing check does not. Each rule below has bitten a Frame site
 * at least once, and turning them into blocking CI is the precondition for
 * letting more PRs auto-merge.
 *
 *   no-ryan          Ryan's name, his personal emails, or an "RC Digital"
 *                    attribution on a customer-served file. Ryan never appears
 *                    on customer pages.
 *   nap-lock         Every phone number, and every street address / business
 *                    name in business JSON-LD, must match this repo's canonical
 *                    NAP source (config.nap.source). Forbidden numbers always fail.
 *   market-isolation A served page must not reference another Frame market's
 *                    domain, phone, brand, "City, ST" markers, or Supabase
 *                    project ref.
 *   dead-gbp-link    g.co/kgs/... Google share links. Site QA found them dead on
 *                    Utah and Texas; they are opaque redirects with no stable
 *                    target, so the whole class is denied (static, no network).
 *
 * WHAT "SERVED" MEANS is per repo and lives in frame-guards.config.json
 * (config.served). Static sites: every tracked file Vercel would upload
 * (git ls-files minus .vercelignore). Next.js sites: the source that is
 * compiled into or copied onto the site (src/, public/, plus any data file
 * src imports). Docs, archives, screenshots, CI, scripts and ledgers are not
 * served and are never scanned.
 *
 * BASELINE
 * Violations already on main when this gate landed are listed, one per
 * (guard, path, match), with a reviewed reason, in config.baseline. They pass;
 * anything not listed fails. Fixing copy makes an entry stale: stale entries
 * are reported as a notice and never fail the run, so unrelated fix PRs do not
 * have to edit this file (delete the entry when convenient). Entries without
 * a reason fail the run.
 *
 * There is no informational mode. Any unlisted violation exits 1.
 *
 * Usage:
 *   node scripts/frame-guards.mjs                 # the gate
 *   node scripts/frame-guards.mjs --selftest      # mutation self-test of every guard
 *   node scripts/frame-guards.mjs --no-baseline   # prove main fails without the baseline
 *   node scripts/frame-guards.mjs --write-baseline  # regenerate (reasons must be reviewed)
 */

import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const CONFIG_PATH = 'scripts/frame-guards.config.json';
const SELF = 'scripts/frame-guards.mjs';
const args = new Set(process.argv.slice(2));
const config = JSON.parse(fs.readFileSync(path.join(repoRoot, CONFIG_PATH), 'utf8'));
const BASELINE_PATH = config.baseline;
const GUARD_FILES = new Set([SELF, CONFIG_PATH, BASELINE_PATH]);

const TEXT_EXT = new Set([
  '.html', '.htm', '.js', '.mjs', '.cjs', '.jsx', '.ts', '.tsx', '.css', '.json',
  '.txt', '.xml', '.svg', '.webmanifest', '.md', '.mdx',
]);
// JSON-LD nodes that describe THIS business. Organization / Corporation nodes
// are also used for publishers, manufacturers and review sources ("Google",
// "CertainTeed", a newspaper), so they only count when their url / @id is on
// one of this market's own domains (config.nap.ownDomains).
const BUSINESS_TYPES = new Set([
  'LocalBusiness', 'RoofingContractor', 'HomeAndConstructionBusiness', 'GeneralContractor',
  'ProfessionalService',
]);
const ORG_TYPES = new Set(['Organization', 'Corporation']);

// ---------------------------------------------------------------- helpers
const digits = (s) => String(s).replace(/\D/g, '').replace(/^1(?=\d{10}$)/, '');
const fmtPhone = (d) => `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

// NANP numbers written with separators, "(xxx) xxx-xxxx", +1 / 1- prefixes,
// and the separator-free forms that only appear in tel: hrefs and E.164.
const PHONE_RES = [
  /(?<![\w+.-])(?:\+?1[-. ]?)?\(?([2-9]\d{2})\)?[-. ]{1,2}([2-9]\d{2})[-. ](\d{4})(?![\w-])/g,
  /\+1([2-9]\d{2}[2-9]\d{6})(?!\d)/g,
  /tel:\s*(?:\+?1)?([2-9]\d{2}[2-9]\d{6})(?!\d)/gi,
];

function phonesIn(text) {
  const out = [];
  const ends = new Set(); // "tel:+1..." matches two patterns; count it once
  for (const re of PHONE_RES) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      const end = m.index + m[0].length;
      if (ends.has(end)) continue;
      ends.add(end);
      const d = m.length > 2 ? m[1] + m[2] + m[3] : m[1];
      out.push({ index: m.index, digits: d, raw: m[0] });
    }
  }
  return out;
}

function lineAt(text, index) {
  let line = 1;
  for (let i = text.indexOf('\n'); i !== -1 && i < index; i = text.indexOf('\n', i + 1)) line += 1;
  return line;
}

function git(argv) {
  return execFileSync('git', argv, { cwd: repoRoot, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 })
    .split('\0').filter(Boolean);
}

function servedFiles() {
  const s = config.served;
  const tracked = git(['ls-files', '-z']);
  const ignored = s.vercelignore && fs.existsSync(path.join(repoRoot, '.vercelignore'))
    ? new Set(git(['ls-files', '-z', '-c', '-i', '--exclude-from=.vercelignore']))
    : new Set();
  const excludeRes = (s.excludeRegex || []).map((r) => new RegExp(r));
  return tracked.filter((rel) => {
    if (GUARD_FILES.has(rel)) return false;
    if (ignored.has(rel)) return false;
    if (s.include && !s.include.some((p) => rel === p || rel.startsWith(p))) return false;
    if ((s.excludePrefixes || []).some((p) => rel === p || rel.startsWith(p))) return false;
    if (excludeRes.some((re) => re.test(rel))) return false;
    if (!TEXT_EXT.has(path.extname(rel).toLowerCase())) return false;
    const abs = path.join(repoRoot, rel);
    return fs.existsSync(abs) && fs.statSync(abs).isFile();
  });
}

// ---------------------------------------------------------------- guards
const nap = config.nap;
const canonicalPhones = new Set((nap.phones || []).map(digits));
const forbiddenPhones = new Map((nap.forbiddenPhones || []).map((p) => [digits(p.phone), p.reason]));
const foreign = config.markets.foreign || [];
const foreignPhones = new Map();
for (const m of foreign) for (const p of m.phones || []) foreignPhones.set(digits(p), m.key);

const NO_RYAN = (config.noRyan.patterns || []).map((p) => ({ label: p.label, re: new RegExp(p.regex, p.flags || 'g') }));
const DEAD_GBP = (config.deadGbp.patterns || []).map((p) => ({ label: p.label, re: new RegExp(p.regex, p.flags || 'g') }));

const ISOLATION = [];
for (const m of foreign) {
  for (const d of m.domains || []) {
    ISOLATION.push({ label: `${m.key} domain`, re: new RegExp(`(?<![A-Za-z0-9-])${escapeRe(d)}(?![A-Za-z0-9-])`, 'gi') });
  }
  for (const ref of m.supabaseRefs || []) {
    ISOLATION.push({ label: `${m.key} Supabase project`, re: new RegExp(`(?<![a-z0-9])${escapeRe(ref)}(?![a-z0-9])`, 'g') });
  }
  for (const b of m.brands || []) {
    ISOLATION.push({ label: `${m.key} brand`, re: new RegExp(`(?<![A-Za-z])${escapeRe(b)}(?![A-Za-z])`, 'g') });
  }
  if ((m.cities || []).length) {
    const cities = [...m.cities].sort((a, b) => b.length - a.length).map(escapeRe).join('|');
    const states = (m.stateMarkers || []).map(escapeRe).join('|');
    ISOLATION.push({ label: `${m.key} city marker`, re: new RegExp(`(?<![A-Za-z])(?:${cities}),\\s*(?:${states})(?![A-Za-z])`, 'g') });
  }
}

function regexHits(guard, rel, text, rules, out) {
  for (const { label, re } of rules) {
    re.lastIndex = 0;
    let m;
    while ((m = re.exec(text))) {
      out.push({ guard, path: rel, line: lineAt(text, m.index), match: m[0].toLowerCase().replace(/\s+/g, ' '), detail: label });
      if (m[0] === '') re.lastIndex += 1;
    }
  }
}

function* jsonLdNodes(text) {
  const re = /<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi;
  let m;
  while ((m = re.exec(text))) {
    let data;
    try { data = JSON.parse(m[1]); } catch { continue; }
    const stack = [data];
    while (stack.length) {
      const node = stack.pop();
      if (Array.isArray(node)) { stack.push(...node); continue; }
      if (!node || typeof node !== 'object') continue;
      yield { node, index: m.index };
      for (const v of Object.values(node)) if (v && typeof v === 'object') stack.push(v);
    }
  }
}

// Exact canonical name, or the repo-wide location-page convention
// "<canonical name> — <City>" / "<canonical name> - <City>".
function nameOk(raw) {
  const name = raw.trim();
  return nap.businessNames.some((n) => name === n || name.startsWith(`${n} — `) || name.startsWith(`${n} – `) || name.startsWith(`${n} - `));
}

function napHits(rel, text, out) {
  for (const p of phonesIn(text)) {
    const d = p.digits;
    if (canonicalPhones.has(d)) continue;
    if (forbiddenPhones.has(d)) {
      out.push({ guard: 'nap-lock', path: rel, line: lineAt(text, p.index), match: fmtPhone(d), detail: `forbidden phone: ${forbiddenPhones.get(d)}` });
      continue;
    }
    if (foreignPhones.has(d)) continue; // reported by market-isolation
    if (d.slice(3, 6) === '555') continue; // reserved fictional range: form placeholders / examples
    out.push({ guard: 'nap-lock', path: rel, line: lineAt(text, p.index), match: fmtPhone(d), detail: 'phone is not the canonical NAP phone' });
  }
  if (!/\.html?$/i.test(rel)) {
    // Source files (Next.js): literal streetAddress values must be canonical.
    const re = /streetAddress["']?\s*:\s*["']([^"']+)["']/g;
    let m;
    while ((m = re.exec(text))) {
      if (nap.streetAddress && m[1] === nap.streetAddress) continue;
      out.push({ guard: 'nap-lock', path: rel, line: lineAt(text, m.index), match: `streetaddress:${m[1].toLowerCase()}`, detail: 'streetAddress differs from canonical NAP' });
    }
    return;
  }
  for (const { node, index } of jsonLdNodes(text)) {
    const types = [].concat(node['@type'] || []);
    const ownOrg = types.some((t) => ORG_TYPES.has(t))
      && [node.url, node['@id']].some((u) => typeof u === 'string' && (nap.ownDomains || []).some((d) => u.includes(d)));
    if (!ownOrg && !types.some((t) => BUSINESS_TYPES.has(t))) continue;
    const line = lineAt(text, index);
    if (typeof node.name === 'string' && !nameOk(node.name)) {
      out.push({ guard: 'nap-lock', path: rel, line, match: `name:${node.name.trim().toLowerCase()}`, detail: `business name not in canonical names (${nap.businessNames.join(' | ')})` });
    }
    const addr = node.address && typeof node.address === 'object' ? [].concat(node.address) : [];
    for (const a of addr) {
      if (typeof a.streetAddress !== 'string') continue;
      if (nap.streetAddress && a.streetAddress.trim() === nap.streetAddress) continue;
      out.push({ guard: 'nap-lock', path: rel, line, match: `streetaddress:${a.streetAddress.trim().toLowerCase()}`, detail: 'JSON-LD streetAddress differs from canonical NAP' });
    }
  }
}

function isolationHits(rel, text, out) {
  regexHits('market-isolation', rel, text, ISOLATION, out);
  for (const p of phonesIn(text)) {
    if (foreignPhones.has(p.digits)) {
      out.push({ guard: 'market-isolation', path: rel, line: lineAt(text, p.index), match: fmtPhone(p.digits), detail: `${foreignPhones.get(p.digits)} phone` });
    }
  }
}

function scanText(rel, text) {
  const out = [];
  regexHits('no-ryan', rel, text, NO_RYAN, out);
  napHits(rel, text, out);
  isolationHits(rel, text, out);
  regexHits('dead-gbp-link', rel, text, DEAD_GBP, out);
  return out;
}

const key = (v) => `${v.guard}\u0000${v.path}\u0000${v.match}`;

// ---------------------------------------------------------------- canonical drift
function checkCanonicalSource() {
  const src = fs.readFileSync(path.join(repoRoot, nap.source), 'utf8');
  const missing = (nap.sourceMustContain || []).filter((v) => !src.includes(v));
  return missing;
}

// ---------------------------------------------------------------- self-test
function selftest() {
  const sample = (s) => scanText('selftest/page.html', s).map((v) => v.guard);
  const ownPhone = nap.phones[0];
  const cases = [];
  cases.push(['canonical NAP passes', ownPhone ? `Call ${ownPhone}` : 'No phone here', []]);
  cases.push(['no-ryan: full name', 'Site by Ryan Conwell', ['no-ryan']]);
  cases.push(['no-ryan: personal email', 'mail ' + ['ryanconwell99', 'gmail.com'].join('@'), ['no-ryan']]);
  cases.push(['no-ryan: agency credit', 'Website by RC Digital', ['no-ryan']]);
  cases.push(['nap-lock: unknown phone', 'Call 958-321-0100 today', ['nap-lock']]);
  for (const [d] of forbiddenPhones) cases.push([`nap-lock: forbidden ${fmtPhone(d)}`, `Call (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`, ['nap-lock']]);
  cases.push(['nap-lock: wrong JSON-LD street', `<script type="application/ld+json">{"@type":"RoofingContractor","name":"${nap.businessNames[0]}","address":{"streetAddress":"1 Fake Way"}}</script>`, ['nap-lock']]);
  cases.push(['nap-lock: wrong JSON-LD name', `<script type="application/ld+json">{"@type":"LocalBusiness","name":"Acme Roofing"}</script>`, ['nap-lock']]);
  for (const m of foreign) {
    if (m.domains?.[0]) cases.push([`isolation: ${m.key} domain`, `see https://www.${m.domains[0]}/`, ['market-isolation']]);
    if (m.phones?.[0]) cases.push([`isolation: ${m.key} phone`, `tel:+1${digits(m.phones[0])}`, ['market-isolation']]);
    if (m.supabaseRefs?.[0]) cases.push([`isolation: ${m.key} supabase`, `https://${m.supabaseRefs[0]}.supabase.co`, ['market-isolation']]);
    if (m.cities?.[0]) cases.push([`isolation: ${m.key} city`, `serving ${m.cities[0]}, ${m.stateMarkers[0]}`, ['market-isolation']]);
  }
  cases.push(['dead-gbp-link: g.co/kgs', 'https://g.co/kgs/AbC123x', ['dead-gbp-link']]);
  let failed = 0;
  for (const [name, text, expect] of cases) {
    const got = [...new Set(sample(text))].sort();
    const ok = JSON.stringify(got) === JSON.stringify([...expect].sort());
    if (!ok) failed += 1;
    console.log(`${ok ? 'ok  ' : 'FAIL'} ${name}${ok ? '' : `  (expected [${expect}], got [${got}])`}`);
  }
  // A real mutation: inject a violation into a served file's text and require
  // the full pipeline (including the baseline) to reject it.
  const files = servedFiles();
  const target = files.find((f) => /\.(html|tsx)$/.test(f)) || files[0];
  const baseline = loadBaseline();
  const allowed = new Set(baseline.map(key));
  const mutated = fs.readFileSync(path.join(repoRoot, target), 'utf8') + '\nBuilt by Ryan Conwell. https://g.co/kgs/Mut4t10n\n';
  const fresh = scanText(target, mutated).filter((v) => !allowed.has(key(v)));
  const guardsCaught = new Set(fresh.map((v) => v.guard));
  const mutOk = guardsCaught.has('no-ryan') && guardsCaught.has('dead-gbp-link');
  if (!mutOk) failed += 1;
  console.log(`${mutOk ? 'ok  ' : 'FAIL'} mutation of ${target} is rejected through the baseline`);
  if (failed) { console.error(`\nselftest FAILED: ${failed} case(s)`); process.exit(1); }
  console.log(`\nselftest PASS: ${cases.length + 1} cases`);
}

function loadBaseline() {
  if (!fs.existsSync(path.join(repoRoot, BASELINE_PATH))) return [];
  return JSON.parse(fs.readFileSync(path.join(repoRoot, BASELINE_PATH), 'utf8')).entries || [];
}

// ---------------------------------------------------------------- main
if (args.has('--selftest')) { selftest(); process.exit(0); }

const started = Date.now();
const files = servedFiles();
const all = [];
for (const rel of files) all.push(...scanText(rel, fs.readFileSync(path.join(repoRoot, rel), 'utf8')));

if (args.has('--write-baseline')) {
  const prior = new Map(loadBaseline().map((e) => [key(e), e.reason]));
  const seen = new Map();
  for (const v of all) if (!seen.has(key(v))) seen.set(key(v), { guard: v.guard, path: v.path, match: v.match, reason: prior.get(key(v)) || `TODO: review (${v.detail})` });
  const entries = [...seen.values()].sort((a, b) => key(a).localeCompare(key(b)));
  const doc = { $comment: 'Reviewed violations present on main when frame-guards landed. One entry per (guard, path, match). Fix the copy, then delete the entry. Do not add entries to get a PR green without a reviewed reason.', entries };
  fs.writeFileSync(path.join(repoRoot, BASELINE_PATH), JSON.stringify(doc, null, 2) + '\n');
  console.log(`wrote ${entries.length} baseline entries to ${BASELINE_PATH}`);
  process.exit(0);
}

const useBaseline = !args.has('--no-baseline');
const baseline = useBaseline ? loadBaseline() : [];
const problems = [];
const missing = checkCanonicalSource();
if (missing.length) problems.push(`canonical NAP source ${nap.source} no longer contains: ${missing.join(' | ')} (update ${CONFIG_PATH} to match it)`);
const unreviewed = baseline.filter((e) => !e.reason || /^TODO/.test(e.reason));
if (unreviewed.length) problems.push(`${unreviewed.length} baseline entr(ies) have no reviewed reason`);

const allowed = new Set(baseline.map(key));
const fresh = all.filter((v) => !allowed.has(key(v)));
const live = new Set(all.map(key));
const stale = baseline.filter((e) => !live.has(key(e)));

const byGuard = (list) => list.reduce((acc, v) => ((acc[v.guard] = (acc[v.guard] || 0) + 1), acc), {});
console.log('\n=== Frame guards ===');
console.log(`market ${config.markets.self}; scanned ${files.length} served files in ${Date.now() - started} ms`);
console.log(`occurrences on this tree: ${JSON.stringify(byGuard(all))}; baseline entries: ${baseline.length}${useBaseline ? '' : ' (baseline disabled)'}`);
if (stale.length) {
  console.log(`notice: ${stale.length} baseline entr(ies) no longer occur (copy was fixed) and can be deleted:`);
  for (const e of stale.slice(0, 20)) console.log(`  - ${e.guard} ${e.path} ${e.match}`);
}

if (!fresh.length && !problems.length) {
  console.log('PASS: no unlisted violation in any served file');
  process.exit(0);
}
for (const p of problems) console.error(`FAIL: ${p}`);
if (fresh.length) {
  console.error(`FAIL: ${fresh.length} violation occurrence(s) not in the baseline: ${JSON.stringify(byGuard(fresh))}`);
  const shown = new Map();
  for (const v of fresh) {
    const k = key(v);
    if (!shown.has(k)) shown.set(k, { ...v, lines: [] });
    shown.get(k).lines.push(v.line);
  }
  for (const v of shown.values()) {
    const lines = v.lines.slice(0, 3).join(',') + (v.lines.length > 3 ? ',…' : '');
    console.error(`  - [${v.guard}] ${v.path}:${lines}  "${v.match}"  (${v.detail})`);
  }
}
process.exit(1);
