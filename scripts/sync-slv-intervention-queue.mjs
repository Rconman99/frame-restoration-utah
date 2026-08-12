#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertScoreVector, bestMeasuredRank, interventionLane, measuredMeanRank, scoreVector } from "./lib/slv-intervention-queue.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-INTERVENTION-QUEUE-2026-08-12.json";
const sourceFiles = {
  portfolio: "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json",
  weeklyDecisions: "data/rank-tracker/SLV-WEEKLY-DECISIONS-2026-08-12.json",
  gscAttribution: "data/rank-tracker/SLV-GSC-URL-ATTRIBUTION-LATEST.json",
  gscSplitUrlDiagnosis: "data/rank-tracker/SLV-GSC-SPLIT-URL-DIAGNOSIS-2026-08-12.json",
  displacement: "data/rank-tracker/SLV-COMPETITOR-DISPLACEMENT-2026-08-12.json",
  entityHealth: "data/rank-tracker/SLV-ENTITY-HEALTH-2026-08-12.json",
  mapsReadiness: "data/rank-tracker/SLV-MAPS-READINESS-2026-08-12.json",
  expansionArchitecture: "data/rank-tracker/SLV-EXPANSION-ARCHITECTURE-2026-08-12.json",
  corePriority: "data/rank-tracker/SLV-PRIORITY-2026-08-12.json",
  coreCleanup: "data/authority/SLV-CITY-PUBLIC-REMEDIATION-PACKET-2026-08-12.json",
  millcreekAmendment: "data/authority/MILLCREEK-PUBLIC-IDENTITY-SCOPE-AMENDMENT-2026-08-12.json",
  expansionCleanup: "data/authority/SLV-EXPANSION-PUBLIC-REMEDIATION-PACKET-2026-08-12.json",
  serviceAreaRequest: "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json",
  ownerProfileAuditRequest: "data/authority/SLV-GBP-OWNER-AUDIT-REQUEST-2026-08-12.json",
  driveReceipt: "data/rank-tracker/evidence/SLV-BUSINESS-DRIVE-CONNECTOR-2026-08-12.json",
};
const diagnosisFiles = {
  Millcreek: "data/rank-tracker/MILLCREEK-IDENTITY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json",
  Sandy: "data/rank-tracker/SANDY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json",
  Holladay: "data/rank-tracker/HOLLADAY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json",
  "Cottonwood Heights": "data/rank-tracker/COTTONWOOD-HEIGHTS-ARCHITECTURE-DIAGNOSIS-2026-08-12.json",
  Draper: "data/rank-tracker/DRAPER-ARCHITECTURE-DIAGNOSIS-2026-08-12.json",
};
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const portfolio = read(sourceFiles.portfolio);
const weekly = read(sourceFiles.weeklyDecisions);
const gsc = read(sourceFiles.gscAttribution);
const gscSplitUrlDiagnosis = read(sourceFiles.gscSplitUrlDiagnosis);
const displacement = read(sourceFiles.displacement);
const entityHealth = read(sourceFiles.entityHealth);
const mapsReadiness = read(sourceFiles.mapsReadiness);
const expansionArchitecture = read(sourceFiles.expansionArchitecture);
const corePriority = read(sourceFiles.corePriority);
const coreCleanup = read(sourceFiles.coreCleanup);
const millcreekAmendment = read(sourceFiles.millcreekAmendment);
const expansionCleanup = read(sourceFiles.expansionCleanup);
const serviceAreaRequest = read(sourceFiles.serviceAreaRequest);
const ownerProfileAuditRequest = read(sourceFiles.ownerProfileAuditRequest);
const driveReceipt = read(sourceFiles.driveReceipt);
const decisionsByCity = new Map(weekly.cities.map((city) => [city.city, city]));
const gscByCity = new Map(gsc.cities.map((city) => [city.city, city]));
const gscSplitUrlDiagnosisByCity = new Map(gscSplitUrlDiagnosis.cities.map((city) => [city.city, city]));
const gscSplitUrlDiagnosisIsCurrent =
  gsc.sources.gscSnapshot.sha256 === gscSplitUrlDiagnosis.evidence.searchConsoleSnapshot.sha256;
const entityByCity = new Map(entityHealth.cities.map((city) => [city.city, city]));
const mapsByCity = new Map(mapsReadiness.cities.map((city) => [city.city, city]));
const expansionArchitectureByCity = new Map(expansionArchitecture.cities.map((city) => [city.city, city]));
const queriesByCity = new Map();
for (const query of displacement.queries) {
  if (!queriesByCity.has(query.city)) queriesByCity.set(query.city, []);
  queriesByCity.get(query.city).push(query);
}

const coreApprovalPhrase = millcreekAmendment.releaseGate.requiredApprovalPhrase;
const expansionApprovalPhrase = expansionCleanup.approval.requiredPhrase;
const pendingServiceArea = new Set(serviceAreaRequest.citiesRequiringCurrentEvidence);
const interventionOrder = [
  "Salt Lake City", "Millcreek", "Magna", "Kearns", "Sandy", "Holladay", "Cottonwood Heights",
  "Murray", "Riverton", "South Jordan", "Taylorsville", "Bluffdale", "Midvale", "Herriman",
  "West Valley City", "Draper", "South Salt Lake", "West Jordan",
];
const interventionPriorityByCity = new Map(interventionOrder.map((city, index) => [city, index]));

function selectedAction(goal, lane, diagnosis, protectedFootholds, gscUrlDiagnosis) {
  if (goal.city === "Salt Lake City") return {
    decision: "Monitor",
    action: "Keep the Salt Lake City page frozen and collect the scheduled fixed Google, targeted GSC, exact-CID review, and consumer-AI readings until the existing experiment's evaluation gate opens.",
    gate: "time-gated-until-2026-09-09T04:40:58Z",
    ownerApprovalPhrase: null,
    acceptanceCheck: "No SLC title, H1, copy, schema, canonical, route, or internal-link intent change occurs before the time gate; every weekly panel is retained without converting missing results to zero.",
  };
  if (goal.city === "Millcreek") return {
    decision: "Request input",
    action: "Request the exact combined core-cleanup and Millcreek storm-child approval; if approved, apply only the pinned integrity and Salt Lake Valley identity correction while preserving title, H1, canonical, visible intent, and the roof-repair AIO foothold.",
    gate: "explicit-owner-publication-approval-and-full-surface-release-gate",
    ownerApprovalPhrase: coreApprovalPhrase,
    acceptanceCheck: "Both Millcreek routes publish the reviewed Salt Lake Valley CID/sameAs set, strict integrity is green, all five rendered release gates pass, and a fresh baseline opens the 28-day observation window.",
  };
  if (protectedFootholds.organicNumberOneQueries.length || protectedFootholds.googleAiOverviewCitedQueries.length) return {
    decision: "Request input",
    action: `Request the exact expansion integrity-cleanup approval for ${goal.city}; preserve every title, H1, canonical, route, and protected #1/AIO query, then observe four weekly panels before drafting an intent change.`,
    gate: "explicit-owner-publication-approval-and-protected-foothold-guardrail",
    ownerApprovalPhrase: expansionApprovalPhrase,
    acceptanceCheck: `The ${goal.city} cleanup passes all release gates and ${[...new Set([...protectedFootholds.organicNumberOneQueries, ...protectedFootholds.googleAiOverviewCitedQueries])].join("; ")} remains protected through the declared observation window.`,
  };
  if (goal.city === "Holladay") return {
    decision: "Monitor",
    action: "Complete a full post-August-10 GSC consolidation window while preserving the city hub, redirected legacy route, homepage, and editorial guide; obtain current Salt Lake Valley service-area evidence for the separate Maps lane, request the core cleanup separately, and do not activate the drafted title test until its prerequisites pass.",
    gate: "complete-post-redirect-gsc-window-plus-service-area-evidence-plus-owner-gated-cleanup",
    ownerApprovalPhrase: coreApprovalPhrase,
    acceptanceCheck: `Current query-to-URL evidence no longer depends on the pre-redirect window; the position-4 roof-replacement foothold and all protected routes remain intact; a current receipt separately classifies Holladay for CID ${portfolio.cityCompletionContract.maps.exactCid}.`,
  };
  if (gscUrlDiagnosis?.disposition === "monitor-negligible-historical-trace") return {
    decision: "Request input",
    action: `Treat ${goal.city}'s negligible pre-redirect alternate trace as non-actionable and keep its intended page, redirect, canonicals, and related routes unchanged. Obtain current Salt Lake Valley service-area evidence for the separate Maps lane and request only the bounded expansion integrity cleanup; continue normal exact-query GSC monitoring without opening a URL-consolidation intervention.`,
    gate: "service-area-evidence-plus-explicit-cleanup-approval-with-url-consolidation-closed",
    ownerApprovalPhrase: expansionApprovalPhrase,
    acceptanceCheck: `A current receipt explicitly classifies ${goal.city} for CID ${portfolio.cityCompletionContract.maps.exactCid}, any approved cleanup passes the full release gate, and the intended page remains selected; a future alternate URL is escalated only if it has material persistent share or the fixed panel stops selecting the intended page.`,
  };
  if (goal.cohort.startsWith("core-")) return {
    decision: "Request input",
    action: `Obtain current Salt Lake Valley service-area evidence for ${goal.city}'s separate Maps lane and request the exact core cleanup approval; after a green production receipt and fresh baseline, activate at most the already-pinned single-title experiment with every other intent surface held constant.`,
    gate: "service-area-evidence-plus-explicit-owner-cleanup-approval-then-separate-ranking-experiment-approval",
    ownerApprovalPhrase: coreApprovalPhrase,
    acceptanceCheck: `${diagnosis?.nextExperiment?.measurement?.primaryDecisionRule || "The approved cleanup stays green and one separately approved ranking variable is judged after four comparable weekly panels."} A current receipt separately classifies ${goal.city} for CID ${portfolio.cityCompletionContract.maps.exactCid}.`,
  };
  return {
    decision: "Request input",
    action: `Obtain current Salt Lake Valley service-area evidence and the next exact-query GSC attribution for ${goal.city}; request the bounded expansion cleanup separately, but do not change identity or commercial intent until those evidence gates pass.`,
    gate: "service-area-evidence-plus-targeted-gsc-plus-explicit-cleanup-approval",
    ownerApprovalPhrase: expansionApprovalPhrase,
    acceptanceCheck: `A current receipt explicitly classifies ${goal.city} for CID ${portfolio.cityCompletionContract.maps.exactCid}, all four exact queries are requested without treating missing rows as zero, and any approved cleanup passes the full release gate.`,
  };
}

const candidates = portfolio.cityGoals.map((goal) => {
  const decision = decisionsByCity.get(goal.city);
  const gscCity = gscByCity.get(goal.city);
  const gscUrlDiagnosis = gscSplitUrlDiagnosisIsCurrent
    ? gscSplitUrlDiagnosisByCity.get(goal.city) || null
    : null;
  const entity = entityByCity.get(goal.city);
  const maps = mapsByCity.get(goal.city);
  const queries = queriesByCity.get(goal.city) || [];
  assert.ok(decision && gscCity && entity && maps, `missing joined evidence: ${goal.city}`);
  assert.equal(queries.length, 4, `fixed query evidence mismatch: ${goal.city}`);
  const diagnosisFile = diagnosisFiles[goal.city] || null;
  const diagnosis = diagnosisFile ? read(diagnosisFile) : null;
  const expansionCityArchitecture = expansionArchitectureByCity.get(goal.city) || null;
  const organicNumberOne = decision.protectedFootholds.organicNumberOneQueries;
  const aioOwned = decision.protectedFootholds.googleAiOverviewCitedQueries;
  const serviceAreaVerified = !goal.serviceAreaStatus.startsWith("pending-");
  const lane = interventionLane({
    city: goal.city,
    organicNumberOne,
    aioOwned,
    gscState: gscCity.state,
    gscUrlDisposition: gscUrlDiagnosis?.disposition || null,
    cohort: goal.cohort,
    serviceAreaStatus: goal.serviceAreaStatus,
  });
  const vector = scoreVector({
    ranks: goal.current.organicRanks,
    organicNumberOne,
    aioOwned,
    aioPresent: goal.current.googleAiOverview.present,
    gscRequested: gscCity.coverage.requestedQueries,
    gscFixedQueries: gscCity.coverage.fixedQueries,
    serviceAreaVerified,
    lane,
  });
  assertScoreVector(vector);
  const action = selectedAction(goal, lane, diagnosis, decision.protectedFootholds, gscUrlDiagnosis);
  return {
    interventionPriority: interventionPriorityByCity.get(goal.city),
    city: goal.city,
    slug: goal.slug,
    cohort: goal.cohort,
    page: goal.page,
    panelId: goal.panelId,
    lane,
    decision: action.decision,
    evidenceFeatures: {
      observedAt: goal.current.observedAt,
      organicRanks: goal.current.organicRanks,
      bestMeasuredOrganicRank: bestMeasuredRank(goal.current.organicRanks),
      measuredMeanOrganicRank: measuredMeanRank(goal.current.organicRanks),
      exactCidMapsNumberOne: queries.filter((query) => query.target.exactCidMapRank === 1).length,
      exactCidMapsReturned: maps.maps.exactCidReturned,
      mapsPacksPresent: maps.maps.packsPresent,
      mapsReadinessLane: maps.lane,
      dominantMapsDisplacer: maps.maps.dominantDisplacers[0] || null,
      googleAiOverviewsPresent: goal.current.googleAiOverview.present,
      googleAiOverviewOwnedQueries: aioOwned,
      protectedOrganicNumberOneQueries: organicNumberOne,
      intendedPageSelectedForEveryMeasuredRank: goal.current.selectedOrganicUrls.every((url) => url == null || new URL(url).pathname.replace(/^\//, "").replace(/\/$/, "") === goal.page.replace(/\.html$/, "")),
      gscState: gscCity.state,
      gscRequestedQueries: gscCity.coverage.requestedQueries,
      gscReturnedQueries: gscCity.coverage.returnedQueries,
      gscAlternateNormalizedUrls: gscCity.alternateNormalizedUrls,
      gscUrlDiagnosis: gscUrlDiagnosis
        ? {
            disposition: gscUrlDiagnosis.disposition,
            currentCannibalization: gscUrlDiagnosis.currentCannibalization,
            requiredRecheck: gscUrlDiagnosis.requiredRecheck,
            activeAttributionSnapshotSha256: gsc.sources.gscSnapshot.sha256,
          }
        : null,
      serviceAreaStatus: goal.serviceAreaStatus,
      identityProfile: entity.identityProfile,
      citySpecificEditorialAsset: entity.editorial.hasCitySpecificAsset,
      architectureState: gscUrlDiagnosis?.currentCannibalization
        || diagnosis?.decision?.currentCommercialCannibalization
        || diagnosis?.decision?.cannibalization
        || expansionCityArchitecture?.architecture?.currentCommercialCannibalization
        || "not-separately-diagnosed",
      protectedRelatedRoutes: expansionCityArchitecture
        ? expansionCityArchitecture.architecture.routes.filter((route) => route.role !== "commercial-city-hub").map((route) => route.file)
        : [],
      consumerAiState: goal.current.consumerAi,
      comparableWeeklyGooglePanels: decision.comparableWeeklyGooglePanels,
      comparableWeeklyConsumerAiPanels: decision.consumerAi.comparableWeeklyPanels,
    },
    scoreVector: vector,
    selectedAction: action.action,
    gate: action.gate,
    ownerApprovalPhrase: action.ownerApprovalPhrase,
    acceptanceCheck: action.acceptanceCheck,
    feedback: {
      cadence: "weekly",
      requiredComparablePanels: 4,
      currentSameWindowCompleteStreak: decision.sustainedProgress.sameWindowCompleteStreak,
      verdict: decision.decisions.ranking.verdict,
      keepRule: "Keep only a declared isolated ranking variable when its city-specific acceptance check passes and every protected integrity, URL-selection, Maps, AIO, consumer-AI, and route guardrail remains green.",
      revertRule: "Revert the isolated ranking variable on a declared guardrail failure or unmet 28-day decision rule; never revert a required factual correction to restore an unsupported claim or wrong entity identity.",
    },
    sources: {
      diagnosis: diagnosisFile ? { file: diagnosisFile, sha256: sha256(diagnosisFile) } : null,
      panelEvidence: queries.map((query) => ({ queryId: query.queryId, keyword: query.keyword })),
    },
  };
}).sort((a, b) => a.interventionPriority - b.interventionPriority);

const laneCounts = Object.fromEntries([...new Set(candidates.map((candidate) => candidate.lane))].sort().map((lane) => [lane, candidates.filter((candidate) => candidate.lane === lane).length]));
const queue = {
  schemaVersion: 1,
  queueId: "frame-utah-slv-world-class-intervention-queue-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T20:48:46Z",
  status: "active-evidence-ranked-public-actions-gated",
  publicMutationPerformed: false,
  objective: "Reach and sustain #1 organic and exact-CID Maps ranks for all 72 fixed city queries, plus named-and-cited Google AIO, ChatGPT, Perplexity, and Gemini visibility, without unsupported or unapproved public mutations.",
  recommendationPipeline: {
    mode: "world-class-ranking",
    stages: ["source", "hydrate", "filter", "score", "select", "side-effect", "feedback"],
    semanticRecall: {
      result: "reused-existing-artifacts",
      searched: [
        "SLV execution registry and weekly decisions",
        "core and expansion priority ledgers",
        "five city architecture diagnoses",
        "GSC URL attribution and expansion architecture",
        "entity health and customer request board",
        "core, Millcreek, and expansion approval packets"
      ],
      newArtifactJustification: "Existing artifacts describe evidence and gates but do not expose one machine-ranked intervention, acceptance check, and feedback contract per city."
    },
    filters: [
      "Reject bulk city-service page generation, competitor copying, generic content inflation, and schema-count matching.",
      "Reject any title, H1, identity, canonical, route, GBP, review, directory, indexing, outreach, ads, or DNS mutation without its explicit evidence and approval gate.",
      "Protect current organic #1 and owned AIO footholds before pursuing lower-ranked queries on the same page.",
      "Treat missing provider results and unreturned GSC rows as unmeasured, never zero."
    ],
    biasAndDiversity: {
      result: "pass",
      sourceFamilies: ["fixed mobile SERP", "targeted GSC", "site/entity audit", "owner-evidence contract", "competitor displacement"],
      checks: {
        vendorBias: "No provider recommendation or vendor feature is selected as an intervention.",
        popularityBias: "Rank leaders inform displacement but do not authorize copying.",
        recencyBias: "All decision-time dates and source hashes are retained; future syncs mark changed evidence instead of silently overwriting it.",
        categoryCollapse: "The queue includes measurement, integrity, identity, architecture, content-intent, Maps, and AEO lanes rather than one generic rewrite.",
        feedbackBias: "No intervention is called successful until a declared four-week outcome is measured."
      }
    },
    evalHarness: {
      tests: [
        "Every portfolio city appears exactly once with four fixed query evidence rows.",
        "Salt Lake City remains time-frozen; Millcreek uses the verified identity lane; Magna and Kearns use protected-foothold lanes.",
        "Every pending service-area city requires current evidence before exact-CID identity planning.",
        "A negligible pre-redirect alternate trace cannot create an architecture intervention; a pre-redirect tie remains monitor-only until a fully post-redirect window exists.",
        "Every score component is an integer from 0 through 10.",
        "No candidate authorizes a public mutation, and every public candidate carries the exact governing approval phrase."
      ]
    }
  },
  sources: {
    ...Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: sha256(file) }])),
    diagnoses: Object.fromEntries(Object.entries(diagnosisFiles).map(([city, file]) => [city, { file, sha256: sha256(file) }])),
  },
  summary: {
    cities: candidates.length,
    monitor: candidates.filter((candidate) => candidate.decision === "Monitor").length,
    requestInput: candidates.filter((candidate) => candidate.decision === "Request input").length,
    protectedOrganicNumberOneQueries: candidates.reduce((sum, candidate) => sum + candidate.evidenceFeatures.protectedOrganicNumberOneQueries.length, 0),
    protectedGoogleAiOverviewCitations: candidates.reduce((sum, candidate) => sum + candidate.evidenceFeatures.googleAiOverviewOwnedQueries.length, 0),
    citiesPendingServiceAreaEvidence: pendingServiceArea.size,
    citiesWithAllFourTargetedGscQueriesRequested: candidates.filter((candidate) => candidate.evidenceFeatures.gscRequestedQueries === 4).length,
    citiesAtSustainedGoal: weekly.summary.citiesAtSustainedGoal,
    laneCounts,
  },
  systemNextActions: [
    "Keep the SLC page frozen and run the next core Google panel on 2026-08-17.",
    "Refresh all 72 exact-query GSC URL attributions after this queue lands; preserve unreturned rows as unmeasured.",
    "Import only complete nine-row consumer-AI panels after a valid provider credential produces a committed reading.",
    "Run the exact-CID Salt Lake Valley review baseline after this branch lands; never mix in the Heber review export.",
    "Collect the read-only exact-CID owner profile audit before proposing a GBP relevance or prominence change; no profile edit is authorized."
  ],
  customerRequests: [
    {
      id: serviceAreaRequest.requestId,
      state: serviceAreaRequest.delivery.state,
      cities: serviceAreaRequest.citiesRequiringCurrentEvidence,
      file: sourceFiles.serviceAreaRequest,
    },
    {
      id: ownerProfileAuditRequest.requestId,
      state: ownerProfileAuditRequest.delivery.state,
      file: sourceFiles.ownerProfileAuditRequest,
      action: ownerProfileAuditRequest.delivery.ownerAsk,
    },
    {
      id: "business-drive-connector-account",
      state: driveReceipt.status,
      requiredAccount: driveReceipt.connector.requiredAccount,
      observedAccount: driveReceipt.connector.observedAccount,
      action: driveReceipt.decision,
    },
    {
      id: "consumer-ai-provider-key",
      state: "unchanged-known-invalid-secret",
      action: "Replace BRIGHT_DATA_KEY in Rconman99/geo-aeo-tracker with a valid Bright Data user API key; rerun only after GitHub reports a changed secret timestamp."
    }
  ],
  candidates,
};

assert.equal(queue.summary.cities, 18);
assert.equal(new Set(candidates.map((candidate) => candidate.city)).size, 18);
assert.deepEqual(candidates.map((candidate) => candidate.city), interventionOrder);
assert.deepEqual(candidates.map((candidate) => candidate.interventionPriority), interventionOrder.map((_, index) => index));
assert.equal(candidates.find((candidate) => candidate.city === "Salt Lake City").lane, "observe-time-gated-slc-experiment");
assert.equal(candidates.find((candidate) => candidate.city === "Millcreek").lane, "owner-gated-verified-identity-and-integrity-cleanup");
assert.ok(["Magna", "Kearns"].every((city) => candidates.find((candidate) => candidate.city === city).lane === "protect-foothold-before-cleanup-or-intent-change"));
assert.deepEqual([...gscSplitUrlDiagnosisByCity.keys()].sort(), ["Herriman", "Holladay"]);
assert.equal(gscSplitUrlDiagnosisIsCurrent, true, "split-URL diagnosis has expired; refresh it against the current attribution snapshot before suppressing a URL lane");
assert.equal(candidates.find((candidate) => candidate.city === "Holladay").lane, "diagnose-url-consolidation-before-intent-change");
assert.equal(candidates.find((candidate) => candidate.city === "Herriman").lane, "service-area-proof-and-targeted-gsc-before-intent-change");
assert.match(candidates.find((candidate) => candidate.city === "Herriman").selectedAction, /negligible pre-redirect alternate trace as non-actionable/);
assert.equal(queue.summary.citiesPendingServiceAreaEvidence, 16);
assert.equal(expansionArchitectureByCity.size, 12);
assert.equal(mapsByCity.size, 18);
assert.equal(queue.summary.protectedOrganicNumberOneQueries, portfolio.portfolioScore.fixedOrganicNumberOne);
assert.equal(queue.summary.protectedGoogleAiOverviewCitations, portfolio.portfolioScore.googleAiOverviewCitations);
assert.equal(queue.summary.citiesAtSustainedGoal, 0);
assert.equal(mapsReadiness.summary.citiesReadyForMapsIntervention, 0);
assert.equal(serviceAreaRequest.drivePreflight.externalReceiptSha256, driveReceipt.source.externalReceiptSha256);
assert.equal(driveReceipt.evidenceSearchPerformed, false);
assert.ok(candidates.every((candidate) => candidate.sources.panelEvidence.length === 4));
assert.ok(candidates.every((candidate) => candidate.feedback.requiredComparablePanels === 4));
assert.ok(candidates.every((candidate) => candidate.decision === "Monitor" || candidate.ownerApprovalPhrase));
assert.ok(candidates.filter((candidate) => pendingServiceArea.has(candidate.city)).every((candidate) => candidate.evidenceFeatures.serviceAreaStatus.startsWith("pending-")));
assert.ok(candidates.every((candidate) => candidate.evidenceFeatures.intendedPageSelectedForEveryMeasuredRank));
assert.equal(candidates.reduce((sum, candidate) => sum + candidate.evidenceFeatures.protectedRelatedRoutes.length, 0), expansionArchitecture.summary.relatedRoutesProtected);
assert.ok(candidates.every((candidate) => Object.values(candidate.scoreVector).every((value) => Number.isInteger(value) && value >= 0 && value <= 10)));

const nextText = `${JSON.stringify(queue, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV intervention queue: ${queue.summary.cities} cities, ${queue.summary.monitor} monitor, ${queue.summary.requestInput} request-input, ${queue.summary.citiesPendingServiceAreaEvidence} service-area proof gaps`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV intervention queue is stale; run npm run sync:slv-interventions");
  console.log(`PASS SLV intervention queue: 18 evidence-ranked cities, ${queue.summary.protectedOrganicNumberOneQueries} protected #1 queries, no public authorization`);
}
