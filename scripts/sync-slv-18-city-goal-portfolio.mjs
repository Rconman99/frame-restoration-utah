#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  baselineServiceAreaStatus,
  serviceAreaStatusFromReceipt,
  validateOwnerEvidenceReceipt,
} from "./lib/slv-gbp-owner-evidence.mjs";

const root = process.cwd();
const portfolioFile = path.join(root, "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const currentText = fs.readFileSync(portfolioFile, "utf8");
const next = JSON.parse(currentText);
const core = JSON.parse(fs.readFileSync(path.join(root, next.sources.coreGoalProgram), "utf8"));
const coreRegistry = JSON.parse(fs.readFileSync(path.join(root, next.sources.coreGoogleRegistry), "utf8"));
const expansion = JSON.parse(fs.readFileSync(path.join(root, next.sources.expansionGoogleRegistry), "utf8"));
const consumerAiPath = "data/rank-tracker/SLV-CONSUMER-AI-LATEST.json";
const consumerAi = JSON.parse(fs.readFileSync(path.join(root, consumerAiPath), "utf8"));
const consumerAiByCity = new Map(consumerAi.cities.map((city) => [city.city, city]));
const coreById = new Map(core.cityTracks.map((track) => [track.panelId, track]));
const corePanelById = new Map(coreRegistry.panels.map((panel) => [panel.id, panel]));
const expansionById = new Map(expansion.panels.map((panel) => [panel.id, panel]));
const ownerEvidence = JSON.parse(fs.readFileSync(path.join(root, next.sources.ownerViewGbpEvidence), "utf8"));
validateOwnerEvidenceReceipt(ownerEvidence, { expectedCities: next.cityGoals.map((goal) => goal.city) });
const serviceAreaByCity = new Map(ownerEvidence.serviceAreas.map((row) => [row.city, row]));

let expansionObservedAt = "";

for (const goal of next.cityGoals.filter((candidate) => candidate.priority < 6)) {
  const track = coreById.get(goal.panelId);
  const panel = corePanelById.get(goal.panelId);
  assert.ok(track, `unregistered core track: ${goal.panelId}`);
  assert.ok(panel, `unregistered core panel: ${goal.panelId}`);
  const rankSource = panel.configPath.replace(/config\.json$/, "latest.json");
  const report = JSON.parse(fs.readFileSync(path.join(root, rankSource), "utf8"));
  assert.equal(report.panelId, goal.panelId);
  assert.equal(report.city, goal.city);
  assert.equal(report.results.length, next.cityCompletionContract.organic.queries.length);

  goal.rankSource = rankSource;
  goal.current = {
    observedAt: report.observedAt,
    organicRanks: report.results.map((result) => result.organicRank),
    selectedOrganicUrls: report.results.map((result) => result.rankingUrl),
    exactCidMapsRanks: report.results.map((result) => result.mapPackRank),
    googleAiOverview: {
      present: report.summary.aiOverviewsPresent,
      ownedCitations: report.summary.aiOverviewCitations,
    },
    consumerAi: consumerAiByCity.get(goal.city)?.state || track.consumerAi,
  };
  goal.serviceAreaStatus = serviceAreaStatusFromReceipt(
    baselineServiceAreaStatus(goal),
    serviceAreaByCity.get(goal.city),
  );
}

for (const goal of next.cityGoals.filter((candidate) => candidate.priority >= 6)) {
  const panel = expansionById.get(goal.panelId);
  assert.ok(panel, `unregistered expansion panel: ${goal.panelId}`);
  const rankSource = panel.configPath.replace(/config\.json$/, "latest.json");
  const report = JSON.parse(fs.readFileSync(path.join(root, rankSource), "utf8"));
  assert.equal(report.panelId, goal.panelId);
  assert.equal(report.city, goal.city);
  assert.equal(report.results.length, next.cityCompletionContract.organic.queries.length);

  goal.cohort = "expansion-manual-baseline-measured";
  goal.measurementStatus = "measured-not-yet-admitted-to-weekly-spend";
  goal.rankSource = rankSource;
  goal.current = {
    observedAt: report.observedAt,
    organicRanks: report.results.map((result) => result.organicRank),
    selectedOrganicUrls: report.results.map((result) => result.rankingUrl),
    exactCidMapsRanks: report.results.map((result) => result.mapPackRank),
    googleAiOverview: {
      present: report.summary.aiOverviewsPresent,
      ownedCitations: report.summary.aiOverviewCitations,
    },
    consumerAi: consumerAiByCity.get(goal.city)?.state || "configured-manual-unmeasured-invalid-provider-credential",
  };
  goal.serviceAreaStatus = serviceAreaStatusFromReceipt(
    baselineServiceAreaStatus(goal),
    serviceAreaByCity.get(goal.city),
  );
  goal.phase = "integrity-and-service-area-evidence-before-weekly-admission";
  goal.nextPermittedAction = "Preserve measured organic and AIO footholds, complete evidence-safe integrity diagnosis, and verify current profile service-area evidence; do not edit public pages or assert a city GBP without explicit approval.";

  if (report.observedAt > expansionObservedAt) expansionObservedAt = report.observedAt;
}

assert.equal(expansionById.size, 12);
assert.equal(corePanelById.size, 6);
assert.equal(consumerAiByCity.size, 18);
const organicTargetsMeasured = next.cityGoals.reduce((sum, goal) => sum + goal.current.organicRanks.length, 0);
const organicNumberOne = next.cityGoals.reduce((sum, goal) => sum + goal.current.organicRanks.filter((rank) => rank === 1).length, 0);
const mapsTargetsMeasured = next.cityGoals.reduce((sum, goal) => sum + goal.current.exactCidMapsRanks.length, 0);
const mapsNumberOne = next.cityGoals.reduce((sum, goal) => sum + goal.current.exactCidMapsRanks.filter((rank) => rank === 1).length, 0);
const aioPresent = next.cityGoals.reduce((sum, goal) => sum + goal.current.googleAiOverview.present, 0);
const aioCited = next.cityGoals.reduce((sum, goal) => sum + goal.current.googleAiOverview.ownedCitations, 0);
next.sources.expansionPanelObservedAt = expansionObservedAt;
next.sources.consumerAiLedger = consumerAiPath;
next.gates.businessDriveEvidence = ownerEvidence.status === "MEASURED_EXACT_CID_OWNER_VIEW"
  ? ownerEvidence.summary.knownProfileFields === 12 && ownerEvidence.summary.unknown === 0
    ? "business-account-search-and-current-owner-view-gbp-proof-complete"
    : "business-account-search-complete-partial-current-owner-view-gbp-proof-registered"
  : "business-account-search-complete-current-owner-view-gbp-proof-required";
next.cohorts.expansion.state = "first-manual-baseline-measured-not-yet-admitted-to-weekly-spend";
next.portfolioScore = {
  citiesInPortfolio: next.cityGoals.length,
  citiesWithGoogleBaseline: next.cityGoals.filter((goal) => goal.current?.observedAt).length,
  citiesPendingFirstGoogleBaseline: next.cityGoals.filter((goal) => !goal.current?.observedAt).length,
  fixedOrganicTargets: next.cityGoals.length * next.cityCompletionContract.organic.queries.length,
  fixedOrganicTargetsMeasured: organicTargetsMeasured,
  fixedOrganicNumberOne: organicNumberOne,
  exactCidMapsTargets: next.cityGoals.length * next.cityCompletionContract.maps.queries.length,
  exactCidMapsTargetsMeasured: mapsTargetsMeasured,
  exactCidMapsNumberOne: mapsNumberOne,
  googleAiOverviewCitations: aioCited,
  googleAiOverviewsPresent: aioPresent,
  consumerAiCompleteCityPanels: consumerAi.summary.citiesWithCompleteReading,
  citiesAtSustainedGoal: 0,
};

const nextText = `${JSON.stringify(next, null, 2)}\n`;
if (write) {
  fs.writeFileSync(portfolioFile, nextText);
  console.log(`SYNC SLV 18-city portfolio: 18/18 Google baselines at ${expansionObservedAt}, organic #1 ${next.portfolioScore.fixedOrganicNumberOne}/72, exact-CID Maps #1 ${next.portfolioScore.exactCidMapsNumberOne}/72`);
} else if (check) {
  assert.equal(currentText, nextText, "SLV 18-city goal portfolio is stale; run npm run sync:slv-18-city-goals");
  console.log(`PASS SLV 18-city portfolio sync: 18/18 Google baselines, organic #1 ${next.portfolioScore.fixedOrganicNumberOne}/72, exact-CID Maps #1 ${next.portfolioScore.exactCidMapsNumberOne}/72`);
}
