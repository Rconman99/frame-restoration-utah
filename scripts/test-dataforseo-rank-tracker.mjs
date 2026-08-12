import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import {
  buildReport,
  buildTaskMatrix,
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
      references: [
        { url: 'https://competitor.example/slc', title: 'Competitor guide' },
        { url: 'https://www.framerestorationutah.com/locations/salt-lake-city', title: 'Frame SLC' },
      ],
    },
    {
      type: 'local_pack',
      rank_group: 1,
      cid: '111',
      title: 'Competitor Roofing',
      domain: 'competitor.example',
      is_paid: true,
    },
    {
      type: 'local_pack',
      rank_group: 2,
      cid: '5689850818145735734',
      title: 'Frame Restoration Utah LLC.',
      domain: 'framerestorationutah.com',
    },
    {
      type: 'organic',
      rank_group: 1,
      domain: 'competitor.example',
      url: 'https://competitor.example/slc',
      title: 'Competitor roofing page',
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
assert.equal(reading.mapPackRank, 1);
assert.equal(reading.aiOverviewPresent, true);
assert.equal(reading.aiOverviewCited, true);
assert.deepEqual(reading.organicLeaders, [{
  rank: 1,
  domain: 'competitor.example',
  url: 'https://competitor.example/slc',
  title: 'Competitor roofing page',
  isTarget: false,
}]);
assert.deepEqual(reading.mapPackLeaders.map(({ rank, name, cid, isTarget }) => ({ rank, name, cid, isTarget })), [
  { rank: 1, name: 'Frame Restoration Utah LLC.', cid: '5689850818145735734', isTarget: true },
]);
assert.deepEqual(reading.paidMapPackLeaders.map(({ rank, name, cid, isTarget }) => ({ rank, name, cid, isTarget })), [
  { rank: 1, name: 'Competitor Roofing', cid: '111', isTarget: false },
]);
assert.deepEqual(reading.aiOverviewSources.map(({ domain, isTarget }) => ({ domain, isTarget })), [
  { domain: 'competitor.example', isTarget: false },
  { domain: 'framerestorationutah.com', isTarget: true },
]);
assert.deepEqual(reading.serpFeatures, ['ai_overview', 'local_pack']);

assert.equal(extractRank(null, config.target).organicRank, null);
assert.equal(extractRank({ items: [{}] }, config.target).mapPackRank, null);
assert.equal(extractRank(fixture, { ...config.target, gbpCid: 'missing' }).mapPackRank, null);

const tasks = buildTasks(config);
assert.equal(tasks[0].location_name, 'Salt Lake City,Utah,United States');
assert.equal(tasks[0].device, 'mobile');
assert.equal(tasks[0].depth, 30);
assert.equal(tasks[0].tag, 'slc-repair');
assert.equal(buildTaskMatrix([config]).length, 1);
assert.throws(() => buildTaskMatrix([config, config]), /Duplicate keyword id across rank panels/);
assert.equal(estimatedPanelCost(config), 0.0024);

const report = buildReport(config, new Map([['slc-repair', fixture]]), '2026-08-11T20:04:27.000Z');
assert.equal(report.date, '2026-08-11');
assert.equal(report.city, 'Salt Lake City');
assert.equal(report.summary.organicRanked, 1);
assert.equal(report.summary.mapPackMatched, 1);
assert.equal(report.summary.aiOverviewCitations, 1);
assert.equal(report.results[0].rankingUrl, 'https://www.framerestorationutah.com/locations/salt-lake-city');
assert.match(markdownReport(report), /^# Salt Lake City Google rank tracker — 2026-08-11/m);
assert.match(markdownReport(report), /## Displacement targets/);
assert.match(markdownReport(report), /Organic top 3: #1 competitor\.example/);
assert.match(markdownReport(report), /Map-pack top 3: #1 Frame Restoration Utah LLC\. \[CID 5689850818145735734\] \(Frame\)/);
assert.match(markdownReport(report), /Paid local placements \(excluded from Maps rank\): #1 Competitor Roofing \[CID 111\]/);
assert.match(markdownReport(report), /fixed top-30 mobile panel/);

const nestedLocalPack = extractRank({
  items: [{
    type: 'local_pack',
    items: [
      { title: 'One Roofing', cid: 'one' },
      { title: 'Two Roofing', cid: '5689850818145735734' },
      { title: 'Three Roofing', cid: 'three' },
      { title: 'Four Roofing', cid: 'four' },
    ],
  }],
}, config.target);
assert.equal(nestedLocalPack.mapPackRank, 2);
assert.deepEqual(nestedLocalPack.mapPackLeaders.map(({ rank, name }) => ({ rank, name })), [
  { rank: 1, name: 'One Roofing' },
  { rank: 2, name: 'Two Roofing' },
  { rank: 3, name: 'Three Roofing' },
]);

const paidOnlyLocalPack = extractRank({ items: [{
  type: 'local_pack', title: 'Paid Roofer', cid: '5689850818145735734', is_paid: true,
}] }, config.target);
assert.equal(paidOnlyLocalPack.mapPackPresent, false);
assert.equal(paidOnlyLocalPack.mapPackRank, null, 'paid target placement must never satisfy the organic Maps goal');
assert.equal(paidOnlyLocalPack.paidMapPackPresent, true);
assert.equal(paidOnlyLocalPack.paidMapPackLeaders[0].isTarget, true);

const urlOnlyTarget = extractRank({ items: [{
  type: 'organic', rank_group: 1, url: 'https://www.framerestorationutah.com/locations/salt-lake-city', title: 'Frame',
}] }, config.target);
assert.equal(urlOnlyTarget.organicRank, 1);
assert.equal(urlOnlyTarget.organicLeaders[0].isTarget, true);

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
assert.equal(buildTaskMatrix(registryConfigs).length, 24);
assert.ok(Math.abs(registryConfigs.reduce((sum, panelConfig) => sum + estimatedPanelCost(panelConfig), 0) - 0.0576) < Number.EPSILON);
assert.deepEqual(new Set(registryConfigs.map((panelConfig) => panelConfig.city)).size, 6);
assert.throws(
  () => validateRegistry({ ...registry, panels: [...registry.panels, registry.panels[0]] }),
  /duplicate panel id/,
);

const expansionRegistryPath = path.join(REPO_ROOT, 'data', 'rank-tracker', 'expansion-panels.json');
const expansionRegistry = validateRegistry(JSON.parse(fs.readFileSync(expansionRegistryPath, 'utf8')));
const expansionConfigs = expansionRegistry.panels.map((panel) => {
  const panelConfig = validateConfig(JSON.parse(fs.readFileSync(path.join(REPO_ROOT, panel.configPath), 'utf8')));
  assert.equal(panelConfig.panelId, panel.id);
  assert.equal(panelConfig.target.gbpCid, registry.sourceOfTruth.profileCid);
  return panelConfig;
});
assert.equal(expansionConfigs.length, 12);
assert.equal(expansionConfigs.reduce((sum, panelConfig) => sum + panelConfig.keywords.length, 0), 48);
assert.equal(buildTaskMatrix(expansionConfigs).length, 48);
assert.ok(Math.abs(expansionConfigs.reduce((sum, panelConfig) => sum + estimatedPanelCost(panelConfig), 0) - 0.1152) < Number.EPSILON);
assert.equal(new Set(expansionConfigs.map((panelConfig) => panelConfig.city)).size, 12);

console.log('dataforseo rank tracker: all assertions passed');
