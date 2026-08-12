#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  buildTaskMatrix,
  estimatedPanelCost,
  validateConfig,
  validateRegistry,
} from "./dataforseo-rank-tracker.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const core = JSON.parse(fs.readFileSync(path.join(root, "data/rank-tracker/panels.json"), "utf8"));
const expansionPath = path.join(root, "data/rank-tracker/expansion-panels.json");
const expansion = validateRegistry(JSON.parse(fs.readFileSync(expansionPath, "utf8")));
const targetCid = core.sourceOfTruth.profileCid;

assert.equal(expansion.registryId, "utah-salt-lake-valley-google-expansion-v1");
assert.equal(expansion.cadence, "manual-baseline-before-weekly-admission");
assert.match(expansion.scopeGuard, /does not assert.*saved.*service-area profile/i);
assert.match(expansion.scopeGuard, /does not.*authorize a profile mutation/i);
assert.match(expansion.admissionRule, /one complete manual baseline/i);
assert.equal(expansion.panels.length, 12);

const expected = new Map(core.expansionCandidates.map((candidate) => [candidate.city, candidate]));
assert.equal(expected.size, 12);
const corePanelIds = new Set(core.panels.map((panel) => panel.id));
const configs = [];

for (const panel of expansion.panels) {
  assert.equal(panel.status, "active");
  assert.equal(panel.evidenceClass, "existing-salt-lake-county-route-measurement-only");
  assert.ok(!corePanelIds.has(panel.id), `${panel.id} already exists in recurring core registry`);
  const configPath = path.join(root, panel.configPath);
  assert.ok(fs.existsSync(configPath), `missing expansion config: ${panel.configPath}`);
  const config = validateConfig(JSON.parse(fs.readFileSync(configPath, "utf8")));
  configs.push(config);

  const candidate = expected.get(config.city);
  assert.ok(candidate, `unregistered expansion city: ${config.city}`);
  assert.equal(candidate.status, "pending-current-profile-service-area-verification");
  assert.equal(panel.route, candidate.route);
  assert.ok(fs.existsSync(path.join(root, `${panel.route}.html`)), `missing public route: ${panel.route}`);
  assert.equal(config.panelId, panel.id);
  assert.equal(config.locationName, `${config.city},Utah,United States`);
  assert.equal(config.target.gbpCid, targetCid);
  assert.equal(config.target.domain, "framerestorationutah.com");
  assert.equal(config.device, "mobile");
  assert.equal(config.os, "android");
  assert.equal(config.depth, 30);
  assert.equal(config.loadAsyncAiOverview, true);
  assert.equal(config.keywords.length, 4);
  assert.deepEqual(
    config.keywords.map((row) => row.keyword),
    ["roofing contractor", "roof repair", "roof replacement", "roofer"].map((prefix) => `${prefix} ${config.city.toLowerCase()}`),
  );
}

assert.equal(new Set(configs.map((config) => config.city)).size, 12);
assert.equal(buildTaskMatrix(configs).length, 48);
const estimatedCost = configs.reduce((sum, config) => sum + estimatedPanelCost(config), 0);
assert.ok(Math.abs(estimatedCost - 0.1152) < Number.EPSILON, `unexpected expansion cost: ${estimatedCost}`);

console.log("PASS SLV expansion panels: 12 measurement-only cities, 48 fixed mobile queries, estimated manual baseline $0.1152, no recurring admission or GBP assertion");
