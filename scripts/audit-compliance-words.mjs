#!/usr/bin/env node
/**
 * Compliance + AEO-saturation validator for Frame Restoration Utah.
 *
 * Reads `data/route-factory/compliance-words.json` and walks the site's
 * scan roots, scoring each configured public file against:
 *
 *   1. Forbidden words (HARD BLOCKER) — `public adjuster`, `negotiate` family.
 *      Any non-zero match in any non-exempt file fails the audit.
 *
 *   2. Saturation thresholds (WARN by default) — `insurance claim`,
 *      `§4102`, `HB 2102`, `TDI`, `claim documentation`. Counted per-file
 *      and site-wide. Per-file cap can be overridden via topicExemptions.
 *
 * Topic exemptions allow specific files (e.g. cornerstone insurance-claim
 * blog) to legitimately use heavier compliance language.
 *
 * Usage:
 *   node scripts/audit-compliance-words.mjs                # all scan roots
 *   node scripts/audit-compliance-words.mjs path/to/file   # single file
 *   node scripts/audit-compliance-words.mjs --json         # machine-readable
 *   node scripts/audit-compliance-words.mjs --quiet        # only failures
 *   node scripts/audit-compliance-words.mjs --strict       # warn → blocker
 *
 * Exit codes:
 *   0  — all clean (or only warnings in non-strict mode)
 *   1  — blocker findings present (or any finding in --strict mode)
 *   2  — config / IO error
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const repoRoot = path.resolve(__dirname, '..');
const configPath = path.join(repoRoot, 'data/route-factory/compliance-words.json');

const args = process.argv.slice(2);
const flags = {
  json: args.includes('--json'),
  quiet: args.includes('--quiet'),
  strict: args.includes('--strict'),
};
const targetPaths = args.filter((a) => !a.startsWith('--'));

let cfg;
try {
  cfg = JSON.parse(fs.readFileSync(configPath, 'utf8'));
} catch (e) {
  console.error(`[FATAL] cannot read ${configPath}: ${e.message}`);
  process.exit(2);
}

const ignoreSet = new Set(cfg.ignoreGlobs || []);
function isIgnored(relPath) {
  for (const g of ignoreSet) {
    if (relPath === g || relPath.startsWith(g)) return true;
  }
  return false;
}

const scanExtensions = new Set(
  (cfg.scanExtensions || ['.html']).map((ext) => ext.toLowerCase()),
);

function isScannableFile(filePath) {
  return scanExtensions.has(path.extname(filePath).toLowerCase());
}

function walkScannable(root) {
  const out = [];
  const stack = [root];
  while (stack.length) {
    const p = stack.pop();
    let st;
    try { st = fs.statSync(p); } catch { continue; }
    const rel = path.relative(repoRoot, p);
    if (isIgnored(rel)) continue;
    if (st.isDirectory()) {
      for (const child of fs.readdirSync(p)) stack.push(path.join(p, child));
    } else if (st.isFile() && isScannableFile(p)) {
      out.push(rel);
    }
  }
  return out;
}

function collectFiles() {
  if (targetPaths.length) return targetPaths;
  const set = new Set();
  for (const root of cfg.scanRoots) {
    const full = path.join(repoRoot, root);
    if (!fs.existsSync(full)) continue;
    const st = fs.statSync(full);
    if (st.isDirectory()) for (const f of walkScannable(full)) set.add(f);
    else if (st.isFile() && isScannableFile(full)) set.add(root);
  }
  return [...set].sort();
}

function countAll(text, patterns) {
  // Case-insensitive whole-string count for each pattern; sum them.
  let total = 0;
  const lower = text.toLowerCase();
  for (const p of patterns) {
    const needle = p.toLowerCase();
    let idx = 0;
    while ((idx = lower.indexOf(needle, idx)) !== -1) { total++; idx += needle.length; }
  }
  return total;
}

function effectiveCap(filePath, term, baseCap) {
  const tex = cfg.topicExemptions || {};
  const ex = tex[filePath];
  if (!ex || !ex.saturationOverrides) return baseCap;
  const o = ex.saturationOverrides[term];
  if (!o || typeof o.maxPerFile !== 'number') return baseCap;
  return o.maxPerFile;
}

const findings = { blocker: [], warn: [] };
const siteTotals = {};

const files = collectFiles();

for (const rel of files) {
  let text;
  try { text = fs.readFileSync(path.join(repoRoot, rel), 'utf8'); }
  catch { continue; }
  // Strip HTML comments before counting: guard/dev notes (e.g. about.html's
  // "do not add negotiate/..." lock comment) are not user-facing copy and
  // must not register as blockers.
  text = text.replace(/<!--[\s\S]*?-->/g, ' ');

  // Forbidden words
  for (const [key, rule] of Object.entries(cfg.forbiddenWords || {})) {
    const exempt = (rule.exemptFiles || []).includes(rel);
    if (exempt) continue;
    const n = countAll(text, rule.patterns);
    if (n > (rule.maxPerFile ?? 0)) {
      findings.blocker.push({
        rule: key,
        file: rel,
        count: n,
        cap: rule.maxPerFile ?? 0,
        reason: rule.reason,
        suggestion: cfg.approvedAlternatives?.[key] || null,
      });
    }
  }

  // Saturation
  for (const [term, rule] of Object.entries(cfg.saturationThresholds || {})) {
    const exempt = (rule.exemptFiles || []).includes(rel);
    if (exempt) continue;
    const n = countAll(text, [term]);
    siteTotals[term] = (siteTotals[term] || 0) + n;
    const cap = effectiveCap(rel, term, rule.maxPerFile ?? Infinity);
    if (n > cap) {
      findings.warn.push({
        rule: `saturation:${term}`,
        file: rel,
        count: n,
        cap,
        reason: rule.reason,
      });
    }
  }
}

// Site-wide saturation
for (const [term, rule] of Object.entries(cfg.saturationThresholds || {})) {
  const tot = siteTotals[term] || 0;
  const cap = rule.maxSiteWide ?? Infinity;
  if (tot > cap) {
    findings.warn.push({
      rule: `siteSaturation:${term}`,
      file: '<site-wide>',
      count: tot,
      cap,
      reason: rule.reason,
    });
  }
}

if (flags.json) {
  console.log(JSON.stringify({
    schemaVersion: 1,
    auditedFiles: files.length,
    siteTotals,
    findings,
    exitCode: findings.blocker.length || (flags.strict && findings.warn.length) ? 1 : 0,
  }, null, 2));
} else {
  const summary = `audited: ${files.length} public files`;
  console.log(`\n=== compliance-words audit ===`);
  console.log(summary);
  console.log(`\nSite-wide totals:`);
  for (const [t, n] of Object.entries(siteTotals).sort()) {
    const cap = cfg.saturationThresholds[t]?.maxSiteWide ?? '∞';
    const flag = (typeof cap === 'number' && n > cap) ? ' 🚩' : '';
    console.log(`  ${t.padEnd(28)} ${String(n).padStart(4)} / cap ${cap}${flag}`);
  }

  if (findings.blocker.length) {
    console.log(`\n🚨 BLOCKERS (${findings.blocker.length}):`);
    for (const f of findings.blocker) {
      console.log(`  [${f.rule}] ${f.file}: ${f.count} occurrences (cap ${f.cap})`);
      console.log(`    why: ${f.reason}`);
      if (f.suggestion) console.log(`    use instead: ${f.suggestion.join(' | ')}`);
    }
  } else if (!flags.quiet) {
    console.log(`\n✓ no blockers`);
  }

  if (findings.warn.length && !flags.quiet) {
    console.log(`\n⚠ WARNINGS (${findings.warn.length}):`);
    for (const f of findings.warn) {
      console.log(`  [${f.rule}] ${f.file}: ${f.count} occurrences (cap ${f.cap})`);
    }
  }

  console.log('');
}

const exitCode = findings.blocker.length || (flags.strict && findings.warn.length) ? 1 : 0;
process.exit(exitCode);
