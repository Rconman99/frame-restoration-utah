#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = process.cwd();
const programPath = path.join(
  repoRoot,
  "data/rank-tracker/SLV-CITY-GOAL-PROGRAM-2026-08-12.json",
);
const program = JSON.parse(fs.readFileSync(programPath, "utf8"));
const registry = JSON.parse(
  fs.readFileSync(path.join(repoRoot, program.authoritativeSources.googlePanelRegistry), "utf8"),
);
const integrityContract = JSON.parse(
  fs.readFileSync(path.join(repoRoot, program.authoritativeSources.integrityContract), "utf8"),
);
const consumerAi = JSON.parse(fs.readFileSync(path.join(repoRoot, program.authoritativeSources.consumerAiLedger), "utf8"));
const consumerAiByCity = new Map(consumerAi.cities.map((city) => [city.city, city]));

assert.equal(program.schemaVersion, 1);
assert.equal(program.status, "active-not-achieved");
assert.equal(program.goal.organic.targetRank, 1);
assert.equal(program.goal.maps.targetRank, 1);
assert.equal(program.goal.maps.exactCid, registry.sourceOfTruth.profileCid);
assert.deepEqual(program.goal.answerEngines.consumerEngines, [
  "chatgpt",
  "perplexity",
  "gemini",
]);
assert.equal(program.fixedOrganicQueryIntents.length, 4);
assert.equal(program.cityTracks.length, 6);
assert.equal(new Set(program.cityTracks.map((track) => track.city)).size, 6);
assert.equal(new Set(program.cityTracks.map((track) => track.panelId)).size, 6);
assert.deepEqual(
  program.cityTracks.map((track) => track.priority),
  [0, 1, 2, 3, 4, 5],
);

const registryByPanel = new Map(registry.panels.map((panel) => [panel.id, panel]));
let organicNumberOneQueries = 0;
let organicQueriesMeasured = 0;
let mapsNumberOneQueries = 0;
let mapsQueriesMeasured = 0;
let aiOverviewsPresent = 0;
let aiOverviewCitations = 0;

for (const track of program.cityTracks) {
  const registryPanel = registryByPanel.get(track.panelId);
  assert.ok(registryPanel, `unregistered panel: ${track.panelId}`);
  assert.equal(
    track.identityEvidence,
    registryPanel.evidenceClass,
    `${track.city} identity evidence drift`,
  );
  assert.equal(track.rankSource, registryPanel.configPath.replace(/config\.json$/, "latest.json"));
  assert.ok(fs.existsSync(path.join(repoRoot, track.page)), `missing city page: ${track.page}`);

  const report = JSON.parse(fs.readFileSync(path.join(repoRoot, track.rankSource), "utf8"));
  assert.equal(report.panelId, track.panelId);
  assert.equal(report.city, track.city);
  assert.equal(report.results.length, program.fixedOrganicQueryIntents.length);
  assert.deepEqual(
    track.organicRanks,
    report.results.map((result) => result.organicRank),
    `${track.city} organic ranks drifted from latest fixed panel`,
  );
  assert.deepEqual(
    track.exactCidMapsRanks,
    report.results.map((result) => result.mapPackRank),
    `${track.city} exact-CID Maps ranks drifted from latest fixed panel`,
  );
  assert.deepEqual(track.aiOverview, {
    present: report.summary.aiOverviewsPresent,
    ownedCitations: report.summary.aiOverviewCitations,
  });
  assert.equal(track.consumerAi, consumerAiByCity.get(track.city).state);

  organicNumberOneQueries += report.results.filter((result) => result.organicRank === 1).length;
  organicQueriesMeasured += report.results.length;
  mapsNumberOneQueries += report.results.filter((result) => result.mapPackRank === 1).length;
  mapsQueriesMeasured += report.results.length;
  aiOverviewsPresent += report.summary.aiOverviewsPresent;
  aiOverviewCitations += report.summary.aiOverviewCitations;
}

assert.equal(registryByPanel.size, program.cityTracks.length);
const pendingServiceAreaCities = new Set(
  integrityContract.identity.measurementOnlyPendingServiceAreaEvidence.map((file) =>
    path.basename(file, ".html"),
  ),
);
for (const track of program.cityTracks) {
  if (pendingServiceAreaCities.has(track.slug)) {
    assert.equal(
      track.serviceAreaStatus,
      "pending-current-profile-service-area-verification",
      `${track.city} must remain measurement-only until current profile evidence is registered`,
    );
  }
}
assert.equal(
  program.cityTracks.find((track) => track.slug === "salt-lake-city")?.serviceAreaStatus,
  "verified-profile-identity-city",
);
assert.equal(
  program.cityTracks.find((track) => track.slug === "millcreek")?.serviceAreaStatus,
  "saved-service-area-observed",
);
assert.deepEqual(program.currentScore, {
  organicNumberOneQueries,
  organicQueriesMeasured,
  exactCidMapsNumberOneQueries: mapsNumberOneQueries,
  exactCidMapsQueriesMeasured: mapsQueriesMeasured,
  googleAiOverviewCitations: aiOverviewCitations,
  googleAiOverviewsPresent: aiOverviewsPresent,
  consumerAiCompleteCityPanels: program.cityTracks.filter((track) => consumerAiByCity.get(track.city).latest).length,
  citiesAtSustainedGoal: 0,
  citiesTracked: program.cityTracks.length,
});

assert.equal(
  program.programGates.publicCityPages.status,
  "explicit-owner-approval-required",
);
assert.deepEqual(
  new Set(program.programGates.publicCityPages.affectedCities),
  new Set(integrityContract.targetPages.map((file) => path.basename(file, ".html").split("-").map((word) => word[0].toUpperCase() + word.slice(1)).join(" "))),
);
assert.equal(integrityContract.releaseGate.requiresExplicitOwnerApproval, true);
assert.equal(program.programGates.businessDrive.status, "owner-action-required");
assert.equal(program.authoritativeSources.businessDriveAudit.acceptedPrimaryEvidenceCount, 0);
assert.equal(program.authoritativeSources.businessDriveAudit.driveMutations, 0);
if (consumerAi.summary.citiesWithCompleteReading > 0) {
  assert.equal(program.programGates.consumerAiCredential.status, "measurement-active");
} else {
  assert.equal(program.programGates.consumerAiCredential.status, "owner-action-required");
  assert.match(program.programGates.consumerAiCredential.reason, /401/);
}
assert.equal(program.programGates.saltLakeCityObservation.status, "hold");

const integrityRun = spawnSync(
  process.execPath,
  ["scripts/audit-slv-city-integrity.mjs"],
  { cwd: repoRoot, encoding: "utf8" },
);
assert.equal(integrityRun.status, 0, integrityRun.stderr);
const summaryMatch = integrityRun.stdout.match(/\{\s*"checkedPages"[\s\S]*?\n\}/u);
assert.ok(summaryMatch, "integrity report summary missing");
const integritySummary = JSON.parse(summaryMatch[0]);
assert.equal(integritySummary.checkedPages, integrityContract.targetPages.length);
assert.equal(
  program.programGates.publicCityPages.integrityFailures,
  integritySummary.failures,
);
assert.equal(
  program.programGates.publicCityPages.provisionalWarnings,
  integritySummary.warnings,
);

assert.ok(
  program.currentScore.organicNumberOneQueries >= 0 &&
    program.currentScore.organicNumberOneQueries <= organicQueriesMeasured,
);
assert.ok(
  program.currentScore.exactCidMapsNumberOneQueries >= 0 &&
    program.currentScore.exactCidMapsNumberOneQueries <= mapsQueriesMeasured,
);
assert.ok(
  program.currentScore.citiesAtSustainedGoal >= 0 &&
    program.currentScore.citiesAtSustainedGoal <= program.cityTracks.length,
);
assert.ok(program.prohibited.includes("doorway pages"));
assert.ok(program.prohibited.some((rule) => rule.includes("unapproved GBP")));

console.log(
  `PASS SLV city goal program: ${program.cityTracks.length} cities, ${organicQueriesMeasured} organic queries, ${mapsQueriesMeasured} exact-CID Maps queries, ${integritySummary.failures} blocking integrity findings`,
);
