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

const outputPath = "data/rank-tracker/SLV-EXECUTION-REGISTRY-2026-08-12.json";
const sourceFiles = {
  portfolio: "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json",
  corePriority: "data/rank-tracker/SLV-PRIORITY-2026-08-12.json",
  expansionPriority: "data/rank-tracker/SLV-EXPANSION-PRIORITY-2026-08-12.json",
  displacement: "data/rank-tracker/SLV-COMPETITOR-DISPLACEMENT-2026-08-12.json",
  coreCleanupPacket: "data/authority/SLV-CITY-PUBLIC-REMEDIATION-PACKET-2026-08-12.json",
  millcreekAmendment: "data/authority/MILLCREEK-PUBLIC-IDENTITY-SCOPE-AMENDMENT-2026-08-12.json",
  expansionCleanupPacket: "data/authority/SLV-EXPANSION-PUBLIC-REMEDIATION-PACKET-2026-08-12.json",
  expansionArchitecture: "data/rank-tracker/SLV-EXPANSION-ARCHITECTURE-2026-08-12.json",
  entityHealth: "data/rank-tracker/SLV-ENTITY-HEALTH-2026-08-12.json",
  weeklyDecisions: "data/rank-tracker/SLV-WEEKLY-DECISIONS-2026-08-12.json",
  gscAttribution: "data/rank-tracker/SLV-GSC-URL-ATTRIBUTION-LATEST.json",
  consumerAi: "data/rank-tracker/SLV-CONSUMER-AI-LATEST.json",
  interventions: "data/rank-tracker/SLV-INTERVENTION-QUEUE-2026-08-12.json",
  mapsReadiness: "data/rank-tracker/SLV-MAPS-READINESS-2026-08-12.json",
  ownerProfileAuditRequest: "data/authority/SLV-GBP-OWNER-AUDIT-REQUEST-2026-08-12.json",
  businessDriveReceipt: "data/rank-tracker/evidence/SLV-BUSINESS-DRIVE-CONNECTOR-2026-08-12.json",
  ownerViewGbpEvidence: "data/rank-tracker/evidence/SLV-GBP-OWNER-VIEW-LATEST.json",
  diagnosisBundleRelease: "data/rank-tracker/evidence/SLV-DIAGNOSIS-BUNDLE-RELEASE-2026-08-12.json",
};
const externalEvidence = {
  businessDriveReceipt: sourceFiles.businessDriveReceipt,
};
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const localHash = (file) => sha256(path.join(root, file));

const portfolio = read(sourceFiles.portfolio);
const corePriority = read(sourceFiles.corePriority);
const expansionPriority = read(sourceFiles.expansionPriority);
const displacement = read(sourceFiles.displacement);
const coreCleanup = read(sourceFiles.coreCleanupPacket);
const millcreekAmendment = read(sourceFiles.millcreekAmendment);
const expansionCleanup = read(sourceFiles.expansionCleanupPacket);
const entityHealth = read(sourceFiles.entityHealth);
const weeklyDecisions = read(sourceFiles.weeklyDecisions);
const gscAttribution = read(sourceFiles.gscAttribution);
const consumerAi = read(sourceFiles.consumerAi);
const interventions = read(sourceFiles.interventions);
const mapsReadiness = read(sourceFiles.mapsReadiness);
const ownerProfileAuditRequest = read(sourceFiles.ownerProfileAuditRequest);
const ownerViewGbpEvidence = read(sourceFiles.ownerViewGbpEvidence);
const diagnosisBundleRelease = read(sourceFiles.diagnosisBundleRelease);
assert.equal(diagnosisBundleRelease.status, "LANDED_MAIN_CI_AND_PRODUCTION_DEPLOYMENTS_VERIFIED");
assert.equal(diagnosisBundleRelease.pullRequest.number, 247);
assert.equal(diagnosisBundleRelease.defaultBranch.commit, diagnosisBundleRelease.pullRequest.mergeSha);
assert.ok(diagnosisBundleRelease.defaultBranch.workflows.every(({ conclusion }) => conclusion === "success"));
assert.ok(diagnosisBundleRelease.defaultBranch.deployments.every(({ state }) => state === "success"));
const ownerProfileEvidenceComplete = ownerViewGbpEvidence.status === "MEASURED_EXACT_CID_OWNER_VIEW"
  && ownerViewGbpEvidence.summary.knownProfileFields === 12;
const goals = new Map(portfolio.cityGoals.map((goal) => [goal.city, goal]));
const gscByCity = new Map(gscAttribution.cities.map((city) => [city.city, city]));
const expansionRows = new Map(expansionPriority.cities.map((city) => [city.city, city]));
const interventionByCity = new Map(interventions.candidates.map((candidate) => [candidate.city, candidate]));
const mapsByCity = new Map(mapsReadiness.cities.map((city) => [city.city, city]));
const queryRows = new Map();
for (const query of displacement.queries) {
  if (!queryRows.has(query.city)) queryRows.set(query.city, []);
  queryRows.get(query.city).push(query);
}

const driveReceipt = read(externalEvidence.businessDriveReceipt);
assert.equal(driveReceipt.status, "BUSINESS_ACCOUNT_SEARCH_COMPLETE_CURRENT_GBP_PROOF_NOT_FOUND");
assert.equal(driveReceipt.connector.requiredAccount, "ryan@framerestorations.com");
assert.equal(driveReceipt.connector.observedAccount, "ryan@framerestorations.com");
assert.equal(driveReceipt.connector.match, true);
assert.equal(driveReceipt.evidenceSearchPerformed, true);
assert.equal(driveReceipt.acceptedCurrentGbpProfileEvidenceCount, 0);
assert.equal(driveReceipt.acceptedCurrentServiceAreaEvidenceCount, 0);
assert.equal(driveReceipt.credentialFieldsStored, 0);
assert.equal(driveReceipt.driveMutationPerformed, false);

const cityOrder = [
  "Salt Lake City", "Millcreek", "Magna", "Kearns", "Sandy", "Holladay", "Cottonwood Heights", "Murray", "Riverton", "South Jordan", "Taylorsville", "Bluffdale", "Midvale", "Herriman", "West Valley City", "Draper", "South Salt Lake", "West Jordan",
];
const architectureFirst = new Set(["Draper", "South Salt Lake", "West Jordan"]);
const protectExisting = new Set(["Magna", "Kearns"]);
const coreCleanupCities = new Set(["Millcreek", "Sandy", "Holladay", "Cottonwood Heights", "Draper"]);

function actionFor(city) {
  if (city === "Salt Lake City") {
    return {
      lane: "observe-time-gated-experiment",
      action: "Keep the page frozen, run the weekly fixed Google panel, and evaluate the existing trust correction no earlier than 2026-09-09T04:40:58Z.",
      actionClass: "system-fixable-when-scheduled",
      gate: "time-gated-until-2026-09-09T04:40:58Z",
      publicApprovalPacket: null,
    };
  }
  if (city === "Millcreek") {
    return {
      lane: "cleanup-first-protect-aio",
      action: "After exact owner approval, apply the five-page core cleanup plus the pinned Millcreek storm-child identity correction as one isolated variable; protect the owned roof-repair AIO citation and all current titles/H1s.",
      actionClass: "system-fixable-after-owner-approval",
      gate: "explicit-owner-publication-approval",
      publicApprovalPacket: sourceFiles.coreCleanupPacket,
    };
  }
  if (protectExisting.has(city)) {
    return {
      lane: "protect-number-one-cleanup-first",
      action: `After separate exact owner approval, apply only the expansion integrity cleanup for ${city}; preserve its roof-replacement #1 query${city === "Magna" ? " and owned Google AIO citation" : ""}, then observe before any ranking experiment.`,
      actionClass: "system-fixable-after-owner-approval",
      gate: "explicit-owner-publication-approval",
      publicApprovalPacket: sourceFiles.expansionCleanupPacket,
    };
  }
  if (coreCleanupCities.has(city)) {
    return {
      lane: architectureFirst.has(city) ? "cleanup-then-architecture-diagnosis" : "cleanup-then-single-variable-experiment",
      action: architectureFirst.has(city)
        ? `After exact owner approval, complete the bounded core integrity cleanup for ${city}; then protect related routes and use targeted GSC URL evidence before changing intent surfaces.`
        : `After exact owner approval, complete the bounded core integrity cleanup for ${city}; capture a fresh baseline before one declared ranking variable.`,
      actionClass: "system-fixable-after-owner-approval",
      gate: "explicit-owner-publication-approval",
      publicApprovalPacket: sourceFiles.coreCleanupPacket,
    };
  }
  const expansion = expansionRows.get(city);
  assert.ok(expansion, `missing expansion priority: ${city}`);
  return {
    lane: architectureFirst.has(city) ? "cleanup-then-architecture-diagnosis" : expansion.lane,
    action: `After separate exact owner approval, apply only the bounded expansion integrity cleanup for ${city}; obtain targeted GSC URL evidence before any title, H1, canonical, link, or route experiment.`,
    actionClass: "system-fixable-after-owner-approval",
    gate: "explicit-owner-publication-approval-and-targeted-gsc",
    publicApprovalPacket: sourceFiles.expansionCleanupPacket,
  };
}

const cities = cityOrder.map((city, index) => {
  const goal = goals.get(city);
  assert.ok(goal, `missing goal: ${city}`);
  const gsc = gscByCity.get(city);
  assert.ok(gsc, `missing GSC attribution: ${city}`);
  const queries = queryRows.get(city) || [];
  assert.equal(queries.length, 4, `fixed query count mismatch: ${city}`);
  const organicNumberOne = queries.filter((query) => query.target.organicRank === 1).map((query) => query.keyword);
  const aioOwned = queries.filter((query) => query.target.aiOverviewCited).map((query) => query.keyword);
  const action = actionFor(city);
  const intervention = interventionByCity.get(city);
  const maps = mapsByCity.get(city);
  assert.ok(intervention && maps, `missing intervention or Maps readiness: ${city}`);
  return {
    executionPriority: index,
    city,
    slug: goal.slug,
    cohort: goal.cohort,
    page: goal.page,
    panelId: goal.panelId,
    measurement: {
      observedAt: goal.current.observedAt,
      organicRanks: goal.current.organicRanks,
      organicNumberOne,
      exactCidMapsNumberOne: queries.filter((query) => query.target.exactCidMapRank === 1).length,
      googleAiOverviewOwnedQueries: aioOwned,
      consumerAi: goal.current.consumerAi,
    },
    gscAttribution: {
      snapshotDate: gscAttribution.asOfSnapshotDate,
      window: gscAttribution.evidenceWindow,
      state: gsc.state,
      requestedQueries: gsc.coverage.requestedQueries,
      returnedQueries: gsc.coverage.returnedQueries,
      exactRows: gsc.coverage.exactRows,
      alternateNormalizedUrls: gsc.alternateNormalizedUrls,
      nextEvidenceAction: gsc.nextEvidenceAction,
    },
    lane: intervention.lane,
    action: intervention.selectedAction,
    actionClass: intervention.decision === "Monitor" ? "system-monitor" : "owner-or-evidence-input-needed",
    gate: intervention.gate,
    publicApprovalPacket: action.publicApprovalPacket,
    ownerApprovalPhrase: intervention.ownerApprovalPhrase,
    intervention: {
      lane: intervention.lane,
      decision: intervention.decision,
      selectedAction: intervention.selectedAction,
      gate: intervention.gate,
      acceptanceCheck: intervention.acceptanceCheck,
      scoreVector: intervention.scoreVector,
      feedback: intervention.feedback,
    },
    mapsReadiness: {
      lane: maps.lane,
      packsPresent: maps.maps.packsPresent,
      exactCidReturned: maps.maps.exactCidReturned,
      exactCidNumberOne: maps.maps.exactCidNumberOne,
      dominantDisplacer: maps.maps.dominantDisplacers[0] || null,
      nextAction: maps.nextAction,
      mutationAuthorized: maps.publicMutationAuthorized,
    },
    universalDependencies: [
      "valid Bright Data user API key for ChatGPT/Perplexity/Gemini panels",
      "current owner-view GBP and saved service-area evidence for the exact CID",
      "clean Vercel blocking status before merge",
    ],
    completionContract: "All four organic queries and the exact CID rank #1 across four consecutive weekly panels; every observed AIO cites Frame; all three consumer-AI engines name and cite Frame; integrity remains green in the same 28-day window.",
  };
});

const registry = {
  schemaVersion: 1,
  registryId: "frame-utah-slv-18-city-execution-v1",
  market: "utah-salt-lake-valley",
  preparedAt: diagnosisBundleRelease.observedAt,
  status: "active-goal-execution-gated",
  publicMutationPerformed: false,
  score: {
    ...portfolio.portfolioScore,
    citiesAtSustainedGoal: weeklyDecisions.summary.citiesAtSustainedGoal,
  },
  sources: Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: localHash(file) }])),
  externalEvidence,
  consumerAiConfiguration: {
    repository: "Rconman99/geo-aeo-tracker",
    pullRequest: "https://github.com/Rconman99/geo-aeo-tracker/pull/4",
    reviewedHeadSha: "59c513ef99e307f51becb74a975e7ced4a97ec15",
    squashMergeSha: "cdb05834e8dc9ab641dc67cefa16c35dd0bbfdd6",
    mergedAt: "2026-08-12T18:15:39Z",
    deploymentId: "dpl_2vFobCKzCY3vmLctDtYXNJ9vAEts",
    deploymentUrl: "https://geo-aeo-tracker-kiscc4eph-ryans-projects-51d84217.vercel.app",
    deploymentTarget: "production",
    deploymentStatus: "READY",
    deploymentVerifiedAt: "2026-08-12T18:16:20Z",
    configuredCities: 18,
    boundedProviderPromptRows: 162,
    automaticallyScheduledCities: ["Salt Lake City", "Millcreek"],
    citiesWithCompleteReading: consumerAi.summary.citiesWithCompleteReading,
    comparableWeeklyPanels: consumerAi.summary.comparableWeeklyPanels,
    citiesAtFourWeekConsumerAiTarget: consumerAi.summary.citiesAtFourWeekConsumerAiTarget,
    state: consumerAi.summary.citiesWithCompleteReading > 0
      ? "measurement-active-complete-readings-imported"
      : "configuration-live-measurement-blocked-invalid-provider-key",
  },
  systemActions: [
    {
      id: "land-diagnosis-bundle",
      class: "system-complete-release-verified",
      state: "landed-main-ci-and-production-deployments-verified",
      source: sourceFiles.diagnosisBundleRelease,
      pullRequest: diagnosisBundleRelease.pullRequest.number,
      mergeSha: diagnosisBundleRelease.pullRequest.mergeSha,
      verifiedAt: diagnosisBundleRelease.observedAt,
      decision: "The 18-city diagnosis bundle is landed and release-verified. Keep its independent evidence, owner-approval, measurement, and public-mutation gates in force; do not recreate the expired Vercel wait state.",
    },
    {
      id: "targeted-gsc-72-query-read",
      class: "system-fixable-after-bundle-lands",
      state: gscAttribution.summary.requestedQueries === 72 ? "complete-targeted-request-live" : "workflow-ready-partial-baseline",
      source: sourceFiles.gscAttribution,
      workflowTargetQueries: gscAttribution.measurementContract.workflowTargetQueries,
      requestedQueries: gscAttribution.summary.requestedQueries,
      decision: gscAttribution.summary.requestedQueries === 72
        ? "Use the complete 72-query GSC attribution ledger to choose city-specific URL diagnoses; no missing row is zero and no multi-URL row alone proves current cannibalization."
        : "The main-only SEO workflow will target and classify all 72 queries after this code lands; the existing partial baseline remains unmeasured for unrequested queries, not zero.",
    },
    {
      id: "weekly-core-google-panel",
      class: "system-fixable-scheduled",
      state: "active-six-city-weekly",
      decision: "Keep the six core-city fixed panel weekly; do not silently add twelve recurring paid panels without explicit admission.",
    },
    {
      id: "weekly-expansion-google-panel",
      class: "owner-spend-approval-needed",
      state: "manual-baseline-complete-not-admitted",
      estimatedCompleteWeeklyCostUsd: 0.1152,
      decision: "The first 12-city baseline is complete; recurring weekly provider spend remains unapproved.",
    },
    {
      id: "salt-lake-valley-review-baseline",
      class: "system-fixable-after-bundle-lands",
      state: entityHealth.reviews.saltLakeValley.state === "unmeasured"
        ? "exact-cid-unmeasured-cross-profile-fallback-now-fail-closed"
        : "exact-cid-baseline-measured",
      targetCid: entityHealth.reviews.saltLakeValley.cid,
      decision: entityHealth.reviews.saltLakeValley.state === "unmeasured"
        ? "Use the existing valid GitHub DataForSEO credentials after this safeguard lands; never count the Heber 34-review export as Salt Lake Valley evidence."
        : "Keep the exact-CID Salt Lake Valley review baseline separate from the Heber review sync and use it only as entity-health evidence.",
    },
    {
      id: "city-editorial-evidence-gaps",
      class: "evidence-dependent-public-work",
      state: "five-gaps-pinned-no-thin-content",
      cities: entityHealth.editorial.evidenceFirstGaps,
      decision: "Add city-specific editorial support only when real local evidence exists and the public release and doorway-page gates pass; protect Magna and Kearns ranking footholds.",
    },
    {
      id: "weekly-keep-revert-decisions",
      class: "system-fixable-on-measurement-cadence",
      state: "active-no-premature-ranking-verdicts",
      source: sourceFiles.weeklyDecisions,
      decision: "Keep the required SLC factual correction, hold all 18 ranking lanes until their comparable evidence contracts are satisfied, and preserve the Magna/Kearns #1 footholds.",
    },
    {
      id: "evidence-ranked-city-interventions",
      class: "system-fixable-on-evidence-refresh",
      state: "active-no-public-authorization",
      source: sourceFiles.interventions,
      decision: "Re-rank each city's next action after every complete Google, GSC, review, entity-health, or consumer-AI refresh; protect existing footholds and preserve every explicit evidence and owner gate.",
    },
    {
      id: "exact-cid-maps-readiness",
      class: "system-fixable-on-evidence-refresh",
      state: mapsReadiness.summary.citiesReadyForMapsIntervention === 0 ? "owner-evidence-and-exact-cid-review-baselines-needed" : "city-maps-lanes-ready-for-reviewed-selection",
      source: sourceFiles.mapsReadiness,
      exactCidReturned: mapsReadiness.summary.exactCidReturned,
      citiesPendingServiceAreaEvidence: mapsReadiness.summary.citiesPendingServiceAreaEvidence,
      decision: "Use Google's relevance, distance, and prominence model per city; measure distance, verify relevance facts, and earn prominence without fake locations, duplicate profiles, name/category stuffing, or review manipulation.",
    },
  ],
  connectionNeeded: [
    ...(consumerAi.summary.citiesWithCompleteReading === 0 ? [{
      id: "consumer-ai-provider-key",
      state: "blocked-invalid-existing-secret",
      secretName: "BRIGHT_DATA_KEY",
      lastObservedSecretUpdatedAt: "2026-08-12T15:02:01Z",
      failedRun: "https://github.com/Rconman99/geo-aeo-tracker/actions/runs/31610098484",
      action: "Replace the existing GitHub secret with a valid Bright Data user API key from the Bright Data user settings page; rerun only after the secret timestamp changes.",
    }] : []),
  ],
  ownerApprovalsNeeded: [
    {
      id: "core-five-page-and-millcreek-child-cleanup",
      exactPhrase: millcreekAmendment.releaseGate.requiredApprovalPhrase,
      scope: [coreCleanup.packetId, millcreekAmendment.amendmentId],
      publicMutationPerformed: false,
    },
    {
      id: "expansion-twelve-page-cleanup",
      exactPhrase: expansionCleanup.approval.requiredPhrase,
      scope: [expansionCleanup.packetId],
      publicMutationPerformed: false,
    },
    {
      id: "expansion-weekly-spend",
      exactPhrase: null,
      scope: ["Admit the complete 12-city/48-query expansion panel to weekly DataForSEO task-queue runs at an estimated $0.1152 per complete run."],
      publicMutationPerformed: false,
    },
  ],
  ownerEvidenceNeeded: [
    ...(ownerProfileEvidenceComplete ? [] : [{
      id: ownerProfileAuditRequest.requestId,
      state: ownerProfileAuditRequest.delivery.state,
      file: sourceFiles.ownerProfileAuditRequest,
      publicMutationPerformed: false,
    }]),
    ...(mapsReadiness.summary.citiesPendingServiceAreaEvidence === 0 ? [] : [{
      id: "frame-utah-slv-current-service-area-evidence-v1",
      state: "ready-not-sent",
      file: "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json",
      cities: mapsReadiness.summary.citiesPendingServiceAreaEvidence,
      publicMutationPerformed: false,
    }]),
  ],
  prohibited: [
    "No public page edit before the exact governing owner approval is recorded.",
    "No GBP, review, directory, service-area, indexing, outreach, DNS, ads, owner-message, or other public-account mutation from this registry.",
    "No competitor cloning, fake community participation, fabricated proof, or unsupported local claims.",
    "No rank claim converts a measured >30 row to an exact position or an absent local pack to a zero rank.",
    "No city is complete until the full same-window 28-day contract passes; a single query #1 is a protected foothold, not city completion."
  ],
  cities,
};

assert.equal(registry.cities.length, 18);
assert.equal(registry.score.fixedOrganicNumberOne, registry.cities.reduce((sum, city) => sum + city.measurement.organicNumberOne.length, 0));
assert.equal(registry.score.exactCidMapsNumberOne, registry.cities.reduce((sum, city) => sum + city.measurement.exactCidMapsNumberOne, 0));
assert.equal(registry.score.citiesAtSustainedGoal, weeklyDecisions.summary.citiesAtSustainedGoal);
assert.ok(["unmeasured", "measured-exact-cid"].includes(entityHealth.reviews.saltLakeValley.state));
assert.equal(entityHealth.reviews.heber.aggregateReviewCount, 34);
assert.equal(entityHealth.editorial.evidenceFirstGaps.length, 5);
assert.equal(weeklyDecisions.summary.integrityKeep, 1);
assert.equal(weeklyDecisions.summary.rankingHold, 18);
assert.equal(weeklyDecisions.summary.rankingKeep, 0);
assert.equal(weeklyDecisions.summary.rankingRevert, 0);
assert.equal(weeklyDecisions.summary.protectedOrganicNumberOneQueries, registry.score.fixedOrganicNumberOne);
assert.equal(gscAttribution.summary.cities, 18);
assert.equal(gscAttribution.summary.fixedQueries, 72);
assert.equal(gscAttribution.measurementContract.workflowTargetQueries, 72);
assert.equal(consumerAi.summary.cities, 18);
assert.equal(interventions.summary.cities, 18);
assert.equal(gscByCity.size, 18);
assert.equal(interventionByCity.size, 18);
assert.equal(mapsByCity.size, 18);
assert.equal(mapsReadiness.summary.exactCidNumberOne, registry.score.exactCidMapsNumberOne);
assert.equal(
  registry.ownerEvidenceNeeded.length,
  (ownerProfileEvidenceComplete ? 0 : 1)
    + (mapsReadiness.summary.citiesPendingServiceAreaEvidence === 0 ? 0 : 1),
);
assert.equal(registry.cities.reduce((sum, city) => sum + city.gscAttribution.requestedQueries, 0), gscAttribution.summary.requestedQueries);
assert.equal(registry.connectionNeeded.length, consumerAi.summary.citiesWithCompleteReading > 0 ? 0 : 1);
assert.equal(registry.ownerApprovalsNeeded.length, 3);
assert.equal(registry.systemActions[0].state, "landed-main-ci-and-production-deployments-verified");
assert.equal(registry.systemActions[0].source, sourceFiles.diagnosisBundleRelease);
assert.equal(registry.systemActions[0].mergeSha, diagnosisBundleRelease.pullRequest.mergeSha);
assert.ok(registry.cities.every((city) => city.completionContract.includes("four consecutive weekly panels")));
assert.ok(registry.cities.every((city) => city.universalDependencies.length === 3));
assert.ok(registry.cities.every((city) => city.intervention.feedback.requiredComparablePanels === 4));
assert.ok(registry.cities.every((city) => city.mapsReadiness.mutationAuthorized === false));

const nextText = `${JSON.stringify(registry, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV execution registry: ${registry.cities.length} cities, ${registry.systemActions.length} system actions, ${registry.connectionNeeded.length} connection gates, ${registry.ownerApprovalsNeeded.length} owner gates`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV execution registry is stale; run npm run sync:slv-execution-registry");
  console.log(`PASS SLV execution registry: ${registry.cities.length} cities, ${registry.score.fixedOrganicNumberOne}/72 organic #1, ${registry.score.exactCidMapsNumberOne}/72 exact-CID Maps #1, ${registry.score.citiesAtSustainedGoal} sustained completions`);
}
