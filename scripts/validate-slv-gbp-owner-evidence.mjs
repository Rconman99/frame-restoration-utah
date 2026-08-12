#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { AWAITING_STATUS, MEASURED_STATUS, validateOwnerEvidenceReceipt } from "./lib/slv-gbp-owner-evidence.mjs";

const root = process.cwd();
const receiptPath = "data/rank-tracker/evidence/SLV-GBP-OWNER-VIEW-LATEST.json";
const requestPath = "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json";
const profileRequestPath = "data/authority/SLV-GBP-OWNER-AUDIT-REQUEST-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const serviceAreaRequest = read(requestPath);
const profileRequest = read(profileRequestPath);
const receipt = read(receiptPath);
const expectedCities = [
  ...serviceAreaRequest.alreadyVerified.map(({ city }) => city),
  ...serviceAreaRequest.citiesRequiringCurrentEvidence,
];

validateOwnerEvidenceReceipt(receipt, { expectedCities });
assert.equal(receipt.targetProfile.cid, serviceAreaRequest.targetProfile.cid);
assert.equal(receipt.targetProfile.cid, profileRequest.targetProfile.cid);
assert.equal(receipt.targetProfile.requiredOwnerAccount, serviceAreaRequest.targetProfile.requiredOwnerAccount);
assert.equal(receipt.targetProfile.requiredOwnerAccount, profileRequest.targetProfile.requiredOwnerAccount);
assert.equal(profileRequest.delivery.externalSendAuthorized, false);
assert.equal(serviceAreaRequest.delivery.externalSendAuthorized, false);
assert.ok([AWAITING_STATUS, MEASURED_STATUS].includes(receipt.status));

console.log(`PASS SLV owner-view evidence receipt: ${receipt.status}, ${receipt.summary.citiesMeasured}/${receipt.summary.citiesExpected} city states measured, no private source retained`);
