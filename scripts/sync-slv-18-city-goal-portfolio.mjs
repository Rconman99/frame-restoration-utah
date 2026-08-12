#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const portfolioFile = path.join(root, "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const currentText = fs.readFileSync(portfolioFile, "utf8");
const next = JSON.parse(currentText);
const core = JSON.parse(fs.readFileSync(path.join(root, next.sources.coreGoalProgram), "utf8"));
const expansion = JSON.parse(fs.readFileSync(path.join(root, next.sources.expansionGoogleRegistry), "utf8"));
const expansionById = new Map(expansion.panels.map((panel) => [panel.id, panel]));

let expansionOrganicNumberOne = 0;
let expansionOrganicMeasured = 0;
let expansionMapsNumberOne = 0;
let expansionMapsMeasured = 0;
let expansionAioPresent = 0;
let expansionAioCited = 0;
let expansionObservedAt = "";

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
    consumerAi: "configured-manual-measurement-only-blocked-invalid-provider-credential",
  };
  goal.phase = "integrity-and-service-area-evidence-before-weekly-admission";
  goal.nextPermittedAction = "Preserve measured organic and AIO footholds, complete evidence-safe integrity diagnosis, and verify current profile service-area evidence; do not edit public pages or assert a city GBP without explicit approval.";

  expansionOrganicNumberOne += report.results.filter((result) => result.organicRank === 1).length;
  expansionOrganicMeasured += report.results.length;
  expansionMapsNumberOne += report.results.filter((result) => result.mapPackRank === 1).length;
  expansionMapsMeasured += report.results.length;
  expansionAioPresent += report.summary.aiOverviewsPresent;
  expansionAioCited += report.summary.aiOverviewCitations;
  if (report.observedAt > expansionObservedAt) expansionObservedAt = report.observedAt;
}

assert.equal(expansionById.size, 12);
next.sources.expansionPanelObservedAt = expansionObservedAt;
next.cohorts.expansion.state = "first-manual-baseline-measured-not-yet-admitted-to-weekly-spend";
next.portfolioScore = {
  citiesInPortfolio: next.cityGoals.length,
  citiesWithGoogleBaseline: next.cityGoals.filter((goal) => goal.current?.observedAt).length,
  citiesPendingFirstGoogleBaseline: next.cityGoals.filter((goal) => !goal.current?.observedAt).length,
  fixedOrganicTargets: next.cityGoals.length * next.cityCompletionContract.organic.queries.length,
  fixedOrganicTargetsMeasured: core.currentScore.organicQueriesMeasured + expansionOrganicMeasured,
  fixedOrganicNumberOne: core.currentScore.organicNumberOneQueries + expansionOrganicNumberOne,
  exactCidMapsTargets: next.cityGoals.length * next.cityCompletionContract.maps.queries.length,
  exactCidMapsTargetsMeasured: core.currentScore.exactCidMapsQueriesMeasured + expansionMapsMeasured,
  exactCidMapsNumberOne: core.currentScore.exactCidMapsNumberOneQueries + expansionMapsNumberOne,
  googleAiOverviewCitations: core.currentScore.googleAiOverviewCitations + expansionAioCited,
  googleAiOverviewsPresent: core.currentScore.googleAiOverviewsPresent + expansionAioPresent,
  consumerAiCompleteCityPanels: 0,
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
