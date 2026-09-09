import assert from "node:assert/strict";

export const SPLIT_URL_DIAGNOSIS_STALE_WARNING = "stale-slv-gsc-split-url-diagnosis";

// SERP selection is an observation, not a structural invariant. An alternate
// URL must block optimization, not prevent the weekly observations being saved.
export function guardSelectedOrganicUrls({ page, urls, action }) {
  assert.ok(Array.isArray(urls), "selected organic URLs must be an array");
  const normalizePath = (value) => value.replace(/^\//, "").replace(/\/$/, "").replace(/\.html$/, "");
  const mismatches = urls.filter((value) => {
    if (value == null) return false; // unranked is not a competing URL
    try {
      const url = new URL(value);
      return !["http:", "https:"].includes(url.protocol)
        || !["framerestorationutah.com", "www.framerestorationutah.com"].includes(url.hostname)
        || normalizePath(url.pathname) !== normalizePath(page);
    } catch {
      return true; // malformed observations cannot authorize an intervention
    }
  });
  if (!mismatches.length) return { intended: true, action };
  return {
    intended: false,
    action: {
      ...action,
      decision: "Monitor",
      action: "Diagnose unexpected organic URL selection against the dated fixed panel and exact-query GSC rows before any intent or architecture change. Preserve all existing experiment, foothold, identity, and owner gates. Previously gated action: " + action.action,
      gate: "Unexpected organic URL selection requires read-only diagnosis; no public mutation. Existing gate: " + action.gate,
      acceptanceCheck: "Reconcile every unexpected selected URL with fresh evidence; do not automatically redirect, delete, canonicalize, or rewrite a page. Existing acceptance: " + action.acceptanceCheck,
    },
  };
}

export function splitUrlDiagnosisFreshness({ activeSnapshotSha256, diagnosisSnapshotSha256 }) {
  const current = typeof activeSnapshotSha256 === "string"
    && activeSnapshotSha256.length > 0
    && activeSnapshotSha256 === diagnosisSnapshotSha256;
  return {
    current,
    warning: current ? null : {
      code: SPLIT_URL_DIAGNOSIS_STALE_WARNING,
      severity: "warning",
      scope: ["Holladay", "Herriman"],
      activeSnapshotSha256: activeSnapshotSha256 || null,
      diagnosisSnapshotSha256: diagnosisSnapshotSha256 || null,
      behavior: "Ignore the stale split-URL disposition and keep affected URL-competition cities in the diagnosis lane; do not suppress, redirect, canonicalize, noindex, delete, or rewrite a route from stale evidence.",
      requiredAction: "Refresh the bounded Holladay/Herriman split-URL diagnosis against the current GSC attribution snapshot.",
    },
  };
}

export function gscStateWithStaleSplitUrlFallback({
  city,
  activeState,
  splitUrlDiagnosisCurrent,
  staleScope = [],
}) {
  if (!splitUrlDiagnosisCurrent && staleScope.includes(city)) {
    return "url-competition-requires-diagnosis";
  }
  return activeState;
}

export function bestMeasuredRank(ranks = []) {
  const measured = ranks.filter((rank) => Number.isInteger(rank) && rank > 0);
  return measured.length ? Math.min(...measured) : null;
}

export function measuredMeanRank(ranks = []) {
  const measured = ranks.filter((rank) => Number.isInteger(rank) && rank > 0);
  if (!measured.length) return null;
  return Number((measured.reduce((sum, rank) => sum + rank, 0) / measured.length).toFixed(2));
}

export function interventionLane({ city, organicNumberOne = [], aioOwned = [], gscState, gscUrlDisposition = null, cohort, serviceAreaStatus }) {
  if (city === "Salt Lake City") return "observe-time-gated-slc-experiment";
  if (city === "Millcreek") return "owner-gated-verified-identity-and-integrity-cleanup";
  if (serviceAreaStatus?.startsWith("not-saved-")) return "not-saved-service-area-no-exact-cid-planning";
  if (organicNumberOne.length || aioOwned.length) return "protect-foothold-before-cleanup-or-intent-change";
  if (gscState === "url-competition-requires-diagnosis" && gscUrlDisposition !== "monitor-negligible-historical-trace") {
    return "diagnose-url-consolidation-before-intent-change";
  }
  if (cohort.startsWith("core-")) return "owner-gated-core-integrity-then-single-variable-intent-test";
  if (serviceAreaStatus?.startsWith("pending-")) return "service-area-proof-and-targeted-gsc-before-intent-change";
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
