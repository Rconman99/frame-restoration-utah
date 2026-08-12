import test from "node:test";
import assert from "node:assert/strict";
import {
  baselineServiceAreaStatus,
  sanitizeOwnerEvidenceInput,
  serviceAreaStatusFromReceipt,
  validateOwnerEvidenceReceipt,
} from "./slv-gbp-owner-evidence.mjs";

const cities = ["Salt Lake City", "Millcreek", "Sandy"];
const now = new Date("2026-08-12T23:00:00Z");

function validInput() {
  return {
    schemaVersion: 1,
    observedAt: "2026-08-12T22:45:00Z",
    observerAccount: "ryan@framerestorations.com",
    profile: {
      business: "Frame Restoration Utah LLC",
      cid: "5689850818145735734",
      exactCidVisible: true,
      verificationState: "verified",
      businessType: "service-area",
      addressVisibility: "hidden",
      primaryCategory: "Roofing contractor",
      secondaryCategories: ["General contractor"],
      configuredRoofingServices: ["Roof repair"],
      regularHoursState: "configured",
      specialHoursState: "current",
      mostRecentOwnerPhotoDate: "2026-08-10",
      googleRating: 5,
      googleReviewCount: 4,
      reviewResponseCoverageState: "all-responded",
    },
    serviceAreas: [
      { city: "Salt Lake City", savedState: "saved" },
      { city: "Millcreek", savedState: "saved" },
      { city: "Sandy", savedState: "unknown" },
    ],
    attestation: {
      currentOwnerView: true,
      readOnly: true,
      privateAddressOmitted: true,
      credentialsOmitted: true,
      reviewerIdentitiesOmitted: true,
      profileEditsPerformed: false,
    },
  };
}

test("current exact-CID owner-view input produces only a sanitized receipt", () => {
  const receipt = sanitizeOwnerEvidenceInput(validInput(), { expectedCities: cities, now });
  assert.equal(receipt.status, "MEASURED_EXACT_CID_OWNER_VIEW");
  assert.deepEqual(receipt.summary, {
    citiesExpected: 3,
    citiesMeasured: 2,
    saved: 2,
    notSaved: 0,
    unknown: 1,
    knownProfileFields: 12,
  });
  assert.doesNotThrow(() => validateOwnerEvidenceReceipt(receipt, { expectedCities: cities, now }));
  assert.equal(JSON.stringify(receipt).includes("attestation"), false);
});

test("wrong account, wrong CID, edit activity, and stale evidence fail closed", () => {
  const wrongAccount = validInput();
  wrongAccount.observerAccount = "ryanconwell99@gmail.com";
  assert.throws(() => sanitizeOwnerEvidenceInput(wrongAccount, { expectedCities: cities, now }));

  const wrongCid = validInput();
  wrongCid.profile.cid = "8458659884566588108";
  assert.throws(() => sanitizeOwnerEvidenceInput(wrongCid, { expectedCities: cities, now }));

  const edited = validInput();
  edited.attestation.profileEditsPerformed = true;
  assert.throws(() => sanitizeOwnerEvidenceInput(edited, { expectedCities: cities, now }));

  const stale = validInput();
  stale.observedAt = "2026-07-01T12:00:00Z";
  assert.throws(() => sanitizeOwnerEvidenceInput(stale, { expectedCities: cities, now }));

  const staleReceipt = sanitizeOwnerEvidenceInput(validInput(), { expectedCities: cities, now });
  assert.throws(() => validateOwnerEvidenceReceipt(staleReceipt, {
    expectedCities: cities,
    now: new Date("2026-08-27T23:00:00Z"),
  }));
});

test("incomplete or duplicate city matrices fail closed", () => {
  const incomplete = validInput();
  incomplete.serviceAreas.pop();
  assert.throws(() => sanitizeOwnerEvidenceInput(incomplete, { expectedCities: cities, now }));

  const duplicate = validInput();
  duplicate.serviceAreas[2].city = "Millcreek";
  assert.throws(() => sanitizeOwnerEvidenceInput(duplicate, { expectedCities: cities, now }));

  const inconsistentReceipt = sanitizeOwnerEvidenceInput(validInput(), { expectedCities: cities, now });
  inconsistentReceipt.summary.knownProfileFields = 0;
  assert.throws(() => validateOwnerEvidenceReceipt(inconsistentReceipt, { expectedCities: cities, now }));
});

test("private addresses, emails, phone numbers, URLs, and blank templates fail closed", () => {
  for (const unsafeValue of [
    "123 Private Street",
    "person@example.com",
    "801-555-1234",
    "https://example.com/private",
    "API key value",
  ]) {
    const unsafe = validInput();
    unsafe.profile.configuredRoofingServices = [unsafeValue];
    assert.throws(() => sanitizeOwnerEvidenceInput(unsafe, { expectedCities: cities, now }));
  }

  const blank = validInput();
  blank.profile.verificationState = "unknown";
  blank.profile.businessType = "unknown";
  blank.profile.addressVisibility = "unknown";
  blank.profile.primaryCategory = null;
  blank.profile.secondaryCategories = null;
  blank.profile.configuredRoofingServices = null;
  blank.profile.regularHoursState = "unknown";
  blank.profile.specialHoursState = "unknown";
  blank.profile.mostRecentOwnerPhotoDate = null;
  blank.profile.googleRating = null;
  blank.profile.googleReviewCount = null;
  blank.profile.reviewResponseCoverageState = "unknown";
  blank.serviceAreas = blank.serviceAreas.map((row) => ({ ...row, savedState: "unknown" }));
  assert.throws(() => sanitizeOwnerEvidenceInput(blank, { expectedCities: cities, now }));
});

test("sanitized saved-state evidence advances only previously pending city status", () => {
  assert.equal(
    serviceAreaStatusFromReceipt("pending-current-profile-service-area-verification", { city: "Sandy", savedState: "saved" }),
    "saved-current-profile-service-area-observed",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("pending-current-profile-service-area-verification", { city: "Sandy", savedState: "not-saved" }),
    "not-saved-current-profile-service-area",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("pending-current-profile-service-area-verification", { city: "Sandy", savedState: "unknown" }),
    "pending-current-profile-service-area-verification",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("verified-profile-identity-city", { city: "Salt Lake City", savedState: "not-saved" }),
    "verified-profile-identity-city",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("saved-service-area-observed", { city: "Millcreek", savedState: "not-saved" }),
    "not-saved-current-profile-service-area",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("saved-service-area-observed", { city: "Millcreek", savedState: "unknown" }),
    "saved-service-area-observed",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("saved-current-profile-service-area-observed", undefined),
    "pending-current-profile-service-area-verification",
  );
  assert.equal(
    serviceAreaStatusFromReceipt("not-saved-current-profile-service-area", undefined),
    "pending-current-profile-service-area-verification",
  );
});

test("generated service-area states always restart from immutable identity evidence", () => {
  const millcreekBaseline = baselineServiceAreaStatus({
    city: "Millcreek",
    identityEvidence: "verified-profile-saved-service-area",
    serviceAreaStatus: "saved-current-profile-service-area-observed",
  });
  assert.equal(millcreekBaseline, "saved-service-area-observed");
  assert.equal(
    serviceAreaStatusFromReceipt(millcreekBaseline, { city: "Millcreek", savedState: "saved" }),
    "saved-current-profile-service-area-observed",
  );
  assert.equal(serviceAreaStatusFromReceipt(millcreekBaseline, undefined), "saved-service-area-observed");

  assert.equal(
    baselineServiceAreaStatus({
      city: "Sandy",
      identityEvidence: "documented-slv-target-measurement-only",
      serviceAreaStatus: "not-saved-current-profile-service-area",
    }),
    "pending-current-profile-service-area-verification",
  );
});
