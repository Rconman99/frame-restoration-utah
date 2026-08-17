#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-COMPETITOR-DISPLACEMENT-2026-08-12.json";
const registries = [
  { cohort: "core-weekly", file: "data/rank-tracker/panels.json" },
  { cohort: "expansion-manual-baseline", file: "data/rank-tracker/expansion-panels.json" },
];
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) =>
  crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const increment = (map, key, sample, field = "appearances") => {
  if (!key) return;
  const row = map.get(key) || { ...sample, [field]: 0 };
  row[field] += 1;
  map.set(key, row);
};
const sortCounts = (rows, countField) =>
  [...rows].sort((a, b) => b[countField] - a[countField] || String(a.name || a.domain).localeCompare(String(b.name || b.domain)));

const sourceReports = [];
const queries = [];

for (const registryRef of registries) {
  const registry = read(registryRef.file);
  for (const panel of registry.panels) {
    const configDir = path.posix.dirname(panel.configPath);
    const reportPath = path.posix.join(configDir, "latest.json");
    const report = read(reportPath);
    const config = read(panel.configPath);
    assert.equal(report.panelId, panel.id, `panel/report mismatch: ${panel.id}`);
    assert.equal(report.city, config.city, `city mismatch: ${panel.id}`);
    assert.equal(report.results.length, 4, `fixed query count mismatch: ${panel.id}`);
    sourceReports.push({
      cohort: registryRef.cohort,
      city: report.city,
      panelId: panel.id,
      file: reportPath,
      sha256: sha256(reportPath),
      observedAt: report.observedAt,
    });
    for (const result of report.results) {
      const topOrganic = result.organicLeaders[0] || null;
      const topMap = result.mapPackLeaders[0] || null;
      const rivalAioSources = result.aiOverviewSources.filter((source) => !source.isTarget);
      queries.push({
        cohort: registryRef.cohort,
        city: report.city,
        panelId: panel.id,
        queryId: result.id,
        keyword: result.keyword,
        target: {
          organicRank: result.organicRank,
          rankingUrl: result.rankingUrl,
          exactCidMapRank: result.mapPackRank,
          aiOverviewCited: result.aiOverviewCited,
        },
        surfaces: {
          organic: {
            state: result.organicRank === 1 ? "protected-target-number-one" : result.organicRank === null ? "target-outside-measured-depth" : "target-displaced",
            top: topOrganic,
            leaders: result.organicLeaders,
          },
          maps: {
            state: !result.mapPackPresent ? "local-pack-not-present" : result.mapPackRank === 1 ? "protected-exact-cid-number-one" : result.mapPackRank === null ? "exact-cid-not-returned-in-pack" : "exact-cid-displaced",
            packPresent: result.mapPackPresent,
            top: topMap,
            leaders: result.mapPackLeaders,
          },
          googleAiOverview: {
            state: !result.aiOverviewPresent ? "not-present" : result.aiOverviewCited ? "present-and-frame-cited" : "present-without-frame-citation",
            rivalSources: rivalAioSources,
          },
        },
      });
    }
  }
}

const organicTop = new Map();
const organicTopThree = new Map();
const mapsTop = new Map();
const mapsTopThree = new Map();
const aioRivals = new Map();
for (const query of queries) {
  const organic = query.surfaces.organic;
  if (organic.top && !organic.top.isTarget) {
    increment(organicTop, organic.top.domain, { domain: organic.top.domain, sampleUrl: organic.top.url, sampleTitle: organic.top.title }, "numberOneQueries");
  }
  for (const leader of organic.leaders.filter((row) => !row.isTarget)) {
    increment(organicTopThree, leader.domain, { domain: leader.domain, sampleUrl: leader.url, sampleTitle: leader.title }, "topThreeAppearances");
  }
  const maps = query.surfaces.maps;
  if (maps.top && !maps.top.isTarget) {
    const key = maps.top.cid || `${maps.top.name}|${maps.top.domain}`;
    increment(mapsTop, key, { name: maps.top.name, cid: maps.top.cid, domain: maps.top.domain }, "numberOnePacks");
  }
  for (const leader of maps.leaders.filter((row) => !row.isTarget)) {
    const key = leader.cid || `${leader.name}|${leader.domain}`;
    increment(mapsTopThree, key, { name: leader.name, cid: leader.cid, domain: leader.domain }, "topThreeAppearances");
  }
  for (const source of query.surfaces.googleAiOverview.rivalSources) {
    increment(aioRivals, source.domain, { domain: source.domain, sampleUrl: source.url, sampleTitle: source.title }, "sourceAppearances");
  }
}

const count = (predicate) => queries.filter(predicate).length;
const organicNumberOne = count((row) => row.target.organicRank === 1);
const exactCidMapsNumberOne = count((row) => row.target.exactCidMapRank === 1);
const aiOverviewsPresent = count((row) => row.surfaces.googleAiOverview.state !== "not-present");
const aiOverviewCitations = count((row) => row.target.aiOverviewCited);
const ledger = {
  schemaVersion: 1,
  ledgerId: "frame-utah-slv-18-city-competitor-displacement-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T18:20:00.000Z",
  status: "measured-diagnosis-only-no-public-authorization",
  publicMutationPerformed: false,
  objective: "Identify the pages, entities, and cited domains currently occupying the 18-city fixed Google panels so future evidence-safe work targets measured displacement rather than generic SEO activity.",
  scope: {
    cities: sourceReports.length,
    queries: queries.length,
    device: "mobile",
    os: "android",
    depth: 30,
    exactCid: "5689850818145735734",
    sourceReports,
  },
  score: {
    organicNumberOne,
    organicDisplacedOrOutsideDepth: queries.length - organicNumberOne,
    organicOutsideMeasuredDepth: count((row) => row.target.organicRank === null),
    mapsPacksPresent: count((row) => row.surfaces.maps.packPresent),
    mapsPacksAbsent: count((row) => !row.surfaces.maps.packPresent),
    exactCidMapsNumberOne,
    exactCidNotNumberOne: queries.length - exactCidMapsNumberOne,
    googleAiOverviewsPresent: aiOverviewsPresent,
    googleAiOverviewCitations: aiOverviewCitations,
    googleAiOverviewsWithoutFrameCitation: aiOverviewsPresent - aiOverviewCitations,
  },
  recurringDisplacers: {
    organicNumberOneDomains: sortCounts(organicTop.values(), "numberOneQueries"),
    organicTopThreeDomains: sortCounts(organicTopThree.values(), "topThreeAppearances"),
    mapsNumberOneEntities: sortCounts(mapsTop.values(), "numberOnePacks"),
    mapsTopThreeEntities: sortCounts(mapsTopThree.values(), "topThreeAppearances"),
    googleAiOverviewRivalSourceDomains: sortCounts(aioRivals.values(), "sourceAppearances"),
  },
  decisionRules: [
    "Protect a target #1 result before changing its page; Kearns and Magna roof-replacement wins remain preservation baselines.",
    "A top organic directory, manufacturer directory, editorial page, or community result is displacement evidence, not permission to spam, fabricate participation, or copy the page.",
    "A competing Maps entity is measurement evidence only; this ledger does not authorize GBP, review, directory, service-area, or NAP mutations.",
    "An absent local pack is not a target Maps rank of zero, and a target outside depth 30 is not an invented exact organic rank.",
    "Use exact targeted GSC URL attribution, integrity cleanup, city evidence, and source-backed content analysis before selecting a single-variable page experiment.",
    "Any public experiment requires its own approval, isolated commit, full source/preview/production gates, weekly remeasurement, and a 28-day keep/revert verdict."
  ],
  nextUse: {
    protect: queries.filter((row) => row.target.organicRank === 1).map((row) => ({ city: row.city, keyword: row.keyword, rankingUrl: row.target.rankingUrl })),
    investigateAfterIntegrityCleanup: "Compare recurring direct competitors and source types against each approved city page using factual local proof, schema/NAP parity, and existing route architecture; do not make generic multi-page rewrites.",
    consumerAiGap: "ChatGPT, Perplexity, and Gemini displacement remains unmeasured until the invalid provider credential is replaced with a valid secret.",
  },
  queries,
};

assert.equal(ledger.scope.cities, 18);
assert.equal(ledger.scope.queries, 72);
// SERP-observed, not config. These five are count() over the measured rows, so
// they move whenever Google moves. Freezing them to one day's reading meant a
// complete, paid-for 24/24 matrix was discarded on 2026-08-17 because
// googleAiOverviewsPresent came back 3 instead of 4 -- a normal change in the
// world, not a defect. Bound them and surface the values instead.
//
// The two relationships below are real invariants the frozen equalities never
// actually checked, so this is a stricter gate on correctness and a looser one
// on false precision.
const observedScore = {
  organicNumberOne: ledger.score.organicNumberOne,
  exactCidMapsNumberOne: ledger.score.exactCidMapsNumberOne,
  googleAiOverviewsPresent: ledger.score.googleAiOverviewsPresent,
  googleAiOverviewCitations: ledger.score.googleAiOverviewCitations,
  protectedQueries: ledger.nextUse.protect.length,
};
for (const [key, value] of Object.entries(observedScore)) {
  assert.ok(
    Number.isInteger(value) && value >= 0 && value <= ledger.scope.queries,
    `${key} must be an integer within 0..${ledger.scope.queries}, got ${value}`,
  );
}
assert.ok(
  observedScore.googleAiOverviewCitations <= observedScore.googleAiOverviewsPresent,
  `cannot cite more AI Overviews (${observedScore.googleAiOverviewCitations}) than were present (${observedScore.googleAiOverviewsPresent})`,
);
assert.equal(
  observedScore.protectedQueries,
  observedScore.organicNumberOne,
  "the protect list must contain exactly the organic #1 queries",
);
console.log(`SLV displacement observed: ${JSON.stringify(observedScore)}`);
assert.ok(ledger.recurringDisplacers.organicNumberOneDomains.length > 0);
assert.ok(ledger.recurringDisplacers.mapsNumberOneEntities.length > 0);
assert.ok(ledger.queries.every((row) => row.surfaces.organic.top || row.target.organicRank === 1));

const nextText = `${JSON.stringify(ledger, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV displacement ledger: ${ledger.scope.cities} cities, ${ledger.scope.queries} queries, ${ledger.score.organicNumberOne} organic #1, ${ledger.score.exactCidMapsNumberOne} exact-CID Maps #1`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV displacement ledger is stale; run npm run sync:slv-competitor-displacement");
  console.log(`PASS SLV displacement ledger: ${ledger.scope.cities} cities, ${ledger.scope.queries} queries, organic #1 ${ledger.score.organicNumberOne}/72, exact-CID Maps #1 ${ledger.score.exactCidMapsNumberOne}/72`);
}
