import test from "node:test";
import assert from "node:assert/strict";
import { assertScoreVector, bestMeasuredRank, interventionLane, measuredMeanRank, scoreVector } from "./slv-intervention-queue.mjs";

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
