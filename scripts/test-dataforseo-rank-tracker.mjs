import assert from 'node:assert/strict';

import {
  buildReport,
  buildTasks,
  estimatedPanelCost,
  extractRank,
  validateConfig,
} from './dataforseo-rank-tracker.mjs';

const config = validateConfig({
  schemaVersion: 1,
  panelId: 'test-panel',
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
assert.equal(report.summary.organicRanked, 1);
assert.equal(report.summary.mapPackMatched, 1);
assert.equal(report.summary.aiOverviewCitations, 1);
assert.equal(report.results[0].rankingUrl, 'https://www.framerestorationutah.com/locations/salt-lake-city');

assert.throws(
  () => validateConfig({ ...config, keywords: [{ id: 'same', keyword: 'one' }, { id: 'same', keyword: 'two' }] }),
  /duplicate keyword id/,
);
assert.throws(() => buildReport(config, new Map()), /No complete provider result/);

console.log('dataforseo rank tracker: all assertions passed');
