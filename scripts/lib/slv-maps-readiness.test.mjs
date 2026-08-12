import test from "node:test";
import assert from "node:assert/strict";
import { aggregateMapsLeaders, assertMapsReadinessCity, mapsReadinessLane } from "./slv-maps-readiness.mjs";

test("Maps leader aggregation preserves exact CIDs and query-level dominance", () => {
  const queries = [
    { keyword: "roof repair test", surfaces: { maps: { leaders: [
      { rank: 1, name: "Alpha Roofing", cid: "111", domain: "google.com", isTarget: false },
      { rank: 2, name: "Beta Roofing", cid: "222", domain: "google.com", isTarget: false },
    ] } } },
    { keyword: "roofer test", surfaces: { maps: { leaders: [
      { rank: 1, name: "Alpha Roofing", cid: "111", domain: "google.com", isTarget: false },
    ] } } },
  ];
  assert.deepEqual(aggregateMapsLeaders(queries), [
    { name: "Alpha Roofing", cid: "111", domain: "google.com", appearances: 2, numberOneQueries: 2, bestRank: 1, keywords: ["roof repair test", "roofer test"] },
    { name: "Beta Roofing", cid: "222", domain: "google.com", appearances: 1, numberOneQueries: 0, bestRank: 2, keywords: ["roof repair test"] },
  ]);
});

test("service-area evidence is the first gate for an unverified city", () => {
  assert.equal(mapsReadinessLane({
    city: "Sandy",
    serviceAreaStatus: "pending-current-profile-service-area-verification",
    identityProfile: "heber-keystone-cid",
    exactCidReviewState: "unmeasured",
  }), "service-area-proof-before-exact-cid-planning");
});

test("a verified city with the Heber entity is held for owner-gated identity correction", () => {
  assert.equal(mapsReadinessLane({
    city: "Millcreek",
    serviceAreaStatus: "saved-service-area-observed",
    identityProfile: "heber-keystone-cid",
    exactCidReviewState: "unmeasured",
  }), "owner-gated-page-identity-correction");
});

test("an aligned city requires exact-CID prominence evidence before displacement work", () => {
  assert.equal(mapsReadinessLane({
    city: "Salt Lake City",
    serviceAreaStatus: "verified-profile-identity-city",
    identityProfile: "salt-lake-valley-exact-cid",
    exactCidReviewState: "unmeasured",
    ownerProfileCompletenessState: "unmeasured-owner-view-audit-required",
  }), "exact-cid-review-and-owner-profile-audit");
  assert.doesNotThrow(() => assertMapsReadinessCity({
    city: "Salt Lake City",
    queries: [{}, {}, {}, {}],
    maps: { packsPresent: 3, packsAbsent: 1, exactCidReturned: 0, exactCidNumberOne: 0 },
    nextAction: "Measure without mutation.",
    publicMutationAuthorized: false,
  }));
});

test("a fully evidenced aligned city advances to weekly exact-CID displacement measurement", () => {
  assert.equal(mapsReadinessLane({
    city: "Salt Lake City",
    serviceAreaStatus: "verified-profile-identity-city",
    identityProfile: "salt-lake-valley-exact-cid",
    exactCidReviewState: "measured-exact-cid",
    ownerProfileCompletenessState: "measured-exact-cid-owner-view",
  }), "weekly-exact-cid-displacement-measurement");
});
