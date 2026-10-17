#!/usr/bin/env node
/**
 * CLAUDE.md size-budget + operating-section gate for Frame Restoration Utah.
 *
 * Why this exists: CLAUDE.md is loaded into EVERY Claude Code session that opens
 * this repo. By 2026-10-17 it had grown to 1,789,848 bytes (~857k tokens) because
 * each Auto-Refresh prepended a "Last updated" banner and a SESSION LOG entry, so
 * sessions died at startup with "Prompt is too long". The slim-down moved all of
 * that history, byte-for-byte, to docs/history/ and left only the operating rules.
 *
 * This gate keeps it that way. BLOCKING (exit 1) on any of:
 *   SIZE      CLAUDE.md is larger than MAX_BYTES (40,960 bytes = 40 KB, roughly
 *             10k tokens, about 1% of a 1M-token context): room for every rule the
 *             file has ever needed, never enough to crowd out the actual task.
 *   SECTIONS  a required operating section heading is missing or duplicated
 *             (critical rules, people, domains/hosting, tech stack, site structure
 *             + key files, git workflow, the history pointer).
 *   SENTINELS the CRITICAL RULES section lost one of its load-bearing rules (the
 *             public NAP number, the internal-only number, the NRCA ban, the GBP
 *             manual-publish rule, the Heber Valley rule).
 *   HISTORY   dated history crept back in: a `## SESSION LOG` heading or a
 *             `> Last updated:` / `> Earlier (` banner line.
 *   ARCHIVE   a moved history file is missing/empty, or the HISTORY & LOGGING
 *             section no longer points at it.
 *
 * Usage:
 *   node scripts/audit-claude-md-budget.mjs                       # gate the repo's CLAUDE.md
 *   node scripts/audit-claude-md-budget.mjs --file path/to/copy   # gate another copy (e.g. `git show main:CLAUDE.md > /tmp/x.md`)
 *   node scripts/audit-claude-md-budget.mjs --root path/to/repo   # resolve CLAUDE.md + docs/history/ under another root
 *
 * CI: .github/workflows/claude-md-budget.yml (blocking, every PR + push to main).
 * Fixtures: scripts/test-audit-claude-md-budget.mjs.
 */

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export const MAX_BYTES = 40_960;

export const REQUIRED_SECTIONS = [
  { id: 'critical-rules', label: '## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT', test: (l) => l === '## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT' },
  { id: 'people', label: '## PEOPLE', test: (l) => l === '## PEOPLE' },
  { id: 'domains-hosting', label: '## DOMAINS & HOSTING', test: (l) => l === '## DOMAINS & HOSTING' },
  { id: 'tech-stack', label: '## TECH STACK', test: (l) => l === '## TECH STACK' },
  { id: 'site-structure', label: '## SITE STRUCTURE…', test: (l) => l.startsWith('## SITE STRUCTURE') },
  { id: 'key-files', label: '### Key files', test: (l) => /^### key files\b/i.test(l) },
  { id: 'git-workflow', label: '## GIT WORKFLOW', test: (l) => l === '## GIT WORKFLOW' },
  { id: 'history-pointer', label: '## HISTORY & LOGGING', test: (l) => l.startsWith('## HISTORY & LOGGING') },
];

// Must all appear inside the CRITICAL RULES section (between its heading and the next `## `).
export const CRITICAL_RULE_SENTINELS = [
  '435-292-8802',
  '435-302-4422',
  'NRCA',
  'NEVER auto-publish to Google Business Profile',
  'Heber Valley is ONE market',
];

export const FORBIDDEN_LINE_PATTERNS = [
  { id: 'session-log-heading', re: /^##\s+SESSION LOG\b/, hint: 'session entries go in docs/history/CLAUDE-SESSION-LOG.md' },
  { id: 'last-updated-banner', re: /^>.{0,40}Last updated:/, hint: 'refresh banners go in docs/history/CLAUDE-UPDATE-LOG.md' },
  { id: 'earlier-banner', re: /^>.{0,12}Earlier \(/, hint: 'demoted banners go in docs/history/CLAUDE-UPDATE-LOG.md' },
];

export const ARCHIVE_FILES = [
  'docs/history/CLAUDE-UPDATE-LOG.md',
  'docs/history/CLAUDE-SESSION-LOG.md',
  'docs/history/CLAUDE-STATUS-SNAPSHOT-2026-10-05.md',
];

function sectionSlice(lines, startIndex) {
  const out = [];
  for (let i = startIndex + 1; i < lines.length; i += 1) {
    if (lines[i].startsWith('## ')) break;
    out.push(lines[i]);
  }
  return out.join('\n');
}

/**
 * @param {{ bytes: Buffer, root: string }} input
 * @returns {{ failures: Array<{code: string, message: string}>, stats: object }}
 */
export function auditClaudeMd({ bytes, root }) {
  const failures = [];
  const fail = (code, message) => failures.push({ code, message });

  const size = bytes.length;
  if (size > MAX_BYTES) {
    fail('SIZE', `CLAUDE.md is ${size.toLocaleString()} bytes; cap is ${MAX_BYTES.toLocaleString()} (over by ${(size - MAX_BYTES).toLocaleString()}). Move dated history to docs/history/ (see HISTORY & LOGGING).`);
  }

  const text = bytes.toString('utf8');
  const lines = text.split('\n');

  const headingIndex = new Map();
  for (const section of REQUIRED_SECTIONS) {
    const hits = [];
    lines.forEach((line, index) => { if (section.test(line)) hits.push(index); });
    if (hits.length === 0) fail('SECTIONS', `required section missing: ${section.label}`);
    else if (hits.length > 1) fail('SECTIONS', `required section appears ${hits.length} times: ${section.label} (lines ${hits.map((i) => i + 1).join(', ')})`);
    else headingIndex.set(section.id, hits[0]);
  }

  if (headingIndex.has('critical-rules')) {
    const rules = sectionSlice(lines, headingIndex.get('critical-rules'));
    for (const sentinel of CRITICAL_RULE_SENTINELS) {
      if (!rules.includes(sentinel)) fail('SENTINELS', `CRITICAL RULES no longer contains "${sentinel}"`);
    }
  }

  lines.forEach((line, index) => {
    for (const pattern of FORBIDDEN_LINE_PATTERNS) {
      if (pattern.re.test(line)) fail('HISTORY', `line ${index + 1} is dated history (${pattern.id}): ${pattern.hint}`);
    }
  });

  const pointer = headingIndex.has('history-pointer') ? sectionSlice(lines, headingIndex.get('history-pointer')) : '';
  for (const rel of ARCHIVE_FILES) {
    const full = path.join(root, rel);
    let bytesOnDisk = -1;
    try { bytesOnDisk = fs.statSync(full).size; } catch { bytesOnDisk = -1; }
    if (bytesOnDisk < 0) fail('ARCHIVE', `moved history file is missing: ${rel}`);
    else if (bytesOnDisk === 0) fail('ARCHIVE', `moved history file is empty: ${rel}`);
    if (headingIndex.has('history-pointer') && !pointer.includes(rel)) fail('ARCHIVE', `HISTORY & LOGGING does not point at ${rel}`);
  }

  return {
    failures,
    stats: { bytes: size, maxBytes: MAX_BYTES, percentOfCap: Math.round((size / MAX_BYTES) * 1000) / 10, lines: lines.length - (text.endsWith('\n') ? 1 : 0) },
  };
}

function parseArgs(argv) {
  const args = { file: null, root: process.cwd() };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === '--file') args.file = argv[++i];
    else if (argv[i] === '--root') args.root = argv[++i];
    else { console.error(`unknown argument: ${argv[i]}`); process.exit(2); }
  }
  if (!args.file) args.file = path.join(args.root, 'CLAUDE.md');
  return args;
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  let bytes;
  try {
    bytes = fs.readFileSync(args.file);
  } catch (error) {
    console.error(`cannot read ${args.file}: ${error.message}`);
    process.exit(1);
  }
  const { failures, stats } = auditClaudeMd({ bytes, root: args.root });
  console.log('\n=== CLAUDE.md budget ===');
  console.log(`${args.file}: ${stats.bytes.toLocaleString()} bytes (${stats.percentOfCap}% of the ${stats.maxBytes.toLocaleString()}-byte cap), ${stats.lines.toLocaleString()} lines`);
  if (failures.length === 0) {
    console.log(`✓ under cap; ${REQUIRED_SECTIONS.length} operating sections, ${CRITICAL_RULE_SENTINELS.length} critical-rule sentinels, ${ARCHIVE_FILES.length} archived history files all present`);
    process.exit(0);
  }
  console.log(`🚨 ${failures.length} blocker(s):`);
  const shownPerCode = new Map();
  for (const failure of failures) {
    const shown = (shownPerCode.get(failure.code) ?? 0) + 1;
    shownPerCode.set(failure.code, shown);
    // The pre-split file trips HISTORY on dozens of banner lines; keep the report readable.
    if (shown <= 8) console.log(`    [${failure.code}] ${failure.message}`);
  }
  for (const [code, shown] of shownPerCode) {
    if (shown > 8) console.log(`    [${code}] …and ${shown - 8} more ${code} line(s)`);
  }
  console.log('  Fix: keep CLAUDE.md to operating rules; dated banners/session entries belong in docs/history/ (see HISTORY & LOGGING in CLAUDE.md).');
  process.exit(1);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main();
}
