import assert from "node:assert/strict";

export function bestMeasuredRank(ranks = []) {
  const measured = ranks.filter((rank) => Number.isInteger(rank) && rank > 0);
  return measured.length ? Math.min(...measured) : null;
}

export function measuredMeanRank(ranks = []) {
  const measured = ranks.filter((rank) => Number.isInteger(rank) && rank > 0);
  if (!measured.length) return null;
  return Number((measured.reduce((sum, rank) => sum + rank, 0) / measured.length).toFixed(2));
}

export function interventionLane({ city, organicNumberOne = [], aioOwned = [], gscState, cohort, serviceAreaStatus }) {
  if (city === "Salt Lake City") return "observe-time-gated-slc-experiment";
  if (city === "Millcreek") return "owner-gated-verified-identity-and-integrity-cleanup";
  if (organicNumberOne.length || aioOwned.length) return "protect-foothold-before-cleanup-or-intent-change";
  if (gscState === "url-competition-requires-diagnosis") return "diagnose-url-consolidation-before-intent-change";
  if (cohort.startsWith("core-")) return "owner-gated-core-integrity-then-single-variable-intent-test";
  if (serviceAreaStatus.startsWith("pending-")) return "service-area-proof-and-targeted-gsc-before-intent-change";
  return "targeted-gsc-before-single-variable-intent-test";
}

export function scoreVector({ ranks, organicNumberOne, aioOwned, aioPresent, gscRequested, gscFixedQueries, serviceAreaVerified, lane }) {
  const best = bestMeasuredRank(ranks);
  const leadValue = best == null ? 2 : best <= 1 ? 10 : best <= 3 ? 9 : best <= 5 ? 8 : best <= 10 ? 7 : best <= 15 ? 5 : 3;
  const confidence = Math.min(10,
    2
    + (ranks.length === 4 ? 2 : 0)
    + (gscRequested === gscFixedQueries ? 2 : gscRequested > 0 ? 1 : 0)
    + (serviceAreaVerified ? 2 : 0)
    + (organicNumberOne.length || aioOwned.length ? 2 : 0));
  const authorityValue = aioOwned.length ? 10 : aioPresent ? 7 : 5;
  const learningValue = gscRequested === gscFixedQueries ? 6 : 9;
  const implementationCost = lane.startsWith("observe-") ? 1 : lane.startsWith("diagnose-") ? 3 : 5;
  const complianceRisk = lane.startsWith("observe-") || lane.startsWith("diagnose-") ? 1 : 8;
  const customerBlockerRisk = serviceAreaVerified ? 4 : 8;
  return {
    businessValue: 10,
    confidence,
    leadValue,
    authorityValue,
    learningValue,
    implementationCost,
    complianceRisk,
    customerBlockerRisk,
    maintenanceCost: 2,
    sourceBiasRisk: 2,
    recencyBiasRisk: 1,
  };
}

export function assertScoreVector(vector) {
  const expected = [
    "businessValue", "confidence", "leadValue", "authorityValue", "learningValue",
    "implementationCost", "complianceRisk", "customerBlockerRisk", "maintenanceCost",
    "sourceBiasRisk", "recencyBiasRisk",
  ];
  assert.deepEqual(Object.keys(vector), expected);
  assert.ok(Object.values(vector).every((value) => Number.isInteger(value) && value >= 0 && value <= 10));
}
