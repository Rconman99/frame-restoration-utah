#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const portfolio = read("data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json");
const core = read(portfolio.sources.coreGoalProgram);
const coreRegistry = read(portfolio.sources.coreGoogleRegistry);
const expansionRegistry = read(portfolio.sources.expansionGoogleRegistry);
const expansionIntegrity = read(portfolio.sources.expansionIntegrityAudit);
const consumerAi = read(portfolio.sources.consumerAiLedger);
const consumerAiByCity = new Map(consumerAi.cities.map((city) => [city.city, city]));

assert.equal(portfolio.schemaVersion, 1);
assert.equal(portfolio.status, "active-not-achieved");
assert.equal(portfolio.publicMutationPerformed, false);
assert.equal(portfolio.cityGoals.length, 18);
assert.equal(new Set(portfolio.cityGoals.map((goal) => goal.city)).size, 18);
assert.equal(new Set(portfolio.cityGoals.map((goal) => goal.goalId)).size, 18);
assert.deepEqual(portfolio.cityGoals.map((goal) => goal.priority), Array.from({ length: 18 }, (_, index) => index));

const completion = portfolio.cityCompletionContract;
assert.equal(completion.organic.targetRank, 1);
assert.equal(completion.maps.targetRank, 1);
assert.equal(completion.maps.exactCid, coreRegistry.sourceOfTruth.profileCid);
assert.equal(completion.organic.requiredConsecutiveWeeklyPanels, 4);
assert.equal(completion.maps.requiredConsecutiveWeeklyPanels, 4);
assert.equal(completion.googleAiOverview.requiredConsecutiveWeeklyPanels, 4);
assert.equal(completion.consumerAi.requiredConsecutiveWeeklyPanels, 4);
assert.deepEqual(completion.organic.queries, core.fixedOrganicQueryIntents);
assert.deepEqual(completion.consumerAi.engines, ["chatgpt", "perplexity", "gemini"]);
assert.match(completion.completion, /same uncontaminated 28-day window/i);

const coreGoals = portfolio.cityGoals.filter((goal) => goal.cohort === "core-measured");
const expansionGoals = portfolio.cityGoals.filter((goal) => goal.cohort === "expansion-manual-baseline-measured");
assert.equal(coreGoals.length, 6);
assert.equal(expansionGoals.length, 12);

const coreById = new Map(core.cityTracks.map((track) => [`slv-${track.slug}-number-one-v1`, track]));
for (const goal of coreGoals) {
  const track = coreById.get(goal.goalId);
  assert.ok(track, `unknown core goal: ${goal.goalId}`);
  const panel = coreRegistry.panels.find((candidate) => candidate.id === goal.panelId);
  assert.ok(panel, `unknown core panel: ${goal.panelId}`);
  const rankSource = panel.configPath.replace(/config\.json$/, "latest.json");
  const report = read(rankSource);
  assert.equal(goal.measurementStatus, "measured");
  assert.equal(goal.rankSource, rankSource);
  assert.equal(goal.current.observedAt, report.observedAt);
  assert.deepEqual(goal.current.organicRanks, report.results.map((result) => result.organicRank));
  assert.deepEqual(goal.current.selectedOrganicUrls, report.results.map((result) => result.rankingUrl));
  assert.deepEqual(goal.current.exactCidMapsRanks, report.results.map((result) => result.mapPackRank));
  assert.deepEqual(goal.current.googleAiOverview, {
    present: report.summary.aiOverviewsPresent,
    ownedCitations: report.summary.aiOverviewCitations,
  });
  assert.equal(goal.current.consumerAi, consumerAiByCity.get(goal.city).state);
  assert.ok(fs.existsSync(path.join(root, goal.page)), `missing core page: ${goal.page}`);
}

const expansionById = new Map(expansionRegistry.panels.map((panel) => [panel.id, panel]));
for (const goal of expansionGoals) {
  const panel = expansionById.get(goal.panelId);
  assert.ok(panel, `unknown expansion panel: ${goal.panelId}`);
  assert.equal(goal.measurementStatus, "measured-not-yet-admitted-to-weekly-spend");
  const rankSource = panel.configPath.replace(/config\.json$/, "latest.json");
  const report = read(rankSource);
  assert.equal(goal.rankSource, rankSource);
  assert.equal(goal.current.observedAt, report.observedAt);
  assert.deepEqual(goal.current.organicRanks, report.results.map((result) => result.organicRank));
  assert.deepEqual(goal.current.selectedOrganicUrls, report.results.map((result) => result.rankingUrl));
  assert.deepEqual(goal.current.exactCidMapsRanks, report.results.map((result) => result.mapPackRank));
  assert.deepEqual(goal.current.googleAiOverview, {
    present: report.summary.aiOverviewsPresent,
    ownedCitations: report.summary.aiOverviewCitations,
  });
  assert.equal(goal.current.consumerAi, consumerAiByCity.get(goal.city).state);
  assert.equal(goal.serviceAreaStatus, "pending-current-profile-service-area-verification");
  assert.equal(goal.page, `${panel.route.slice(1)}.html`);
  assert.ok(fs.existsSync(path.join(root, goal.page)), `missing expansion page: ${goal.page}`);
}

const score = portfolio.portfolioScore;
const organicNumberOne = portfolio.cityGoals.reduce((sum, goal) => sum + goal.current.organicRanks.filter((rank) => rank === 1).length, 0);
const mapsNumberOne = portfolio.cityGoals.reduce((sum, goal) => sum + goal.current.exactCidMapsRanks.filter((rank) => rank === 1).length, 0);
const aioPresent = portfolio.cityGoals.reduce((sum, goal) => sum + goal.current.googleAiOverview.present, 0);
const aioCited = portfolio.cityGoals.reduce((sum, goal) => sum + goal.current.googleAiOverview.ownedCitations, 0);
assert.deepEqual(score, {
  citiesInPortfolio: 18,
  citiesWithGoogleBaseline: 18,
  citiesPendingFirstGoogleBaseline: 0,
  fixedOrganicTargets: 72,
  fixedOrganicTargetsMeasured: 72,
  fixedOrganicNumberOne: organicNumberOne,
  exactCidMapsTargets: 72,
  exactCidMapsTargetsMeasured: 72,
  exactCidMapsNumberOne: mapsNumberOne,
  googleAiOverviewCitations: aioCited,
  googleAiOverviewsPresent: aioPresent,
  consumerAiCompleteCityPanels: consumerAi.summary.citiesWithCompleteReading,
  citiesAtSustainedGoal: 0,
});
assert.equal(portfolio.cohorts.expansion.estimatedOneTimeBaselineCostUsd, 0.1152);
assert.equal(portfolio.gates.expansionAdmission, "manual-baseline-plus-city-integrity-and-service-area-evidence-before-recurring-spend");
assert.equal(expansionIntegrity.summary.checkedPages, 12);
assert.equal(expansionIntegrity.summary.blockingFindingClasses, 73);
assert.equal(expansionIntegrity.summary.provisionalWarningClasses, 12);
assert.equal(expansionIntegrity.summary.pagesWithHeberKeystone, 12);
assert.match(portfolio.gates.expansionIntegrity, /^73-blocking-finding-classes/);
assert.ok(portfolio.prohibited.includes("treating an unmeasured expansion city as zero"));
assert.ok(portfolio.prohibited.some((rule) => rule.includes("18-city portfolio complete")));

console.log(`PASS SLV 18-city goal portfolio: 72 organic #1 targets, 72 exact-CID Maps #1 targets, 18 measured cities, organic #1 ${organicNumberOne}/72, Maps #1 ${mapsNumberOne}/72, ${score.citiesAtSustainedGoal} sustained completions`);
