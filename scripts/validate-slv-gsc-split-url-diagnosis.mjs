#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const receiptPath = "data/rank-tracker/SLV-GSC-SPLIT-URL-DIAGNOSIS-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

const receipt = read(receiptPath);
assert.equal(receipt.schemaVersion, 1);
assert.equal(receipt.publicMutationPerformed, false);
assert.equal(receipt.decision.currentCannibalizationProven, false);
assert.equal(receipt.decision.publicArchitectureChangeAuthorized, false);
assert.deepEqual(receipt.cities.map((city) => city.city), ["Holladay", "Herriman"]);

const snapshotSource = receipt.evidence.searchConsoleSnapshot;
assert.equal(sha256(snapshotSource.file), snapshotSource.sha256, "GSC snapshot hash drifted");
const attribution = read("data/rank-tracker/SLV-GSC-URL-ATTRIBUTION-LATEST.json");
assert.equal(attribution.sources.gscSnapshot.sha256, snapshotSource.sha256, "receipt has expired against the active GSC attribution snapshot");
const snapshot = read(snapshotSource.file);
assert.deepEqual(snapshot.gsc.window, snapshotSource.window);
const tracked = snapshot.gsc.tracked_query_pages;
assert.equal(tracked.requested.length, snapshotSource.fixedQueriesRequested);
assert.equal(new Set(tracked.rows.map((row) => row.query)).size, snapshotSource.queriesWithRows);

const redirectSource = receipt.evidence.redirect;
assert.equal(sha256(redirectSource.file), redirectSource.sha256, "redirect config hash drifted");
const redirectConfig = read(redirectSource.file);
const redirect = redirectConfig.redirects.find((row) => row.source === redirectSource.source);
assert.deepEqual(redirect, {
  source: redirectSource.source,
  destination: redirectSource.destination,
  permanent: true,
});
assert.ok(Date.parse(snapshotSource.window.endDate) < Date.parse(redirectSource.mergedAt));

for (const city of receipt.cities) {
  assert.equal(sha256(city.fixedPanel.file), city.fixedPanel.sha256, `${city.city} panel hash drifted`);
  const panel = read(city.fixedPanel.file);
  assert.deepEqual(panel.results.map((row) => row.organicRank), city.fixedPanel.organicRanks);
  const expectedPath = `/locations/${city.city.toLowerCase().replaceAll(" ", "-")}`;
  assert.ok(panel.results.every((row) => new URL(row.rankingUrl).pathname === expectedPath));
  assert.equal(city.fixedPanel.allMeasuredQueriesSelectIntendedPage, true);
}

const rowsFor = (query) => tracked.rows.filter((row) => row.query === query);
const impressions = (rows, page) => rows.filter((row) => row.page === page).reduce((sum, row) => sum + row.impressions, 0);

const holladay = receipt.cities.find((city) => city.city === "Holladay");
assert.equal(holladay.disposition, "await-full-post-redirect-window");
const holladayContractor = rowsFor("roofing contractor holladay");
assert.equal(impressions(holladayContractor, "https://www.framerestorationutah.com/locations/holladay"), 11);
assert.equal(impressions(holladayContractor, "https://www.framerestorationutah.com/salt-lake-city"), 11);
const holladayReplacement = rowsFor("roof replacement holladay");
assert.equal(impressions(holladayReplacement, "https://www.framerestorationutah.com/locations/holladay"), 19);
assert.equal(impressions(holladayReplacement, "https://www.framerestorationutah.com/blog/holladay/roof-replacement-holladay-utah"), 2);
assert.ok(Date.parse(holladay.requiredRecheck.firstFullyPostRedirectWindow.endDateOnOrAfter) >= Date.parse("2026-09-07"));

const herriman = receipt.cities.find((city) => city.city === "Herriman");
assert.equal(herriman.disposition, "monitor-negligible-historical-trace");
const herrimanReplacement = rowsFor("roof replacement herriman");
assert.equal(impressions(herrimanReplacement, "https://www.framerestorationutah.com/locations/herriman"), 55);
assert.equal(impressions(herrimanReplacement, "https://www.framerestorationutah.com/salt-lake-city"), 1);
assert.equal(herriman.queryDiagnoses[0].alternatePosition, 61);
assert.ok(herriman.queryDiagnoses[0].intendedImpressionShare > 0.98);

assert.ok(receipt.nextSafeActions.some((action) => action.includes("no website, GBP, directory, review, indexing, outreach, advertising, or DNS mutation")));
console.log("PASS SLV split-URL diagnosis: Holladay stays post-redirect monitor, Herriman trace is non-actionable, no public mutation authorized");
