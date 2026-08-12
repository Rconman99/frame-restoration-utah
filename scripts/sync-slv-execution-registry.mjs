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
};
const externalEvidence = {
  businessDriveReceipt: "/Users/agenticmac/territory-command/data/command-center/utah-seo/drive-evidence/drive-evidence-audit-20260812T175850Z.json",
  businessDriveReceiptSha256: "d1509d396e1d62776ea28387c7730ff22defec883932de0c0f97ec5f59d43e9b",
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
const goals = new Map(portfolio.cityGoals.map((goal) => [goal.city, goal]));
const expansionRows = new Map(expansionPriority.cities.map((city) => [city.city, city]));
const queryRows = new Map();
for (const query of displacement.queries) {
  if (!queryRows.has(query.city)) queryRows.set(query.city, []);
  queryRows.get(query.city).push(query);
}

assert.equal(sha256(externalEvidence.businessDriveReceipt), externalEvidence.businessDriveReceiptSha256);
const driveReceipt = JSON.parse(fs.readFileSync(externalEvidence.businessDriveReceipt, "utf8"));
assert.equal(driveReceipt.status, "FAILED_CLOSED_CONNECTOR_ACCOUNT_MISMATCH");
assert.equal(driveReceipt.connector.required_account, "ryan@framerestorations.com");
assert.equal(driveReceipt.connector.match, false);

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
  const queries = queryRows.get(city) || [];
  assert.equal(queries.length, 4, `fixed query count mismatch: ${city}`);
  const organicNumberOne = queries.filter((query) => query.target.organicRank === 1).map((query) => query.keyword);
  const aioOwned = queries.filter((query) => query.target.aiOverviewCited).map((query) => query.keyword);
  const action = actionFor(city);
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
    ...action,
    universalDependencies: [
      "valid Bright Data user API key for ChatGPT/Perplexity/Gemini panels",
      "business Drive connector authenticated as ryan@framerestorations.com for evidence search",
      "clean Vercel blocking status before merge",
    ],
    completionContract: "All four organic queries and the exact CID rank #1 across four consecutive weekly panels; every observed AIO cites Frame; all three consumer-AI engines name and cite Frame; integrity remains green in the same 28-day window.",
  };
});

const registry = {
  schemaVersion: 1,
  registryId: "frame-utah-slv-18-city-execution-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T18:32:00.000Z",
  status: "active-goal-execution-gated",
  publicMutationPerformed: false,
  score: portfolio.portfolioScore,
  sources: Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: localHash(file) }])),
  externalEvidence,
  systemActions: [
    {
      id: "land-diagnosis-bundle",
      class: "system-fixable-after-clean-ci",
      state: "waiting-on-duplicate-vercel-rate-limit",
      nextCheckAfter: "2026-08-13T17:02:21Z",
      decision: "Do not push or merge another branch while the stale frameroofingutah Vercel integration is producing a blocking failure; recheck after its stated 24-hour retry window.",
    },
    {
      id: "targeted-gsc-72-query-read",
      class: "system-fixable-after-bundle-lands",
      state: "workflow-ready-local-secret-absent",
      decision: "The main-only SEO workflow has the GSC secret and will target all 72 queries after this code lands; local absence is not a zero result.",
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
  ],
  connectionNeeded: [
    {
      id: "business-drive-connector",
      state: "blocked-with-proof",
      requiredAccount: driveReceipt.connector.required_account,
      observedAccount: driveReceipt.connector.observed_account,
      receipt: externalEvidence.businessDriveReceipt,
      receiptSha256: externalEvidence.businessDriveReceiptSha256,
      action: "Reconnect the claude.ai Google Drive connector to ryan@framerestorations.com, then rerun the read-only evidence audit.",
    },
    {
      id: "consumer-ai-provider-key",
      state: "blocked-invalid-existing-secret",
      secretName: "BRIGHT_DATA_KEY",
      lastObservedSecretUpdatedAt: "2026-08-12T15:02:01Z",
      failedRun: "https://github.com/Rconman99/geo-aeo-tracker/actions/runs/31610098484",
      action: "Replace the existing GitHub secret with a valid Bright Data user API key from the Bright Data user settings page; rerun only after the secret timestamp changes.",
    },
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
assert.equal(registry.score.fixedOrganicNumberOne, 2);
assert.equal(registry.score.exactCidMapsNumberOne, 0);
assert.equal(registry.score.citiesAtSustainedGoal, 0);
assert.deepEqual(registry.cities.filter((city) => city.measurement.organicNumberOne.length).map((city) => city.city), ["Magna", "Kearns"]);
assert.equal(registry.connectionNeeded.length, 2);
assert.equal(registry.ownerApprovalsNeeded.length, 3);
assert.ok(registry.cities.every((city) => city.completionContract.includes("four consecutive weekly panels")));
assert.ok(registry.cities.every((city) => city.universalDependencies.length === 3));

const nextText = `${JSON.stringify(registry, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV execution registry: ${registry.cities.length} cities, ${registry.systemActions.length} system actions, ${registry.connectionNeeded.length} connection gates, ${registry.ownerApprovalsNeeded.length} owner gates`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV execution registry is stale; run npm run sync:slv-execution-registry");
  console.log(`PASS SLV execution registry: ${registry.cities.length} cities, 2/72 organic #1, 0/72 exact-CID Maps #1, 0 sustained completions`);
}
