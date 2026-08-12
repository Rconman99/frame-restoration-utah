#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const programPath = path.join(
  repoRoot,
  "data/rank-tracker/SLV-CITY-GOAL-PROGRAM-2026-08-12.json",
);
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const currentText = fs.readFileSync(programPath, "utf8");
const current = JSON.parse(currentText);
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, current.authoritativeSources.googlePanelRegistry), "utf8"),
);
const registryByPanel = new Map(registry.panels.map((panel) => [panel.id, panel]));
const consumerAiPath = "data/rank-tracker/SLV-CONSUMER-AI-LATEST.json";
const consumerAi = JSON.parse(fs.readFileSync(path.join(repoRoot, consumerAiPath), "utf8"));
const consumerAiByCity = new Map(consumerAi.cities.map((city) => [city.city, city]));
const next = structuredClone(current);

let organicNumberOneQueries = 0;
let organicQueriesMeasured = 0;
let mapsNumberOneQueries = 0;
let mapsQueriesMeasured = 0;
let aiOverviewsPresent = 0;
let aiOverviewCitations = 0;
let latestGoogleObservedAt = "";

for (const track of next.cityTracks) {
  const registryPanel = registryByPanel.get(track.panelId);
  assert.ok(registryPanel, `unregistered panel: ${track.panelId}`);
  const rankSource = registryPanel.configPath.replace(/config\.json$/, "latest.json");
  const report = JSON.parse(fs.readFileSync(path.join(repoRoot, rankSource), "utf8"));
  assert.equal(report.panelId, track.panelId);
  assert.equal(report.city, track.city);
  assert.equal(report.results.length, next.fixedOrganicQueryIntents.length);

  track.rankSource = rankSource;
  track.organicRanks = report.results.map((result) => result.organicRank);
  track.exactCidMapsRanks = report.results.map((result) => result.mapPackRank);
  track.aiOverview = {
    present: report.summary.aiOverviewsPresent,
    ownedCitations: report.summary.aiOverviewCitations,
  };
  track.consumerAi = consumerAiByCity.get(track.city)?.state || track.consumerAi;

  organicNumberOneQueries += report.results.filter((result) => result.organicRank === 1).length;
  organicQueriesMeasured += report.results.length;
  mapsNumberOneQueries += report.results.filter((result) => result.mapPackRank === 1).length;
  mapsQueriesMeasured += report.results.length;
  aiOverviewsPresent += report.summary.aiOverviewsPresent;
  aiOverviewCitations += report.summary.aiOverviewCitations;
  if (report.observedAt > latestGoogleObservedAt) latestGoogleObservedAt = report.observedAt;
}

assert.equal(registryByPanel.size, next.cityTracks.length);
next.authoritativeSources.googlePanelObservedAt = latestGoogleObservedAt;
next.authoritativeSources.consumerAiLedger = consumerAiPath;
next.asOf = [next.asOf, latestGoogleObservedAt].sort().at(-1);
next.currentScore = {
  organicNumberOneQueries,
  organicQueriesMeasured,
  exactCidMapsNumberOneQueries: mapsNumberOneQueries,
  exactCidMapsQueriesMeasured: mapsQueriesMeasured,
  googleAiOverviewCitations: aiOverviewCitations,
  googleAiOverviewsPresent: aiOverviewsPresent,
  consumerAiCompleteCityPanels: next.cityTracks.filter((track) => consumerAiByCity.get(track.city)?.latest).length,
  citiesAtSustainedGoal: next.currentScore.citiesAtSustainedGoal,
  citiesTracked: next.cityTracks.length,
};
if (consumerAi.summary.citiesWithCompleteReading > 0) {
  next.programGates.consumerAiCredential = {
    status: "measurement-active",
    reason: "At least one complete nine-row ChatGPT/Perplexity/Gemini reading has been imported from the released tracker.",
    nextAction: "Continue the fixed weekly panels; missing or failed city panels remain unmeasured and cannot satisfy or fail the goal.",
  };
}

const nextText = `${JSON.stringify(next, null, 2)}\n`;
if (write) {
  fs.writeFileSync(programPath, nextText);
  console.log(
    `SYNC SLV city goal program: ${next.cityTracks.length} cities at ${latestGoogleObservedAt}`,
  );
} else if (check) {
  assert.equal(
    currentText,
    nextText,
    "SLV city goal program is stale; run npm run sync:slv-city-goals",
  );
  console.log(
    `PASS SLV city goal program sync: ${next.cityTracks.length} cities at ${latestGoogleObservedAt}`,
  );
}
