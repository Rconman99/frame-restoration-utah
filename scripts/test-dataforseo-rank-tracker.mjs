import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReport,
  buildTasks,
  estimatedPanelCost,
  extractRank,
  markdownReport,
  validateConfig,
  validateRegistry,
} from './dataforseo-rank-tracker.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(SCRIPT_DIR, '..');

const config = validateConfig({
  schemaVersion: 1,
  panelId: 'test-panel',
  city: 'Salt Lake City',
  market: 'utah',
  service: 'roofing-contractor-salt-lake-city',
  provider: 'DataForSEO',
  mode: 'task-queue',
  locationName: 'Salt Lake City,Utah,United States',
  languageCode: 'en',
  device: 'mobile',
  os: 'android',
  depth: 30,
  loadAsyncAiOverview: true,
  target: {
    domain: 'framerestorationutah.com',
    businessName: 'Frame Restoration Utah LLC',
    gbpCid: '5689850818145735734',
    phone: '435-292-8802',
  },
  keywords: [{ id: 'slc-repair', keyword: 'roof repair salt lake city' }],
});

const fixture = {
  items: [
    {
      type: 'ai_overview',
      references: [{ url: 'https://www.framerestorationutah.com/locations/salt-lake-city' }],
    },
    {
      type: 'local_pack',
      rank_group: 1,
      cid: '111',
    },
    {
      type: 'local_pack',
      rank_group: 2,
      cid: '5689850818145735734',
    },
    {
      type: 'organic',
      rank_group: 7,
      domain: 'www.framerestorationutah.com',
      url: 'https://www.framerestorationutah.com/locations/salt-lake-city',
    },
  ],
};

const reading = extractRank(fixture, config.target);
assert.equal(reading.organicRank, 7);
assert.equal(reading.mapPackPresent, true);
assert.equal(reading.mapPackRank, 2);
assert.equal(reading.aiOverviewPresent, true);
assert.equal(reading.aiOverviewCited, true);
assert.deepEqual(reading.serpFeatures, ['ai_overview', 'local_pack']);

assert.equal(extractRank(null, config.target).organicRank, null);
assert.equal(extractRank({ items: [{}] }, config.target).mapPackRank, null);
assert.equal(extractRank(fixture, { ...config.target, gbpCid: 'missing' }).mapPackRank, null);

const tasks = buildTasks(config);
assert.equal(tasks[0].location_name, 'Salt Lake City,Utah,United States');
assert.equal(tasks[0].device, 'mobile');
assert.equal(tasks[0].depth, 30);
assert.equal(tasks[0].tag, 'slc-repair');
assert.equal(estimatedPanelCost(config), 0.0024);

const report = buildReport(config, new Map([['slc-repair', fixture]]), '2026-08-11T20:04:27.000Z');
assert.equal(report.date, '2026-08-11');
assert.equal(report.city, 'Salt Lake City');
assert.equal(report.summary.organicRanked, 1);
assert.equal(report.summary.mapPackMatched, 1);
assert.equal(report.summary.aiOverviewCitations, 1);
assert.equal(report.results[0].rankingUrl, 'https://www.framerestorationutah.com/locations/salt-lake-city');
assert.match(markdownReport(report), /^# Salt Lake City Google rank tracker — 2026-08-11/m);
assert.match(markdownReport(report), /fixed top-30 mobile panel/);

assert.throws(
  () => validateConfig({ ...config, keywords: [{ id: 'same', keyword: 'one' }, { id: 'same', keyword: 'two' }] }),
  /duplicate keyword id/,
);
assert.throws(() => buildReport(config, new Map()), /No complete provider result/);

const registryPath = path.join(REPO_ROOT, 'data', 'rank-tracker', 'panels.json');
const registry = validateRegistry(JSON.parse(fs.readFileSync(registryPath, 'utf8')));
const activePanels = registry.panels.filter((panel) => panel.status !== 'paused');
const expansionCities = new Set(registry.expansionCandidates.map((candidate) => candidate.city));
assert.equal(expansionCities.size, 12);
for (const candidate of registry.expansionCandidates) {
  assert.equal(candidate.status, 'pending-current-profile-service-area-verification');
  assert.ok(fs.existsSync(path.join(REPO_ROOT, `${candidate.route}.html`)), `missing expansion route: ${candidate.route}`);
}
const registryConfigs = activePanels.map((panel) => {
  const panelConfig = validateConfig(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, panel.configPath), 'utf8')));
  assert.equal(panelConfig.panelId, panel.id);
  assert.equal(panelConfig.target.gbpCid, registry.sourceOfTruth.profileCid);
  return panelConfig;
});
assert.equal(registryConfigs.length, 6);
assert.equal(registryConfigs.reduce((sum, panelConfig) => sum + panelConfig.keywords.length, 0), 24);
assert.ok(Math.abs(registryConfigs.reduce((sum, panelConfig) => sum + estimatedPanelCost(panelConfig), 0) - 0.0576) < Number.EPSILON);
assert.deepEqual(new Set(registryConfigs.map((panelConfig) => panelConfig.city)).size, 6);
assert.throws(
  () => validateRegistry({ ...registry, panels: [...registry.panels, registry.panels[0]] }),
  /duplicate panel id/,
);

console.log('dataforseo rank tracker: all assertions passed');
