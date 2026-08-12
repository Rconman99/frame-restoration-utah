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
const expansionGoals = portfolio.cityGoals.filter((goal) => goal.cohort === "expansion-baseline-pending");
assert.equal(coreGoals.length, 6);
assert.equal(expansionGoals.length, 12);

const coreById = new Map(core.cityTracks.map((track) => [`slv-${track.slug}-number-one-v1`, track]));
for (const goal of coreGoals) {
  const track = coreById.get(goal.goalId);
  assert.ok(track, `unknown core goal: ${goal.goalId}`);
  assert.equal(goal.measurementStatus, "measured");
  assert.equal(goal.current.observedAt, core.authoritativeSources.googlePanelObservedAt);
  assert.deepEqual(goal.current.organicRanks, track.organicRanks);
  assert.deepEqual(goal.current.exactCidMapsRanks, track.exactCidMapsRanks);
  assert.deepEqual(goal.current.googleAiOverview, track.aiOverview);
  assert.equal(goal.current.consumerAi, track.consumerAi);
  assert.ok(fs.existsSync(path.join(root, goal.page)), `missing core page: ${goal.page}`);
}

const expansionById = new Map(expansionRegistry.panels.map((panel) => [panel.id, panel]));
for (const goal of expansionGoals) {
  const panel = expansionById.get(goal.panelId);
  assert.ok(panel, `unknown expansion panel: ${goal.panelId}`);
  assert.equal(goal.measurementStatus, "not-yet-measured");
  assert.equal(goal.current, null, `${goal.city} missing baseline must remain null, never zero`);
  assert.equal(goal.serviceAreaStatus, "pending-current-profile-service-area-verification");
  assert.equal(goal.page, `${panel.route.slice(1)}.html`);
  assert.ok(fs.existsSync(path.join(root, goal.page)), `missing expansion page: ${goal.page}`);
}

const score = portfolio.portfolioScore;
assert.deepEqual(score, {
  citiesInPortfolio: 18,
  citiesWithGoogleBaseline: 6,
  citiesPendingFirstGoogleBaseline: 12,
  fixedOrganicTargets: 72,
  fixedOrganicTargetsMeasured: core.currentScore.organicQueriesMeasured,
  fixedOrganicNumberOne: core.currentScore.organicNumberOneQueries,
  exactCidMapsTargets: 72,
  exactCidMapsTargetsMeasured: core.currentScore.exactCidMapsQueriesMeasured,
  exactCidMapsNumberOne: core.currentScore.exactCidMapsNumberOneQueries,
  googleAiOverviewCitations: core.currentScore.googleAiOverviewCitations,
  googleAiOverviewsPresent: core.currentScore.googleAiOverviewsPresent,
  consumerAiCompleteCityPanels: 0,
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

console.log("PASS SLV 18-city goal portfolio: 72 organic #1 targets, 72 exact-CID Maps #1 targets, 6 measured cities, 12 explicitly unmeasured baseline candidates, 0 sustained completions");
