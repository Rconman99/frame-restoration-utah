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

const outputPath = "data/rank-tracker/SLV-ENTITY-HEALTH-2026-08-12.json";
const sourceFiles = {
  portfolio: "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json",
  business: "data/route-factory/business.json",
  reviewFeed: "reviews.json",
  reviewArchive: "data/reviews-full.json",
};
const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const readText = (file) => fs.readFileSync(path.join(root, file), "utf8");
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const digits = (value) => String(value || "").replace(/\D/g, "");
const cidFromDataId = (dataId) => {
  const match = String(dataId || "").match(/:0x([0-9a-f]+)$/i);
  return match ? BigInt(`0x${match[1]}`).toString(10) : null;
};

function roofingEntity(html) {
  const scripts = [...html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)];
  for (const [, raw] of scripts) {
    let value;
    try {
      value = JSON.parse(raw);
    } catch {
      continue;
    }
    const nodes = value?.["@graph"] || [value];
    const entity = nodes.find((node) => {
      const types = Array.isArray(node?.["@type"]) ? node["@type"] : [node?.["@type"]];
      return types.includes("RoofingContractor");
    });
    if (entity) return entity;
  }
  return null;
}

const portfolio = readJson(sourceFiles.portfolio);
const business = readJson(sourceFiles.business);
const reviewFeed = readJson(sourceFiles.reviewFeed);
const reviewArchive = readJson(sourceFiles.reviewArchive);
const slvCid = portfolio.cityCompletionContract.maps.exactCid;
const heberCid = business.gbp.cid;
const inferredReviewCid = cidFromDataId(reviewArchive.data_id);
const canonicalPhoneDigits = digits(business.public_phone_e164);
const citySpecificAssets = [];
const editorialGaps = [];
const profileIdentityCounts = {};

const cities = portfolio.cityGoals.map((goal) => {
  const html = readText(goal.page);
  const entity = roofingEntity(html);
  assert.ok(entity, `missing RoofingContractor JSON-LD: ${goal.page}`);

  const telValues = [...html.matchAll(/href=["']tel:([^"']+)["']/gi)].map((match) => match[1]);
  const schemaPhones = [...html.matchAll(/["']telephone["']\s*:\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const phoneMismatches = [...telValues, ...schemaPhones]
    .filter((phone) => digits(phone) !== canonicalPhoneDigits)
    .map((phone) => ({ value: phone, digits: digits(phone) }));
  const regionValues = [...html.matchAll(/["']addressRegion["']\s*:\s*["']([^"']+)["']/gi)].map((match) => match[1]);
  const regionMismatches = regionValues.filter((region) => region !== "UT");
  const blogLinks = [...html.matchAll(/href=["'](\/blog\/[^"'#?]+)["']/gi)].map((match) => match[1]);
  const blogDir = path.join(root, "blog", goal.slug);
  const cityAssetFiles = fs.existsSync(blogDir)
    ? fs.readdirSync(blogDir).filter((file) => file.endsWith(".html")).sort().map((file) => `blog/${goal.slug}/${file}`)
    : [];
  const hasCitySpecificAsset = cityAssetFiles.length > 0;
  (hasCitySpecificAsset ? citySpecificAssets : editorialGaps).push(goal.city);

  const hasMap = entity.hasMap || null;
  const identityProfile = hasMap === `https://www.google.com/maps?cid=${slvCid}`
    ? "salt-lake-valley-exact-cid"
    : hasMap === `https://www.google.com/maps?cid=${heberCid}`
      ? "heber-keystone-cid"
      : "other-or-missing";
  profileIdentityCounts[identityProfile] = (profileIdentityCounts[identityProfile] || 0) + 1;

  return {
    city: goal.city,
    slug: goal.slug,
    page: goal.page,
    pageSha256: sha256(goal.page),
    serviceAreaStatus: goal.serviceAreaStatus,
    identityProfile,
    hasMap,
    sameAsCount: Array.isArray(entity.sameAs) ? entity.sameAs.length : 0,
    nap: {
      telLinkCount: telValues.length,
      schemaTelephoneCount: schemaPhones.length,
      phoneMismatches,
      schemaAddressRegions: [...new Set(regionValues)].sort(),
      regionMismatches,
    },
    editorial: {
      internalBlogLinkCount: blogLinks.length,
      hasCitySpecificAsset,
      citySpecificAssets: cityAssetFiles,
    },
  };
});

const verifiedProfileCities = portfolio.cityGoals
  .filter((goal) => !goal.serviceAreaStatus.startsWith("pending-"))
  .map((goal) => goal.city);
const pendingServiceAreaCities = portfolio.cityGoals
  .filter((goal) => goal.serviceAreaStatus.startsWith("pending-"))
  .map((goal) => goal.city);
const allPhoneMismatches = cities.flatMap((city) => city.nap.phoneMismatches.map((item) => ({ city: city.city, ...item })));
const allRegionMismatches = cities.flatMap((city) => city.nap.regionMismatches.map((value) => ({ city: city.city, value })));

const health = {
  schemaVersion: 1,
  healthId: "frame-utah-slv-18-city-entity-health-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T19:12:11Z",
  status: "baseline-pinned-public-fixes-gated",
  publicMutationPerformed: false,
  sources: Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: sha256(file) }])),
  identity: {
    saltLakeValley: {
      cid: slvCid,
      verifiedProfileCities,
      pendingCurrentProfileServiceAreaVerification: pendingServiceAreaCities,
    },
    heber: {
      cid: heberCid,
      dataId: business.gbp.data_id,
      sameAsCount: business.entity_links.sameAs.length,
      appleMapsPresentInKeystone: business.entity_links.sameAs.some((url) => url.startsWith("https://maps.apple/")),
    },
    pageProfileCounts: profileIdentityCounts,
    observation: "The Salt Lake City page uses the exact Salt Lake Valley CID. Seventeen other city pages still use the Heber keystone entity; Millcreek's verified service-area status makes its identity correction a pinned public-cleanup item, not an automatic change.",
  },
  reviews: {
    heber: {
      state: "measured-attributed-to-heber-only",
      storedDataId: reviewArchive.data_id,
      storedGoogleCid: reviewArchive.google_cid || null,
      inferredGoogleCid: inferredReviewCid,
      aggregateRating: reviewArchive.aggregate.rating,
      aggregateReviewCount: reviewArchive.aggregate.review_count,
      archivedReviewRows: reviewArchive.reviews.length,
      feedReviewRows: reviewFeed.reviews.length,
      lastReviewDate: reviewArchive.reviews.map((review) => review.date).sort().at(-1),
      feedUpdatedAt: reviewFeed.updated_at,
    },
    saltLakeValley: {
      cid: slvCid,
      state: "unmeasured",
      rule: "Never count the Heber export as Salt Lake Valley review evidence. Measure only an exact-CID provider response or an explicitly matching SerpAPI data_id.",
    },
    automationSafety: {
      test: "npm run test:review-targeting",
      behavior: "Alternate GOOGLE_CID runs fail closed rather than falling back to the default Heber SerpAPI data_id.",
    },
  },
  nap: {
    scope: "18 portfolio city pages",
    canonicalPublicPhone: business.public_phone_e164,
    pagesChecked: cities.length,
    phoneMismatchCount: allPhoneMismatches.length,
    regionMismatchCount: allRegionMismatches.length,
    phoneMismatches: allPhoneMismatches,
    regionMismatches: allRegionMismatches,
  },
  editorial: {
    pagesWithAtLeastOneInternalBlogLink: cities.filter((city) => city.editorial.internalBlogLinkCount > 0).length,
    citiesWithCitySpecificAssets: citySpecificAssets.length,
    citySpecificAssetCities: citySpecificAssets,
    citiesWithoutCitySpecificAssets: editorialGaps.length,
    evidenceFirstGaps: editorialGaps,
    rule: "Do not auto-generate thin city posts. Close a gap only with real local evidence and the public release/doorway-page gates.",
  },
  decisions: [
    "Protect Magna and Kearns organic #1 footholds while cleanup remains gated.",
    "Measure the Salt Lake Valley CID review baseline after this fail-closed targeting safeguard lands and valid provider credentials are available.",
    "Treat Kearns, Magna, Midvale, South Salt Lake, and Taylorsville as evidence-first editorial gaps; no unsupported local content.",
    "Do not treat Apple Maps as missing: it is present in the canonical Heber entity keystone.",
  ],
  cities,
};

assert.equal(health.cities.length, 18);
assert.deepEqual(verifiedProfileCities, ["Salt Lake City", "Millcreek"]);
assert.equal(pendingServiceAreaCities.length, 16);
assert.equal(inferredReviewCid, heberCid, "review archive must resolve to the Heber CID");
assert.notEqual(inferredReviewCid, slvCid, "Heber review data must not be attributed to the Salt Lake Valley CID");
assert.equal(reviewArchive.reviews.length, reviewArchive.aggregate.review_count);
assert.equal(health.nap.phoneMismatchCount, 0);
assert.equal(health.nap.regionMismatchCount, 0);
assert.equal(health.editorial.pagesWithAtLeastOneInternalBlogLink, 18);
assert.equal(health.editorial.citiesWithCitySpecificAssets, 13);
assert.deepEqual(health.editorial.evidenceFirstGaps, ["Kearns", "Magna", "Midvale", "South Salt Lake", "Taylorsville"]);
assert.equal(health.identity.pageProfileCounts["salt-lake-valley-exact-cid"], 1);
assert.equal(health.identity.pageProfileCounts["heber-keystone-cid"], 17);
assert.equal(health.identity.heber.appleMapsPresentInKeystone, true);

const nextText = `${JSON.stringify(health, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV entity health: 18 pages, ${verifiedProfileCities.length} profile-verified cities, ${editorialGaps.length} editorial evidence gaps, SLC reviews unmeasured`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV entity health is stale; run npm run sync:slv-entity-health");
  console.log("PASS SLV entity health: 18 pages, clean scoped NAP, Heber reviews isolated, SLC reviews unmeasured");
}
