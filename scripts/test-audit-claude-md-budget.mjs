#!/usr/bin/env node
/**
 * Fixtures for scripts/audit-claude-md-budget.mjs. Runs in-process (no spawn), so
 * it exercises the exported auditClaudeMd() exactly as the CLI does.
 *
 *   node scripts/test-audit-claude-md-budget.mjs
 */

import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import {
  ARCHIVE_FILES,
  CRITICAL_RULE_SENTINELS,
  MAX_BYTES,
  auditClaudeMd,
} from './audit-claude-md-budget.mjs';

const root = process.cwd();
const real = fs.readFileSync(path.join(root, 'CLAUDE.md'));
const realText = real.toString('utf8');
const codes = (result) => [...new Set(result.failures.map((f) => f.code))].sort();
const mutate = (from, to) => {
  assert(realText.includes(from), `fixture precondition: CLAUDE.md contains ${JSON.stringify(from)}`);
  return Buffer.from(realText.replace(from, to), 'utf8');
};
let cases = 0;
const run = (name, bytes, expectedCodes, rootOverride = root) => {
  const result = auditClaudeMd({ bytes, root: rootOverride });
  assert.deepEqual(codes(result), expectedCodes, `${name}: ${JSON.stringify(result.failures)}`);
  cases += 1;
};

// 1. The committed CLAUDE.md passes, and sits under the cap with headroom.
run('committed file', real, []);
assert(real.length <= MAX_BYTES, `CLAUDE.md is ${real.length} bytes, over the ${MAX_BYTES}-byte cap`);

// 2. Oversize is the only thing wrong with a padded copy.
const pad = Buffer.from(`\n<!-- ${'x'.repeat(MAX_BYTES)} -->\n`, 'utf8');
run('padded past the cap', Buffer.concat([real, pad]), ['SIZE']);

// 3. A file that is exactly at the cap passes SIZE.
{
  // "\n<!-- " + " -->\n" is 11 bytes of fixed overhead around the filler.
  const filler = Buffer.from(`\n<!-- ${'y'.repeat(Math.max(0, MAX_BYTES - real.length - 11))} -->\n`, 'utf8');
  const exact = Buffer.concat([real, filler]);
  assert.equal(exact.length, MAX_BYTES, 'fixture precondition: padded copy is exactly at the cap');
  run('exactly at the cap', exact, []);
  run('one byte over the cap', Buffer.concat([exact, Buffer.from('\n')]), ['SIZE']);
}

// 4. Losing the CRITICAL RULES heading is a SECTIONS failure (sentinels are then not re-reported).
run('critical rules heading removed',
  mutate('## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT', '## CRITICAL RULES (renamed)'), ['SECTIONS']);

// 5. Each required heading is required; duplicating one is also a failure.
run('PEOPLE removed', mutate('\n## PEOPLE\n', '\n## PEOPLE (moved)\n'), ['SECTIONS']);
run('GIT WORKFLOW duplicated', mutate('\n## GIT WORKFLOW\n', '\n## GIT WORKFLOW\n\n## GIT WORKFLOW\n'), ['SECTIONS']);
run('Key files removed', mutate('\n### Key files\n', '\n### Important files\n'), ['SECTIONS']);

// 6. Every critical-rule sentinel is load-bearing.
for (const sentinel of CRITICAL_RULE_SENTINELS) {
  const idx = realText.indexOf('## ⛔ CRITICAL RULES — READ BEFORE ANY EDIT');
  const end = realText.indexOf('\n## ', idx + 1);
  const rules = realText.slice(idx, end);
  assert(rules.includes(sentinel), `fixture precondition: rules contain ${sentinel}`);
  const stripped = realText.slice(0, idx) + rules.split(sentinel).join('[removed]') + realText.slice(end);
  run(`sentinel "${sentinel}" removed`, Buffer.from(stripped, 'utf8'), ['SENTINELS']);
}

// 7. Dated history creeping back in is caught line by line.
run('SESSION LOG heading reappears', Buffer.concat([real, Buffer.from('\n## SESSION LOG\n\n### 2026-10-18 (test)\n- entry\n')]), ['HISTORY']);
run('Last updated banner reappears', mutate('\n## PEOPLE\n', '\n> Last updated: 2026-10-18 (test refresh)\n\n## PEOPLE\n'), ['HISTORY']);
run('bold Last updated banner reappears', mutate('\n## PEOPLE\n', '\n> **(Superseded header) Last updated: 2026-10-18**\n\n## PEOPLE\n'), ['HISTORY']);
run('Earlier banner reappears', mutate('\n## PEOPLE\n', '\n> **Earlier (2026-10-18 test refresh):** text\n\n## PEOPLE\n'), ['HISTORY']);

// 8. The archive must exist on disk and be pointed at from HISTORY & LOGGING.
{
  const emptyRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'claude-md-budget-'));
  try {
    run('archive files missing', real, ['ARCHIVE'], emptyRoot);
    fs.mkdirSync(path.join(emptyRoot, 'docs', 'history'), { recursive: true });
    for (const rel of ARCHIVE_FILES) fs.writeFileSync(path.join(emptyRoot, rel), '');
    run('archive files empty', real, ['ARCHIVE'], emptyRoot);
    for (const rel of ARCHIVE_FILES) fs.writeFileSync(path.join(emptyRoot, rel), '# archived\n');
    run('archive files present elsewhere', real, [], emptyRoot);
  } finally {
    fs.rmSync(emptyRoot, { recursive: true, force: true });
  }
  for (const rel of ARCHIVE_FILES) {
    // HISTORY & LOGGING names each file more than once; every mention must go for the pointer to count as lost.
    assert(realText.includes(rel), `fixture precondition: CLAUDE.md mentions ${rel}`);
    const unpointed = Buffer.from(realText.split(rel).join('docs/history/SOMEWHERE-ELSE.md'), 'utf8');
    run(`pointer to ${rel} removed`, unpointed, ['ARCHIVE']);
  }
}

// 9. The pre-split shape (banner chain + SESSION LOG, no pointer section, far over the cap) fails on
//    SIZE, HISTORY and SECTIONS. ARCHIVE is not double-reported when the pointer section itself is
//    missing (SECTIONS already says so) and the archive files exist on disk.
{
  const preSplit = Buffer.concat([
    Buffer.from('# Frame Restoration Utah — Claude Master Context\n> Last updated: 2026-10-05 (Monday Auto-Refresh)\n> **Earlier (2026-09-30 refresh):** text\n\n---\n\n', 'utf8'),
    Buffer.from(realText.slice(realText.indexOf('## ⛔ CRITICAL RULES'), realText.indexOf('## HISTORY & LOGGING')), 'utf8'),
    Buffer.from(`## SESSION LOG\n\n### 2026-10-05 (Monday Auto-Refresh)\n- ${'history '.repeat(MAX_BYTES / 8)}\n`, 'utf8'),
  ]);
  run('pre-split shape', preSplit, ['HISTORY', 'SECTIONS', 'SIZE']);
}

console.log(`audit-claude-md-budget fixtures passed (${cases} cases; committed CLAUDE.md is ${real.length.toLocaleString()} of ${MAX_BYTES.toLocaleString()} bytes)`);
