#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const audit = read("data/rank-tracker/SLV-LEADER-FEATURE-AUDIT-2026-08-12.json");
const displacement = read(audit.source.displacementLedger);
const millcreek = read(audit.source.millcreekDiagnosis);
const priority = read(audit.source.expansionPriority);

assert.equal(audit.schemaVersion, 1);
assert.equal(audit.status, "read-only-diagnosis-no-public-authorization");
assert.equal(audit.publicMutationPerformed, false);
assert.deepEqual(audit.comparisons.map((row) => row.city), ["Millcreek", "Magna", "Kearns"]);

for (const comparison of audit.comparisons) {
  assert.equal(sha256(comparison.frame.sourceFile), comparison.frame.sha256, `stale Frame page: ${comparison.city}`);
  assert.equal(comparison.frame.canonical, comparison.frame.url);
  assert.ok(comparison.frame.title.includes(comparison.city));
  assert.ok(comparison.frame.h1.includes(comparison.city));
  assert.ok(comparison.frame.schemaTypes.includes("RoofingContractor"));
  assert.ok(comparison.frame.schemaTypes.includes("Service"));
  const query = displacement.queries.find((row) => row.city === comparison.city && row.keyword === comparison.query);
  assert.ok(query, `missing displacement query: ${comparison.city}`);
  assert.equal(query.target.organicRank, comparison.targetRank);
  assert.equal(query.target.rankingUrl, comparison.frame.url);
  assert.equal(query.surfaces.organic.top.url, comparison.leader.url);
  assert.equal(query.surfaces.organic.top.domain, comparison.leader.domain);
  assert.ok(comparison.leader.title.toLowerCase().includes(comparison.city.toLowerCase()));
  assert.ok(comparison.interpretation.length >= 3);
}

const millcreekComparison = audit.comparisons[0];
assert.equal(millcreekComparison.decision, "corroborates-existing-title-only-candidate-after-cleanup-observation");
assert.equal(millcreek.laterExperiment.singleVariable, "html-title");
assert.equal(millcreek.laterExperiment.currentValue, millcreekComparison.frame.title);
assert.equal(millcreek.laterExperiment.prohibitedNow, true);

for (const city of ["Magna", "Kearns"]) {
  const comparison = audit.comparisons.find((row) => row.city === city);
  const cityPriority = priority.cities.find((row) => row.city === city);
  assert.ok(cityPriority.organicNumberOneQueries.length === 1);
  assert.ok(comparison.decision.includes("protect-roof-replacement-number-one"));
  assert.equal(comparison.frame.phraseCounts["roof replacement"] > comparison.leader.phraseCounts["roof replacement"], true);
}

assert.ok(audit.crossCityDecision.notSupported.some((row) => row.includes("Bulk city-service page generation")));
assert.ok(audit.crossCityDecision.notSupported.some((row) => row.includes("GBP")));
assert.ok(audit.crossCityDecision.nextControlledSequence.some((row) => row.includes("Millcreek only")));

console.log("PASS SLV leader features: Millcreek title hypothesis corroborated, Magna/Kearns #1 footholds protected, no public authorization");
