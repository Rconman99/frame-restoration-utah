import test from 'node:test';
import assert from 'node:assert/strict';
import { cpSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root = fileURLToPath(new URL('../', import.meta.url));

test('weekly queue persists unexpected URL evidence without opening public intervention gates', () => {
  const fixture = mkdtempSync(join(tmpdir(), 'slv-selection-regression-'));
  try {
    for (const dir of ['data', 'scripts']) cpSync(join(root, dir), join(fixture, dir), { recursive: true });
    const portfolioPath = join(fixture, 'data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json');
    const portfolio = JSON.parse(readFileSync(portfolioPath, 'utf8'));
    const slc = portfolio.cityGoals.find(city => city.city === 'Salt Lake City');
    slc.current.selectedOrganicUrls[0] = 'https://www.framerestorationutah.com/';
    writeFileSync(portfolioPath, JSON.stringify(portfolio));
    const sync = spawnSync(process.execPath, ['scripts/sync-slv-intervention-queue.mjs', '--write'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(sync.status, 0, sync.stderr);
    const queue = JSON.parse(readFileSync(join(fixture, 'data/rank-tracker/SLV-INTERVENTION-QUEUE-2026-08-12.json'), 'utf8'));
    const candidate = queue.candidates.find(city => city.city === 'Salt Lake City');
    assert.equal(queue.publicMutationPerformed, false);
    assert.equal(candidate.evidenceFeatures.intendedPageSelectedForEveryMeasuredRank, false);
    assert.equal(candidate.lane, 'observe-time-gated-slc-experiment');
    assert.equal(candidate.decision, 'Monitor');
    assert.match(candidate.selectedAction, /^Diagnose unexpected organic URL selection/);
    const check = spawnSync(process.execPath, ['scripts/sync-slv-intervention-queue.mjs', '--check'], { cwd: fixture, encoding: 'utf8' });
    assert.equal(check.status, 0, check.stderr);
  } finally {
    rmSync(fixture, { recursive: true, force: true }); // exact mkdtemp fixture only
  }
});
