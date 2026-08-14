import test from "node:test";
import assert from "node:assert/strict";
import {
  SPLIT_URL_DIAGNOSIS_STALE_WARNING,
  assertScoreVector,
  bestMeasuredRank,
  gscStateWithStaleSplitUrlFallback,
  interventionLane,
  measuredMeanRank,
  scoreVector,
  splitUrlDiagnosisFreshness,
} from "./slv-intervention-queue.mjs";

test("a changed GSC snapshot emits a named warning and expires only the split-URL suppression", () => {
  const fresh = splitUrlDiagnosisFreshness({
    activeSnapshotSha256: "same",
    diagnosisSnapshotSha256: "same",
  });
  assert.equal(fresh.current, true);
  assert.equal(fresh.warning, null);

  const stale = splitUrlDiagnosisFreshness({
    activeSnapshotSha256: "new-gsc-snapshot",
    diagnosisSnapshotSha256: "diagnosed-snapshot",
  });
  assert.equal(stale.current, false);
  assert.equal(stale.warning.code, SPLIT_URL_DIAGNOSIS_STALE_WARNING);
  assert.deepEqual(stale.warning.scope, ["Holladay", "Herriman"]);
  assert.match(stale.warning.behavior, /Ignore the stale split-URL disposition/);
  assert.match(stale.warning.behavior, /diagnosis lane/);
});

test("stale split-URL scope stays in diagnosis across intended-only and unreturned active states", () => {
  for (const activeState of ["intended-only", "targeted-gsc-not-complete"]) {
    assert.equal(gscStateWithStaleSplitUrlFallback({
      city: "Holladay",
      activeState,
      splitUrlDiagnosisCurrent: false,
      staleScope: ["Holladay", "Herriman"],
    }), "url-competition-requires-diagnosis");
  }
  assert.equal(gscStateWithStaleSplitUrlFallback({
    city: "Sandy",
    activeState: "intended-only",
    splitUrlDiagnosisCurrent: false,
    staleScope: ["Holladay", "Herriman"],
  }), "intended-only");
});

test("rank helpers preserve missing evidence instead of converting it to a zero or exact rank", () => {
  assert.equal(bestMeasuredRank([null, 25, 19, null]), 19);
  assert.equal(measuredMeanRank([null, 25, 19, null]), 22);
  assert.equal(bestMeasuredRank([null, null, null, null]), null);
  assert.equal(measuredMeanRank([null, null, null, null]), null);
});

test("the lane selector protects experiments and footholds before generic optimization", () => {
  assert.equal(interventionLane({ city: "Salt Lake City" }), "observe-time-gated-slc-experiment");
  assert.equal(interventionLane({ city: "Millcreek" }), "owner-gated-verified-identity-and-integrity-cleanup");
  assert.equal(interventionLane({ city: "Magna", organicNumberOne: ["roof replacement magna"] }), "protect-foothold-before-cleanup-or-intent-change");
  assert.equal(interventionLane({ city: "Holladay", organicNumberOne: [], aioOwned: [], gscState: "url-competition-requires-diagnosis" }), "diagnose-url-consolidation-before-intent-change");
  assert.equal(interventionLane({
    city: "Herriman",
    organicNumberOne: [],
    aioOwned: [],
    gscState: "url-competition-requires-diagnosis",
    gscUrlDisposition: "monitor-negligible-historical-trace",
    cohort: "expansion-manual-baseline-measured",
    serviceAreaStatus: "pending-current-profile-service-area-verification",
  }), "service-area-proof-and-targeted-gsc-before-intent-change");
});

test("pending service-area evidence blocks expansion intent changes even with an organic baseline", () => {
  assert.equal(interventionLane({
    city: "Murray",
    organicNumberOne: [],
    aioOwned: [],
    gscState: "targeted-gsc-not-complete",
    cohort: "expansion-manual-baseline-measured",
    serviceAreaStatus: "pending-current-profile-service-area-verification",
  }), "service-area-proof-and-targeted-gsc-before-intent-change");
});

test("a measured not-saved city cannot enter the exact-CID optimization lane", () => {
  assert.equal(interventionLane({
    city: "Midvale",
    cohort: "expansion-manual-baseline-measured",
    serviceAreaStatus: "not-saved-current-profile-service-area",
    gscState: "measured",
  }), "not-saved-service-area-no-exact-cid-planning");
});

test("score vectors are bounded and reward corroborated footholds without hiding compliance cost", () => {
  const vector = scoreVector({
    ranks: [7, 2, 1, 3],
    organicNumberOne: ["roof replacement magna"],
    aioOwned: ["roof replacement magna"],
    aioPresent: 1,
    gscRequested: 0,
    gscFixedQueries: 4,
    serviceAreaVerified: false,
    lane: "protect-foothold-before-cleanup-or-intent-change",
  });
  assertScoreVector(vector);
  assert.equal(vector.leadValue, 10);
  assert.equal(vector.authorityValue, 10);
  assert.equal(vector.complianceRisk, 8);
  assert.equal(vector.customerBlockerRisk, 8);
});
