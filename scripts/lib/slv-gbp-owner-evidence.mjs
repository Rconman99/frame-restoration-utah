import assert from "node:assert/strict";

export const SLV_GBP_TARGET = Object.freeze({
  business: "Frame Restoration Utah LLC",
  cid: "5689850818145735734",
  requiredOwnerAccount: "ryan@framerestorations.com",
});

export const AWAITING_STATUS = "AWAITING_CURRENT_OWNER_VIEW_EVIDENCE";
export const MEASURED_STATUS = "MEASURED_EXACT_CID_OWNER_VIEW";

const PROFILE_KEYS = [
  "business",
  "cid",
  "exactCidVisible",
  "verificationState",
  "businessType",
  "addressVisibility",
  "primaryCategory",
  "secondaryCategories",
  "configuredRoofingServices",
  "regularHoursState",
  "specialHoursState",
  "mostRecentOwnerPhotoDate",
  "googleRating",
  "googleReviewCount",
  "reviewResponseCoverageState",
];
const ATTESTATION_KEYS = [
  "currentOwnerView",
  "readOnly",
  "privateAddressOmitted",
  "credentialsOmitted",
  "reviewerIdentitiesOmitted",
  "profileEditsPerformed",
];
const RECEIPT_KEYS = [
  "schemaVersion",
  "evidenceId",
  "market",
  "status",
  "observedAt",
  "sanitizedAt",
  "targetProfile",
  "observerAccount",
  "profile",
  "serviceAreas",
  "summary",
  "safety",
  "publicMutationPerformed",
  "gbpMutationPerformed",
];

const exactKeys = (value, expected, label) => {
  assert.ok(value && typeof value === "object" && !Array.isArray(value), `${label} must be an object`);
  assert.deepEqual(Object.keys(value).sort(), [...expected].sort(), `${label} contains an unexpected or missing field`);
};
const oneOf = (value, allowed, label) => assert.ok(allowed.includes(value), `${label} must be one of: ${allowed.join(", ")}`);
const isoTimestamp = (value, label) => {
  assert.equal(typeof value, "string", `${label} must be an ISO timestamp`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d{3})?Z$/u, `${label} must be UTC ISO-8601`);
  assert.ok(Number.isFinite(Date.parse(value)), `${label} must parse as a date`);
};
const isoDateOrNull = (value, label) => {
  if (value == null) return;
  assert.equal(typeof value, "string", `${label} must be YYYY-MM-DD or null`);
  assert.match(value, /^\d{4}-\d{2}-\d{2}$/u, `${label} must be YYYY-MM-DD or null`);
  assert.ok(Number.isFinite(Date.parse(`${value}T00:00:00Z`)), `${label} must be a real date`);
  assert.equal(new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10), value, `${label} must be a real calendar date`);
};
const assertCurrentEvidenceTimestamp = (observedAt, now) => {
  const observedMs = Date.parse(observedAt);
  const nowMs = now.getTime();
  assert.ok(observedMs <= nowMs + 5 * 60 * 1000, "owner-view evidence cannot be dated in the future");
  assert.ok(observedMs >= nowMs - 14 * 24 * 60 * 60 * 1000, "owner-view evidence must be no more than 14 days old");
};

const forbiddenTextPatterns = [
  { pattern: /https?:\/\/|www\./iu, label: "URL" },
  { pattern: /\b[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}\b/iu, label: "email address" },
  { pattern: /(?:\+?1[\s.-]?)?\(?\d{3}\)?[\s.-]?\d{3}[\s.-]?\d{4}/u, label: "phone number" },
  { pattern: /\b\d{1,6}\s+(?:[A-Z0-9'-]+\s+){0,4}(?:street|st|road|rd|avenue|ave|drive|dr|lane|ln|boulevard|blvd|court|ct)\b/iu, label: "street address" },
  { pattern: /\b(?:password|passcode|api[ _-]?key|access[ _-]?token|refresh[ _-]?token|secret|recovery[ _-]?code|private[ _-]?key|pin)\b/iu, label: "credential-like value" },
];
const safeLabel = (value, { label, max = 120, nullable = false }) => {
  if (nullable && value == null) return null;
  assert.equal(typeof value, "string", `${label} must be a string${nullable ? " or null" : ""}`);
  assert.equal(value, value.trim(), `${label} must not have surrounding whitespace`);
  assert.ok(value.length > 0 && value.length <= max, `${label} must be 1-${max} characters`);
  assert.ok(!/[\r\n\t]/u.test(value), `${label} must remain one line`);
  for (const forbidden of forbiddenTextPatterns) {
    assert.ok(!forbidden.pattern.test(value), `${label} must not contain a ${forbidden.label}`);
  }
  return value;
};
const safeList = (value, { label, maxItems, maxLength, nullable = false }) => {
  if (nullable && value == null) return null;
  assert.ok(Array.isArray(value), `${label} must be an array`);
  assert.ok(value.length <= maxItems, `${label} must contain no more than ${maxItems} values`);
  const cleaned = value.map((item, index) => safeLabel(item, { label: `${label}[${index}]`, max: maxLength }));
  assert.equal(new Set(cleaned.map((item) => item.toLocaleLowerCase("en-US"))).size, cleaned.length, `${label} must not contain duplicates`);
  return cleaned;
};

function validateProfile(profile) {
  exactKeys(profile, PROFILE_KEYS, "owner-view profile");
  assert.equal(profile.business, SLV_GBP_TARGET.business);
  assert.equal(profile.cid, SLV_GBP_TARGET.cid);
  assert.equal(profile.exactCidVisible, true, "the exact target CID must be visible in the owner-view evidence");
  oneOf(profile.verificationState, ["verified", "not-verified", "unknown"], "verificationState");
  oneOf(profile.businessType, ["service-area", "hybrid", "storefront", "unknown"], "businessType");
  oneOf(profile.addressVisibility, ["shown", "hidden", "unknown"], "addressVisibility");
  safeLabel(profile.primaryCategory, { label: "primaryCategory", max: 80, nullable: true });
  safeList(profile.secondaryCategories, { label: "secondaryCategories", maxItems: 10, maxLength: 80, nullable: true });
  safeList(profile.configuredRoofingServices, { label: "configuredRoofingServices", maxItems: 40, maxLength: 100, nullable: true });
  oneOf(profile.regularHoursState, ["configured", "missing", "unknown"], "regularHoursState");
  oneOf(profile.specialHoursState, ["current", "needs-review", "not-applicable", "unknown"], "specialHoursState");
  isoDateOrNull(profile.mostRecentOwnerPhotoDate, "mostRecentOwnerPhotoDate");
  if (profile.googleRating != null) {
    assert.equal(typeof profile.googleRating, "number", "googleRating must be a number or null");
    assert.ok(profile.googleRating >= 1 && profile.googleRating <= 5, "googleRating must be between 1 and 5");
  }
  if (profile.googleReviewCount != null) {
    assert.ok(Number.isInteger(profile.googleReviewCount) && profile.googleReviewCount >= 0, "googleReviewCount must be a non-negative integer or null");
  }
  oneOf(profile.reviewResponseCoverageState, ["all-responded", "some-unanswered", "none-responded", "unknown"], "reviewResponseCoverageState");
}

function countKnownProfileFields(profile) {
  return [
    profile.verificationState !== "unknown",
    profile.businessType !== "unknown",
    profile.addressVisibility !== "unknown",
    profile.primaryCategory != null,
    profile.regularHoursState !== "unknown",
    profile.specialHoursState !== "unknown",
    profile.mostRecentOwnerPhotoDate != null,
    profile.googleRating != null,
    profile.googleReviewCount != null,
    profile.reviewResponseCoverageState !== "unknown",
    profile.secondaryCategories != null,
    profile.configuredRoofingServices != null,
  ].filter(Boolean).length;
}

function validateServiceAreas(serviceAreas, expectedCities, allowedStates) {
  assert.ok(Array.isArray(serviceAreas), "serviceAreas must be an array");
  assert.equal(serviceAreas.length, expectedCities.length, "serviceAreas must contain exactly one row for every portfolio city");
  const seen = new Set();
  for (const [index, row] of serviceAreas.entries()) {
    exactKeys(row, ["city", "savedState"], `serviceAreas[${index}]`);
    assert.ok(expectedCities.includes(row.city), `unknown service-area city: ${row.city}`);
    assert.ok(!seen.has(row.city), `duplicate service-area city: ${row.city}`);
    seen.add(row.city);
    oneOf(row.savedState, allowedStates, `${row.city} savedState`);
  }
  assert.deepEqual([...seen].sort(), [...expectedCities].sort(), "service-area city matrix is incomplete");
}

export function sanitizeOwnerEvidenceInput(input, { expectedCities, now = new Date() }) {
  exactKeys(input, ["schemaVersion", "observedAt", "observerAccount", "profile", "serviceAreas", "attestation"], "private owner evidence input");
  assert.equal(input.schemaVersion, 1);
  isoTimestamp(input.observedAt, "observedAt");
  assert.equal(input.observerAccount, SLV_GBP_TARGET.requiredOwnerAccount);
  validateProfile(input.profile);
  validateServiceAreas(input.serviceAreas, expectedCities, ["saved", "not-saved", "unknown"]);
  exactKeys(input.attestation, ATTESTATION_KEYS, "attestation");
  assert.equal(input.attestation.currentOwnerView, true);
  assert.equal(input.attestation.readOnly, true);
  assert.equal(input.attestation.privateAddressOmitted, true);
  assert.equal(input.attestation.credentialsOmitted, true);
  assert.equal(input.attestation.reviewerIdentitiesOmitted, true);
  assert.equal(input.attestation.profileEditsPerformed, false);

  assertCurrentEvidenceTimestamp(input.observedAt, now);

  const knownProfileValues = countKnownProfileFields(input.profile);
  const saved = input.serviceAreas.filter((row) => row.savedState === "saved").length;
  const notSaved = input.serviceAreas.filter((row) => row.savedState === "not-saved").length;
  const unknown = input.serviceAreas.filter((row) => row.savedState === "unknown").length;
  assert.ok(knownProfileValues > 0 || saved + notSaved > 0, "the blank template is not evidence; provide at least one observed profile field or service-area decision");

  return {
    schemaVersion: 1,
    evidenceId: "frame-utah-slv-exact-cid-owner-view-v1",
    market: "utah-salt-lake-valley",
    status: MEASURED_STATUS,
    observedAt: input.observedAt,
    sanitizedAt: now.toISOString(),
    targetProfile: { ...SLV_GBP_TARGET },
    observerAccount: input.observerAccount,
    profile: structuredClone(input.profile),
    serviceAreas: structuredClone(input.serviceAreas),
    summary: {
      citiesExpected: expectedCities.length,
      citiesMeasured: saved + notSaved,
      saved,
      notSaved,
      unknown,
      knownProfileFields: knownProfileValues,
    },
    safety: {
      sourceFileStored: false,
      rawScreenshotStored: false,
      privateAddressStored: false,
      credentialsStored: false,
      reviewerIdentitiesStored: false,
    },
    publicMutationPerformed: false,
    gbpMutationPerformed: false,
  };
}

export function validateOwnerEvidenceReceipt(receipt, { expectedCities, now = new Date() }) {
  exactKeys(receipt, RECEIPT_KEYS, "sanitized owner-view receipt");
  assert.equal(receipt.schemaVersion, 1);
  assert.equal(receipt.evidenceId, "frame-utah-slv-exact-cid-owner-view-v1");
  assert.equal(receipt.market, "utah-salt-lake-valley");
  oneOf(receipt.status, [AWAITING_STATUS, MEASURED_STATUS], "receipt status");
  exactKeys(receipt.targetProfile, ["business", "cid", "requiredOwnerAccount"], "targetProfile");
  assert.deepEqual(receipt.targetProfile, SLV_GBP_TARGET);
  exactKeys(receipt.summary, ["citiesExpected", "citiesMeasured", "saved", "notSaved", "unknown", "knownProfileFields"], "receipt summary");
  exactKeys(receipt.safety, ["sourceFileStored", "rawScreenshotStored", "privateAddressStored", "credentialsStored", "reviewerIdentitiesStored"], "receipt safety");
  assert.deepEqual(receipt.safety, {
    sourceFileStored: false,
    rawScreenshotStored: false,
    privateAddressStored: false,
    credentialsStored: false,
    reviewerIdentitiesStored: false,
  });
  assert.equal(receipt.publicMutationPerformed, false);
  assert.equal(receipt.gbpMutationPerformed, false);
  assert.equal(receipt.summary.citiesExpected, expectedCities.length);

  if (receipt.status === AWAITING_STATUS) {
    assert.equal(receipt.observedAt, null);
    assert.equal(receipt.sanitizedAt, null);
    assert.equal(receipt.observerAccount, null);
    assert.equal(receipt.profile, null);
    assert.deepEqual(receipt.serviceAreas, []);
    assert.deepEqual(receipt.summary, {
      citiesExpected: expectedCities.length,
      citiesMeasured: 0,
      saved: 0,
      notSaved: 0,
      unknown: expectedCities.length,
      knownProfileFields: 0,
    });
    return receipt;
  }

  isoTimestamp(receipt.observedAt, "receipt observedAt");
  isoTimestamp(receipt.sanitizedAt, "receipt sanitizedAt");
  assertCurrentEvidenceTimestamp(receipt.observedAt, now);
  assert.ok(Date.parse(receipt.sanitizedAt) >= Date.parse(receipt.observedAt), "receipt sanitizedAt cannot predate observedAt");
  assert.ok(Date.parse(receipt.sanitizedAt) <= now.getTime() + 5 * 60 * 1000, "receipt sanitizedAt cannot be dated in the future");
  assert.equal(receipt.observerAccount, SLV_GBP_TARGET.requiredOwnerAccount);
  validateProfile(receipt.profile);
  validateServiceAreas(receipt.serviceAreas, expectedCities, ["saved", "not-saved", "unknown"]);
  const saved = receipt.serviceAreas.filter((row) => row.savedState === "saved").length;
  const notSaved = receipt.serviceAreas.filter((row) => row.savedState === "not-saved").length;
  const unknown = receipt.serviceAreas.filter((row) => row.savedState === "unknown").length;
  assert.equal(receipt.summary.citiesMeasured, saved + notSaved);
  assert.equal(receipt.summary.saved, saved);
  assert.equal(receipt.summary.notSaved, notSaved);
  assert.equal(receipt.summary.unknown, unknown);
  assert.equal(receipt.summary.knownProfileFields, countKnownProfileFields(receipt.profile));
  return receipt;
}

export function serviceAreaStatusFromReceipt(currentStatus, receiptRow) {
  const derivedStates = new Set([
    "pending-current-profile-service-area-verification",
    "saved-current-profile-service-area-observed",
    "not-saved-current-profile-service-area",
    "saved-service-area-observed",
  ]);
  if (!derivedStates.has(currentStatus)) return currentStatus;
  if (!receiptRow) {
    return currentStatus === "saved-current-profile-service-area-observed"
      || currentStatus === "not-saved-current-profile-service-area"
      ? "pending-current-profile-service-area-verification"
      : currentStatus;
  }
  if (receiptRow.savedState === "unknown") {
    return currentStatus === "saved-service-area-observed"
      ? currentStatus
      : "pending-current-profile-service-area-verification";
  }
  if (receiptRow.savedState === "saved") return "saved-current-profile-service-area-observed";
  if (receiptRow.savedState === "not-saved") return "not-saved-current-profile-service-area";
  assert.fail(`unsupported savedState: ${receiptRow.savedState}`);
}

export function baselineServiceAreaStatus({ city, identityEvidence }) {
  if (identityEvidence === "verified-profile-identity-city") {
    return "verified-profile-identity-city";
  }
  if (identityEvidence === "verified-profile-saved-service-area") {
    return "saved-service-area-observed";
  }
  assert.equal(typeof city, "string", "city is required to derive the service-area baseline");
  return "pending-current-profile-service-area-verification";
}
