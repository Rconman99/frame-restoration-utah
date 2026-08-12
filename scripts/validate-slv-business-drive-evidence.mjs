#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const receiptPath = "data/rank-tracker/evidence/SLV-BUSINESS-DRIVE-CONNECTOR-2026-08-12.json";
const serviceAreaRequestPath = "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json";
const programPath = "data/rank-tracker/SLV-CITY-GOAL-PROGRAM-2026-08-12.json";
const portfolioPath = "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));

const receipt = read(receiptPath);
const serviceAreaRequest = read(serviceAreaRequestPath);
const program = read(programPath);
const portfolio = read(portfolioPath);
const ownerViewEvidence = read("data/rank-tracker/evidence/SLV-GBP-OWNER-VIEW-LATEST.json");

const exactKeys = (value, expected, label) => {
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains an unexpected or missing field`);
};

exactKeys(receipt, [
  "schemaVersion",
  "evidenceId",
  "market",
  "observedAt",
  "status",
  "connector",
  "evidenceSearchPerformed",
  "searchClass",
  "searchedArtifacts",
  "acceptedCurrentGbpProfileEvidenceCount",
  "acceptedCurrentServiceAreaEvidenceCount",
  "supportingUtahEntityScopeDocumentCount",
  "credentialFieldsStored",
  "privateAddressesStored",
  "reviewerOrHomeownerIdentitiesStored",
  "publicMutationPerformed",
  "driveMutationPerformed",
  "source",
  "decision",
  "prohibited",
], "business Drive receipt");
exactKeys(receipt.connector, [
  "requiredAccount",
  "observedAccount",
  "match",
  "accessPath",
  "verificationClass",
], "business Drive connector");
exactKeys(receipt.source, ["method", "accountProof", "contentHandling"], "business Drive source summary");

assert.equal(receipt.schemaVersion, 1);
assert.equal(receipt.evidenceId, "frame-utah-business-drive-evidence-search-v1");
assert.equal(receipt.market, "utah-salt-lake-valley");
assert.equal(receipt.status, "BUSINESS_ACCOUNT_SEARCH_COMPLETE_CURRENT_GBP_PROOF_NOT_FOUND");
assert.equal(receipt.connector.requiredAccount, "ryan@framerestorations.com");
assert.equal(receipt.connector.observedAccount, receipt.connector.requiredAccount);
assert.equal(receipt.connector.match, true);
assert.equal(receipt.connector.accessPath, "gdrive-business");
assert.equal(receipt.connector.verificationClass, "read-only-drive-about-user-preflight");
assert.equal(receipt.evidenceSearchPerformed, true);
assert.equal(receipt.searchClass, "bounded-title-and-marker-audit");
assert.match(receipt.observedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);

assert.ok(receipt.searchedArtifacts.length > 0, "the completed search must list bounded artifact metadata");
const allowedArtifactTypes = new Set(["google-doc", "google-sheet"]);
const approvedPublicCities = new Set([
  ...serviceAreaRequest.alreadyVerified.map(({ city }) => city),
  ...serviceAreaRequest.citiesRequiringCurrentEvidence,
]);
for (const [index, artifact] of receipt.searchedArtifacts.entries()) {
  exactKeys(artifact, [
    "title",
    "type",
    "modifiedAt",
    "credentialBearing",
    "utahEntityMarker",
    "googleBusinessProfileMarker",
    "serviceAreaMarker",
    "approvedCityMarkers",
  ], `business Drive artifact ${index + 1}`);
  assert.equal(typeof artifact.title, "string");
  assert.ok(artifact.title.length > 0 && artifact.title.length <= 160, "artifact title must be bounded metadata");
  assert.ok(allowedArtifactTypes.has(artifact.type), `unsupported artifact type: ${artifact.type}`);
  assert.match(artifact.modifiedAt, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/u);
  for (const marker of [
    "credentialBearing",
    "utahEntityMarker",
    "googleBusinessProfileMarker",
    "serviceAreaMarker",
  ]) assert.equal(typeof artifact[marker], "boolean", `${marker} must be boolean metadata`);
  assert.ok(Array.isArray(artifact.approvedCityMarkers));
  for (const city of artifact.approvedCityMarkers) {
    assert.ok(approvedPublicCities.has(city), `unapproved or private place marker stored: ${city}`);
  }
}

assert.equal(receipt.acceptedCurrentGbpProfileEvidenceCount, 0);
assert.equal(receipt.acceptedCurrentServiceAreaEvidenceCount, 0);
assert.equal(receipt.credentialFieldsStored, 0);
assert.equal(receipt.privateAddressesStored, 0);
assert.equal(receipt.reviewerOrHomeownerIdentitiesStored, 0);
assert.equal(receipt.publicMutationPerformed, false);
assert.equal(receipt.driveMutationPerformed, false);
assert.match(receipt.decision, /current dated owner-view GBP screenshot set or export/u);
assert.match(receipt.decision, /no Drive reconnection is needed/u);
assert.ok(receipt.prohibited.some((rule) => rule.includes("Do not copy credential fields")));

assert.equal(serviceAreaRequest.drivePreflight.portableReceipt, receiptPath);
assert.equal(serviceAreaRequest.drivePreflight.state, "business-account-search-complete-current-gbp-proof-not-found");
assert.equal(serviceAreaRequest.drivePreflight.requiredAccount, receipt.connector.requiredAccount);
assert.equal(serviceAreaRequest.drivePreflight.observedAccount, receipt.connector.observedAccount);
assert.equal(serviceAreaRequest.drivePreflight.searchPerformed, true);
assert.equal(serviceAreaRequest.drivePreflight.acceptedCurrentServiceAreaEvidenceCount, 0);
assert.match(serviceAreaRequest.drivePreflight.nextAction, /does not need to be reconnected/u);

const programDriveAudit = program.authoritativeSources.businessDriveAudit;
assert.equal(programDriveAudit.portableReceipt, receiptPath);
assert.equal(programDriveAudit.searchPerformed, true);
assert.equal(programDriveAudit.requiredAccount, receipt.connector.requiredAccount);
assert.equal(programDriveAudit.observedAccount, receipt.connector.observedAccount);
assert.equal(programDriveAudit.acceptedPrimaryEvidenceCount, 0);
assert.equal(programDriveAudit.driveMutations, 0);
assert.ok([
  "search-complete-owner-view-gbp-receipt-required",
  "business-search-complete-partial-owner-view-evidence-registered",
  "business-search-and-current-owner-view-evidence-complete",
].includes(program.programGates.businessDrive.status));
assert.equal(
  portfolio.gates.businessDriveEvidence,
  ownerViewEvidence.status === "MEASURED_EXACT_CID_OWNER_VIEW"
    ? ownerViewEvidence.summary.knownProfileFields === 12 && ownerViewEvidence.summary.unknown === 0
      ? "business-account-search-and-current-owner-view-gbp-proof-complete"
      : "business-account-search-complete-partial-current-owner-view-gbp-proof-registered"
    : receipt.acceptedCurrentGbpProfileEvidenceCount === 0
    ? "business-account-search-complete-current-owner-view-gbp-proof-required"
    : portfolio.gates.businessDriveEvidence,
);

console.log(
  `PASS SLV business Drive evidence: ${receipt.connector.observedAccount} matched, ${receipt.searchedArtifacts.length} bounded artifacts audited, ${
    ownerViewEvidence.status === "MEASURED_EXACT_CID_OWNER_VIEW"
      ? "current sanitized owner-view proof registered"
      : "current GBP proof remains required"
  }`,
);
