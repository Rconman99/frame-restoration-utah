#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { aggregateMapsLeaders, assertMapsReadinessCity, mapsReadinessLane } from "./lib/slv-maps-readiness.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-MAPS-READINESS-2026-08-12.json";
const sourceFiles = {
  portfolio: "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json",
  displacement: "data/rank-tracker/SLV-COMPETITOR-DISPLACEMENT-2026-08-12.json",
  entityHealth: "data/rank-tracker/SLV-ENTITY-HEALTH-2026-08-12.json",
  serviceAreaRequest: "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json",
  ownerProfileAuditRequest: "data/authority/SLV-GBP-OWNER-AUDIT-REQUEST-2026-08-12.json",
};
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const portfolio = read(sourceFiles.portfolio);
const displacement = read(sourceFiles.displacement);
const entityHealth = read(sourceFiles.entityHealth);
const serviceAreaRequest = read(sourceFiles.serviceAreaRequest);
const ownerProfileAuditRequest = read(sourceFiles.ownerProfileAuditRequest);
const ownerProfileCompletenessState = ownerProfileAuditRequest.evidenceState;
const entityByCity = new Map(entityHealth.cities.map((city) => [city.city, city]));
const queriesByCity = new Map();
for (const query of displacement.queries) {
  if (!queriesByCity.has(query.city)) queriesByCity.set(query.city, []);
  queriesByCity.get(query.city).push(query);
}

const nextAction = ({ city, lane }) => {
  if (lane === "service-area-proof-before-exact-cid-planning") {
    return `Obtain current owner-view service-area evidence for ${city} and the read-only exact-CID profile audit; do not attach the Salt Lake CID to the city page or edit GBP unless a later reviewed scope is explicitly approved.`;
  }
  if (lane === "owner-gated-page-identity-correction") {
    return "Collect the exact-CID review and owner-profile baselines, then request the pinned Millcreek page-identity correction separately; preserve the owned AIO citation and do not edit GBP from this ledger.";
  }
  if (lane === "exact-cid-review-and-owner-profile-audit") {
    return "Keep the Salt Lake City page frozen, measure the exact-CID review baseline, collect the owner-view profile audit, and compare the next fixed weekly panel before proposing a relevance or prominence change.";
  }
  return "Continue the fixed weekly exact-CID panel and isolate only one separately approved relevance or prominence intervention after owner evidence is complete.";
};

const cities = portfolio.cityGoals.map((goal) => {
  const entity = entityByCity.get(goal.city);
  const queries = queriesByCity.get(goal.city) || [];
  assert.ok(entity, `missing entity evidence: ${goal.city}`);
  assert.equal(queries.length, 4, `missing fixed Maps evidence: ${goal.city}`);
  const leaders = aggregateMapsLeaders(queries);
  const exactCidReturned = queries.filter((query) => Number.isInteger(query.target.exactCidMapRank)).length;
  const exactCidNumberOne = queries.filter((query) => query.target.exactCidMapRank === 1).length;
  const packsPresent = queries.filter((query) => query.surfaces.maps.packPresent).length;
  const lane = mapsReadinessLane({
    city: goal.city,
    serviceAreaStatus: goal.serviceAreaStatus,
    identityProfile: entity.identityProfile,
    exactCidReviewState: entityHealth.reviews.saltLakeValley.state,
    ownerProfileCompletenessState,
  });
  const row = {
    city: goal.city,
    slug: goal.slug,
    page: goal.page,
    panelId: goal.panelId,
    lane,
    publicMutationAuthorized: false,
    googleRankingAxes: {
      relevance: {
        serviceAreaEvidence: goal.serviceAreaStatus,
        pageIdentity: entity.identityProfile,
        exactCidOwnerProfileFields: "unmeasured-owner-view-audit-required",
        rule: "Use accurate, complete, real-world business information; a city keyword or website route is not profile evidence."
      },
      distance: {
        state: "fixed-city-mobile-panel-measured-not-an-editable-ranking-lever",
        providerLocation: queries[0].city,
        rule: "Retain the fixed city/device panel and report what Google returns; do not create fake locations or duplicate profiles to manipulate distance."
      },
      prominence: {
        exactCidReviews: entityHealth.reviews.saltLakeValley.state,
        organicNumberOneQueries: queries.filter((query) => query.target.organicRank === 1).map((query) => query.keyword),
        ownedGoogleAiOverviewCitations: queries.filter((query) => query.target.aiOverviewCited).map((query) => query.keyword),
        rule: "Measure genuine review strength and earned web authority separately; no incentives, gating, fabricated reviews, or paid ranking links."
      }
    },
    maps: {
      packsPresent,
      packsAbsent: 4 - packsPresent,
      exactCidReturned,
      exactCidNumberOne,
      exactCidRanks: queries.map((query) => query.target.exactCidMapRank),
      dominantDisplacers: leaders.slice(0, 3),
    },
    queries: queries.map((query) => ({
      queryId: query.queryId,
      keyword: query.keyword,
      packState: query.surfaces.maps.state,
      exactCidRank: query.target.exactCidMapRank,
      numberOneEntity: query.surfaces.maps.top ? {
        name: query.surfaces.maps.top.name,
        cid: query.surfaces.maps.top.cid,
      } : null,
    })),
    nextAction: nextAction({ city: goal.city, lane }),
    gates: {
      ownerEvidence: lane === "service-area-proof-before-exact-cid-planning" ? serviceAreaRequest.requestId : ownerProfileAuditRequest.requestId,
      exactCidReviewBaseline: entityHealth.reviews.saltLakeValley.state,
      pageOrProfileMutation: "separate-reviewed-scope-and-explicit-owner-approval-required",
    },
  };
  assertMapsReadinessCity(row);
  return row;
});

const laneCounts = Object.fromEntries([...new Set(cities.map((city) => city.lane))].sort().map((lane) => [lane, cities.filter((city) => city.lane === lane).length]));
const ledger = {
  schemaVersion: 1,
  ledgerId: "frame-utah-slv-exact-cid-maps-readiness-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T21:12:00Z",
  status: "read-only-diagnosis-public-and-gbp-actions-gated",
  publicMutationPerformed: false,
  objective: "Make the exact verified Salt Lake Valley CID measurable and evidence-ready for ethical #1 Maps displacement across all 18 city panels without treating distance as an editable lever or inventing profile facts.",
  target: {
    business: "Frame Restoration Utah LLC",
    exactCid: portfolio.cityCompletionContract.maps.exactCid,
    fixedQueries: portfolio.cityCompletionContract.maps.queries,
    requiredConsecutiveWeeklyPanels: portfolio.cityCompletionContract.maps.requiredConsecutiveWeeklyPanels,
  },
  officialGoogleRules: {
    checkedAt: "2026-08-12",
    sources: [
      {
        title: "Tips to improve your local ranking on Google",
        url: "https://support.google.com/business/answer/7091?hl=en-en",
        implications: [
          "Local results are mainly based on relevance, distance, and prominence.",
          "Complete and accurate information, verification, current hours, review replies, and photos/videos are legitimate operating inputs.",
          "There is no way to request or pay Google for a better local ranking."
        ]
      },
      {
        title: "Manage your service areas for service-area and hybrid businesses",
        url: "https://support.google.com/business/answer/9157481?hl=en",
        implications: [
          "A service-area business has one profile for the whole area it serves unless separate eligible staffed locations exist.",
          "Use up to 20 specific, accurate cities, postal codes, or areas; the overall boundary generally should remain within about two hours of the business base.",
          "A business that does not serve customers at its address should remove or hide that address."
        ]
      },
      {
        title: "Guidelines for representing your business on Google",
        url: "https://support.google.com/business/answer/3038177?hl=en",
        implications: [
          "Use the real-world business name, an accurate address or service area, and the fewest specific categories that describe the core business.",
          "Do not use virtual offices, duplicate profiles, unnecessary name keywords, or categories solely as keywords.",
          "A service-area profile must reflect an actual eligible business and accurate customer service area."
        ]
      }
    ]
  },
  sources: Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: sha256(file) }])),
  summary: {
    cities: cities.length,
    queries: cities.length * 4,
    mapsPacksPresent: cities.reduce((sum, city) => sum + city.maps.packsPresent, 0),
    mapsPacksAbsent: cities.reduce((sum, city) => sum + city.maps.packsAbsent, 0),
    exactCidReturned: cities.reduce((sum, city) => sum + city.maps.exactCidReturned, 0),
    exactCidNumberOne: cities.reduce((sum, city) => sum + city.maps.exactCidNumberOne, 0),
    profileVerifiedCities: cities.filter((city) => !city.googleRankingAxes.relevance.serviceAreaEvidence.startsWith("pending-")).length,
    citiesPendingServiceAreaEvidence: cities.filter((city) => city.googleRankingAxes.relevance.serviceAreaEvidence.startsWith("pending-")).length,
    pagesUsingExactCidIdentity: cities.filter((city) => city.googleRankingAxes.relevance.pageIdentity === "salt-lake-valley-exact-cid").length,
    exactCidReviewState: entityHealth.reviews.saltLakeValley.state,
    ownerProfileCompletenessState,
    citiesReadyForMapsIntervention: cities.filter((city) => city.lane.endsWith("weekly-exact-cid-displacement-measurement")).length,
    laneCounts,
  },
  systemNextActions: [
    "Land the exact-CID review measurement workflow, then measure the Salt Lake Valley review baseline without storing reviewer identity or review text.",
    "Collect the read-only exact-CID owner profile audit under ryan@framerestorations.com; no profile edit is authorized.",
    "Collect current service-area evidence for the 16 pending cities before exact-CID page identity planning.",
    "Keep fixed city/device panels and compare exact competing CIDs weekly; never interpret distance as permission for a fake location or duplicate profile."
  ],
  prohibited: [
    "No GBP, review, service-area, category, service, hours, photo, post, directory, page, schema, indexing, outreach, ads, DNS, or public-account mutation from this ledger.",
    "No duplicate profile, virtual office, fake location, keyword-stuffed name, category stuffing, or unsupported service area.",
    "No review incentives, review gating, fabricated reviews, suppression, or competitor manipulation.",
    "No paid local placement counts toward the exact-CID organic Maps goal.",
    "No missing pack or absent exact CID is converted to rank zero."
  ],
  cities,
};

assert.equal(ledger.summary.cities, 18);
assert.equal(ledger.summary.queries, 72);
assert.equal(ledger.summary.mapsPacksPresent, displacement.score.mapsPacksPresent);
assert.equal(ledger.summary.mapsPacksAbsent, displacement.score.mapsPacksAbsent);
assert.equal(ledger.summary.exactCidNumberOne, displacement.score.exactCidMapsNumberOne);
assert.equal(ledger.summary.profileVerifiedCities, 2);
assert.equal(ledger.summary.citiesPendingServiceAreaEvidence, 16);
assert.equal(ledger.summary.pagesUsingExactCidIdentity, 1);
assert.equal(ledger.summary.citiesReadyForMapsIntervention, 0);
assert.equal(ownerProfileAuditRequest.delivery.externalSendAuthorized, false);
assert.ok(["unmeasured-owner-view-audit-required", "measured-exact-cid-owner-view"].includes(ownerProfileCompletenessState));
assert.equal(serviceAreaRequest.delivery.externalSendAuthorized, false);
assert.ok(cities.every((city) => city.queries.length === 4));
assert.ok(cities.every((city) => city.publicMutationAuthorized === false));
assert.ok(cities.filter((city) => city.lane === "service-area-proof-before-exact-cid-planning").length === 16);

const nextText = `${JSON.stringify(ledger, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV Maps readiness: ${ledger.summary.cities} cities, ${ledger.summary.exactCidReturned}/72 exact-CID returns, ${ledger.summary.citiesPendingServiceAreaEvidence} service-area proof gaps`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV Maps readiness is stale; run npm run sync:slv-maps-readiness");
  console.log(`PASS SLV Maps readiness: ${ledger.summary.cities} cities, Google relevance/distance/prominence lanes pinned, no public authorization`);
}
