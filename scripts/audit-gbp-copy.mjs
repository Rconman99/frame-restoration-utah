#!/usr/bin/env node
/**
 * GBP-copy compliance validator for Frame Roofing Utah.
 *
 * Scans the *paste-ready* Google Business Profile copy in data/GBP-*.md — the
 * text that gets pasted into Google's merchant panel (Posts, Services,
 * descriptions, service-area lists) — against the rules that keep a profile off
 * Google's enforcement radar.
 *
 * WHY THIS EXISTS: the on-site compliance gate (audit-compliance-words.mjs)
 * explicitly ignores data/, so GBP draft copy was never checked. A reviews-
 * mention post (DPNB), an unlicensed-adjusting service, and a "Free" service
 * name all reached the LIVE profile before this gate. Config + provenance:
 * data/route-factory/gbp-copy.json.
 *
 * It checks four classes of violation:
 *   1. Unlicensed-adjusting language  — reused from compliance-words.json
 *      forbiddenWords (single source of truth). BLOCKER, everywhere.
 *   2. "Free"/promo in a service NAME — instant Google rejection. BLOCKER.
 *   3. Reviews/stars solicitation     — DPNB policy violation. BLOCKER.
 *   4. Internal phone leak (LANDON)   — from business.json. BLOCKER, everywhere.
 *   + promo-in-post / phone+url-in-service-description as WARN.
 *
 * It only scans paste-ready copy, never the strategy/policy prose around it, so
 * audit docs that legitimately quote a violation to fix it don't false-positive
 * (see the _extraction_note in gbp-copy.json).
 *
 * Usage:
 *   node scripts/audit-gbp-copy.mjs                 # all GBP drafts
 *   node scripts/audit-gbp-copy.mjs data/GBP-x.md   # single file
 *   node scripts/audit-gbp-copy.mjs --json          # machine-readable
 *   node scripts/audit-gbp-copy.mjs --quiet         # only failures
 *   node scripts/audit-gbp-copy.mjs --strict        # warn -> blocker
 *
 * Exit codes: 0 clean (or only warnings, non-strict) · 1 blockers (or any
 * finding in --strict) · 2 config/IO error.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'data/route-factory/gbp-copy.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  quiet: args.includes('--quiet'),
  strict: args.includes('--strict'),
};
const targetPaths = args.filter((a) => !a.startsWith('--'));

function fatal(msg) {
  console.error(`[FATAL] ${msg}`);
  process.exit(2);
}

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  fatal(`cannot read ${configPath}: ${e.message}`);
}

// --- Reused keystones -------------------------------------------------------

let adjustingRules = {};
try {
  const cw = JSON.parse(fs.readFileSync(path.join(repoRoot, cfg.reuseComplianceWords), 'utf8'));
  adjustingRules = cw.forbiddenWords || {};
} catch (e) {
  fatal(`cannot read reuseComplianceWords (${cfg.reuseComplianceWords}): ${e.message}`);
}

let internalPhoneDigits = [];
try {
  const biz = JSON.parse(fs.readFileSync(path.join(repoRoot, cfg.businessKeystone), 'utf8'));
  internalPhoneDigits = (biz.internal_phones_never_publish || []).map((p) => p.replace(/\D/g, ''));
} catch (e) {
  fatal(`cannot read businessKeystone (${cfg.businessKeystone}): ${e.message}`);
}

// --- File discovery ---------------------------------------------------------

function globToFiles(glob) {
  // Supports the single shape we use: "dir/PREFIX-*.SUFFIX".
  const dir = path.dirname(glob);
  const base = path.basename(glob);
  const rx = new RegExp('^' + base.split('*').map((s) => s.replace(/[.+?^${}()|[\]\\]/g, '\\$&')).join('.*') + '$');
  const full = path.join(repoRoot, dir);
  if (!fs.existsSync(full)) return [];
  return fs.readdirSync(full)
    .filter((f) => rx.test(f))
    .map((f) => path.join(dir, f));
}

function collectFiles() {
  if (targetPaths.length) return targetPaths.map((p) => path.relative(repoRoot, path.resolve(p)));
  const set = new Set();
  for (const g of cfg.scanGlobs || []) for (const f of globToFiles(g)) set.add(f);
  return [...set].sort();
}

// --- Segment extraction -----------------------------------------------------
// Returns [{ type: 'post'|'serviceName'|'serviceDescription', text, line }]

function stripMd(s) {
  return s.replace(/\*\*/g, '').replace(/`/g, '').trim();
}

function lineOf(text, index) {
  return text.slice(0, index).split('\n').length;
}

function extractSegments(raw) {
  // Strip HTML comments (guard notes, gbp-allow markers handled separately).
  const text = raw.replace(/<!--[\s\S]*?-->/g, ' ');
  const segments = [];

  // (1) Fenced code blocks = paste-ready post / list copy.
  const fence = /```[^\n]*\n([\s\S]*?)```/g;
  let m;
  while ((m = fence.exec(text)) !== null) {
    segments.push({ type: 'post', text: m[1], line: lineOf(text, m.index) });
  }

  // (2) Markdown tables with a literal "Service name" column.
  const lines = text.split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.includes('|')) continue;
    const headerCells = line.split('|').map((c) => c.trim().toLowerCase());
    const nameIdx = headerCells.indexOf('service name');
    if (nameIdx === -1) continue;
    const descIdx = headerCells.findIndex((c) => c.startsWith('description'));
    // Next line should be the markdown separator (---). Skip it, then read rows.
    let j = i + 1;
    if (j < lines.length && /^\s*\|?[\s:|-]+\|?\s*$/.test(lines[j])) j++;
    for (; j < lines.length; j++) {
      const row = lines[j];
      if (!row.includes('|') || row.trim() === '') break;
      if (/gbp-allow/i.test(raw.split('\n')[j] || '')) continue; // honor opt-out on the raw line
      const cells = row.split('|').map((c) => c.trim());
      // split() on "| a | b |" yields ['', ' a ', ' b ', ''] — align to header.
      const get = (idx) => stripMd(cells[idx] !== undefined ? cells[idx] : '');
      const name = get(nameIdx);
      if (name) segments.push({ type: 'serviceName', text: name, line: j + 1 });
      if (descIdx !== -1) {
        const desc = get(descIdx);
        if (desc) segments.push({ type: 'serviceDescription', text: desc, line: j + 1 });
      }
    }
    i = j - 1;
  }

  return segments;
}

// --- Matching ---------------------------------------------------------------

function countNeedles(text, patterns) {
  const lower = text.toLowerCase();
  const hits = [];
  for (const p of patterns) {
    const needle = p.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) { hits.push(p); idx += needle.length; }
  }
  return hits;
}

function findInternalPhone(text) {
  const digits = text.replace(/\D/g, '');
  return internalPhoneDigits.some((p) => digits.includes(p) || digits.includes('1' + p));
}

const PHONE_RX = /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/;
const URL_RX = /\b(?:https?:\/\/|www\.)\S+|\b[a-z0-9-]+\.(?:com|net|org|io)\b/i;

const exemptFiles = new Set(cfg.exemptFiles || []);
const findings = { blocker: [], warn: [] };

function record(severity, o) {
  (severity === 'blocker' ? findings.blocker : findings.warn).push(o);
}

const files = collectFiles();
let segmentCount = 0;

for (const rel of files) {
  if (exemptFiles.has(rel)) continue;
  let raw;
  try { raw = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); }
  catch { continue; }

  for (const seg of extractSegments(raw)) {
    segmentCount++;
    const where = `${rel}:${seg.line}`;

    // 1. Adjusting language — BLOCKER everywhere (reused dictionary).
    for (const [key, rule] of Object.entries(adjustingRules)) {
      const hits = countNeedles(seg.text, rule.patterns);
      if (hits.length) {
        record('blocker', {
          rule: `adjusting:${key}`, where, segment: seg.type,
          match: hits[0], reason: rule.reason,
        });
      }
    }

    // 4. Internal phone — BLOCKER everywhere.
    if (findInternalPhone(seg.text)) {
      record('blocker', {
        rule: 'internalPhoneLeak', where, segment: seg.type,
        match: '(internal LANDON_PHONE)',
        reason: 'Internal-only phone (business.json internal_phones_never_publish) must never appear in GBP copy.',
      });
    }

    // 2/3 + warns — config-driven rules scoped by segment type.
    for (const [key, rule] of Object.entries(cfg.rules || {})) {
      if (!rule.appliesTo.includes(seg.type)) continue;

      if (key === 'phoneInServiceDescription') {
        if (PHONE_RX.test(seg.text)) record(rule.severity, { rule: key, where, segment: seg.type, match: '(phone number)', reason: rule.reason });
        continue;
      }
      if (key === 'urlInServiceDescription') {
        if (URL_RX.test(seg.text)) record(rule.severity, { rule: key, where, segment: seg.type, match: '(url)', reason: rule.reason });
        continue;
      }
      const hits = countNeedles(seg.text, rule.patterns || []);
      if (hits.length) {
        record(rule.severity, { rule: key, where, segment: seg.type, match: hits[0], reason: rule.reason });
      }
    }
  }
}

// --- Report -----------------------------------------------------------------

const exitCode = findings.blocker.length || (flags.strict && findings.warn.length) ? 1 : 0;

if (flags.json) {
  console.log(JSON.stringify({
    schemaVersion: 1, scannedFiles: files.length, segments: segmentCount, findings, exitCode,
  }, null, 2));
} else {
  console.log(`\n=== GBP-copy audit ===`);
  console.log(`scanned: ${files.length} GBP draft(s), ${segmentCount} paste-ready segment(s)`);

  if (findings.blocker.length) {
    console.log(`\n🚨 BLOCKERS (${findings.blocker.length}):`);
    for (const f of findings.blocker) {
      console.log(`  [${f.rule}] ${f.where} (${f.segment}) — matched "${f.match}"`);
      console.log(`    why: ${f.reason}`);
    }
  } else if (!flags.quiet) {
    console.log(`\n✓ no blockers`);
  }

  if (findings.warn.length && !flags.quiet) {
    console.log(`\n⚠ WARNINGS (${findings.warn.length}):`);
    for (const f of findings.warn) {
      console.log(`  [${f.rule}] ${f.where} (${f.segment}) — matched "${f.match}"`);
    }
  }
  console.log('');
}

process.exit(exitCode);
