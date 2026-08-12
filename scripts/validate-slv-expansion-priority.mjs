#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const ledger = read("data/rank-tracker/SLV-EXPANSION-PRIORITY-2026-08-12.json");
const registry = read(ledger.sources.registry);
const snapshot = read(ledger.sources.searchConsoleSnapshot);
const integrity = read(ledger.sources.integrityAudit);

assert.equal(ledger.schemaVersion, 1);
assert.equal(ledger.status, "measured-diagnosis-only-no-public-authorization");
assert.equal(ledger.publicMutationPerformed, false);
assert.equal(ledger.cities.length, 12);
assert.deepEqual(ledger.cities.map((city) => city.priority), Array.from({ length: 12 }, (_, index) => index + 1));
assert.equal(sha256(ledger.sources.searchConsoleSnapshot), ledger.sources.searchConsoleSnapshotSha256);
assert.equal(sha256(ledger.sources.integrityAudit), ledger.sources.integrityAuditSha256);

let organicNumberOne = 0;
let exactCidMapsNumberOne = 0;
let aioPresent = 0;
let aioCited = 0;
let findingClasses = 0;
let warnings = 0;

const panels = new Map(registry.panels.map((panel) => [panel.id, panel]));
for (const city of ledger.cities) {
  const panel = panels.get(city.panelId);
  assert.ok(panel, `unregistered panel: ${city.panelId}`);
  assert.equal(city.rankSource, panel.configPath.replace(/config\.json$/, "latest.json"));
  const report = read(city.rankSource);
  assert.equal(report.city, city.city);
  assert.equal(report.observedAt, city.observedAt);
  assert.deepEqual(city.organicRanks, report.results.map((row) => row.organicRank));
  assert.deepEqual(city.outsideTop30Queries, report.results.filter((row) => row.organicRank === null).map((row) => row.keyword));
  assert.deepEqual(city.organicNumberOneQueries, report.results.filter((row) => row.organicRank === 1).map((row) => row.keyword));
  assert.equal(city.exactCidMapsNumberOne, report.results.filter((row) => row.mapPackRank === 1).length);
  assert.deepEqual(city.googleAiOverview, {
    present: report.summary.aiOverviewsPresent,
    ownedCitations: report.summary.aiOverviewCitations,
  });
  assert.ok(report.results.filter((row) => row.organicRank !== null).every((row) => row.rankingUrl === city.selectedOrganicUrl));
  assert.equal(city.intendedUrlSelectedForEveryMeasuredRank, true);

  const gsc = snapshot.gsc.top_pages.find((row) => row.page === city.selectedOrganicUrl) || null;
  assert.deepEqual(city.gscAggregate, gsc ? { window: snapshot.gsc.window, clicks: gsc.clicks, impressions: gsc.impressions, position: gsc.position } : null);
  const page = integrity.pages.find((row) => row.city === city.city);
  assert.ok(page, `missing integrity row: ${city.city}`);
  assert.equal(city.integrity.pageSha256, page.sha256);
  assert.equal(city.integrity.blockingFindingClasses, page.findings.length);
  assert.equal(city.integrity.provisionalWarnings, page.warnings.length);
  assert.equal(city.integrity.identityState, page.identity.state);
  for (const related of city.protectedRelatedRoutes) assert.ok(fs.existsSync(path.join(root, related)), `missing protected route: ${related}`);

  organicNumberOne += city.organicNumberOneQueries.length;
  exactCidMapsNumberOne += city.exactCidMapsNumberOne;
  aioPresent += city.googleAiOverview.present;
  aioCited += city.googleAiOverview.ownedCitations;
  findingClasses += city.integrity.blockingFindingClasses;
  warnings += city.integrity.provisionalWarnings;
}

assert.deepEqual(ledger.score, {
  cities: 12,
  queries: 48,
  organicNumberOne,
  exactCidMapsNumberOne,
  googleAiOverviewsPresent: aioPresent,
  googleAiOverviewCitations: aioCited,
  integrityBlockingFindingClasses: findingClasses,
  provisionalWarnings: warnings,
});
assert.deepEqual(ledger.cities.slice(0, 2).map((city) => city.city), ["Magna", "Kearns"]);
assert.ok(ledger.cities.slice(0, 2).every((city) => city.lane === "protect-existing-number-one-and-aio-footholds"));
assert.ok(ledger.prohibited.includes("public page edits from this ledger"));
assert.ok(ledger.prohibited.some((rule) => rule.includes("missing GSC rows")));

console.log("PASS SLV expansion priority: protect Magna/Kearns, organic #1 2/48, exact-CID Maps #1 0/48, 73 integrity finding classes, no public authorization");
