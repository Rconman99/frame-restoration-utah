#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { sanitizeOwnerEvidenceInput } from "./lib/slv-gbp-owner-evidence.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const outputPath = path.join(root, "data/rank-tracker/evidence/SLV-GBP-OWNER-VIEW-LATEST.json");
const requestPath = path.join(root, "data/authority/SLV-SERVICE-AREA-EVIDENCE-REQUEST-2026-08-12.json");
const argv = process.argv.slice(2);
const inputFlag = argv.indexOf("--input");
assert.ok(inputFlag >= 0 && argv[inputFlag + 1], "usage: node scripts/import-slv-gbp-owner-evidence.mjs --input /absolute/path/outside-the-repository/evidence.json [--write]");
const write = argv.includes("--write");
const inputPath = path.resolve(argv[inputFlag + 1]);
assert.notEqual(inputPath, outputPath, "the private input must not be the sanitized repository receipt");
assert.ok(fs.existsSync(inputPath), `input does not exist: ${inputPath}`);
const realInputPath = fs.realpathSync(inputPath);
const realRoot = fs.realpathSync(root);
assert.ok(!realInputPath.startsWith(`${realRoot}${path.sep}`), "the completed private owner evidence input must remain outside the repository");

const request = JSON.parse(fs.readFileSync(requestPath, "utf8"));
const expectedCities = [
  ...request.alreadyVerified.map(({ city }) => city),
  ...request.citiesRequiringCurrentEvidence,
];
const input = JSON.parse(fs.readFileSync(inputPath, "utf8"));
const receipt = sanitizeOwnerEvidenceInput(input, { expectedCities });

if (write) {
  const tempOutputPath = `${outputPath}.tmp-${process.pid}`;
  fs.writeFileSync(tempOutputPath, `${JSON.stringify(receipt, null, 2)}\n`, { flag: "wx" });
  fs.renameSync(tempOutputPath, outputPath);
  console.log(`IMPORTED sanitized SLV owner-view evidence: ${receipt.summary.citiesMeasured}/${receipt.summary.citiesExpected} city states measured, ${receipt.summary.knownProfileFields} profile fields known`);
} else {
  console.log(`PASS private SLV owner-view evidence: ${receipt.summary.citiesMeasured}/${receipt.summary.citiesExpected} city states measured; rerun with --write to replace only the sanitized receipt`);
}
