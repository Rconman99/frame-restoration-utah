#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosisFile = path.join(root, "data/rank-tracker/HOLLADAY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json");

function fail(message) {
  console.error(`FAIL Holladay architecture diagnosis: ${message}`);
  process.exitCode = 1;
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function sha256(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

function stripTags(value) {
  return String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

function pageSignals(file) {
  const html = fs.readFileSync(file, "utf8");
  return {
    title: html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    h1: stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    canonical:
      html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ||
      html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ||
      null,
  };
}

function inboundLinks(target) {
  const htmlFiles = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name === ".git" || entry.name === "node_modules" || entry.name === "archive") continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) htmlFiles.push(file);
    }
  };
  walk(root);
  let count = 0;
  for (const file of htmlFiles) {
    const html = fs.readFileSync(file, "utf8");
    const links = html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi);
    for (const match of links) {
      const href = match[1].replace(/\.html(?=($|[#?]))/, "");
      const matchesRoot = target === "/" && (href === "/" || href.startsWith("/#") || href.startsWith("/?"));
      const matchesPath = target !== "/" && (href === target || href.startsWith(`${target}#`) || href.startsWith(`${target}?`));
      if (matchesRoot || matchesPath) count += 1;
    }
  }
  return count;
}

const diagnosis = readJson(diagnosisFile);
if (diagnosis.schemaVersion !== 1) fail("schemaVersion must be 1");
if (diagnosis.publicMutationPerformed !== false) fail("publicMutationPerformed must remain false");
if (diagnosis.decision?.currentCommercialCannibalization !== "not-evidenced") fail("current cannibalization decision drifted");
if (diagnosis.decision?.historicalMultiUrlAssociation !== "evidenced-but-not-current-cannibalization-proof") {
  fail("historical/current URL distinction drifted");
}
if (diagnosis.serviceAreaStatus !== "pending-current-profile-service-area-verification") {
  fail("service-area status must remain explicit until owner evidence changes it");
}

const panelFile = path.join(root, diagnosis.evidence.fixedPanel.file);
const panel = readJson(panelFile);
if (sha256(panelFile) !== diagnosis.evidence.fixedPanel.sha256) fail("fixed panel hash drifted");
if (panel.observedAt !== diagnosis.evidence.fixedPanel.observedAt) fail("fixed panel observation timestamp drifted");
const panelQueries = panel.results.map((row) => row.keyword);
if (JSON.stringify(panelQueries) !== JSON.stringify(diagnosis.evidence.fixedPanel.queries)) fail("fixed query contract drifted");
if (JSON.stringify(panel.results.map((row) => row.organicRank)) !== JSON.stringify(diagnosis.evidence.fixedPanel.organicRanks)) {
  fail("fixed organic ranks drifted");
}
if (panel.results.some((row) => row.rankingUrl !== diagnosis.evidence.fixedPanel.rankingUrl)) {
  fail("current fixed panel no longer selects the Holladay main page for every query");
}
if (panel.summary.organicRanked !== 4 || panel.summary.mapPackMatched !== 0) fail("panel summary no longer matches diagnosis");

const snapshotFile = path.join(root, diagnosis.evidence.searchConsole.file);
const snapshot = readJson(snapshotFile);
if (sha256(snapshotFile) !== diagnosis.evidence.searchConsole.sha256) fail("Search Console snapshot hash drifted");
const tracked = snapshot.gsc?.tracked_query_pages;
const holladayQueries = diagnosis.evidence.fixedPanel.queries.map((query) => query.toLowerCase());
const requested = new Set((tracked?.requested || []).map((query) => String(query).toLowerCase()));
if (!holladayQueries.every((query) => requested.has(query))) fail("targeted GSC request did not include all four Holladay queries");
const holladayRows = (tracked?.rows || []).filter((row) => holladayQueries.includes(String(row.query).toLowerCase()));
const returnedQueries = new Set(holladayRows.map((row) => String(row.query).toLowerCase()));
if (holladayRows.length !== diagnosis.evidence.searchConsole.targetedCommercialRowsReturned) fail("targeted Holladay GSC row count drifted");
if (returnedQueries.size !== diagnosis.evidence.searchConsole.targetedCommercialQueriesReturned) fail("returned Holladay query count drifted");
for (const group of diagnosis.evidence.searchConsole.multiUrlQueries) {
  const actual = holladayRows.filter((row) => String(row.query).toLowerCase() === group.query);
  const expected = group.rows.map(({ classification, ...row }) => ({ query: group.query, ...row }));
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${group.query} targeted GSC rows drifted`);
  }
}
const singleUrl = diagnosis.evidence.searchConsole.singleUrlQuery;
const actualSingleUrl = holladayRows.filter((row) => String(row.query).toLowerCase() === singleUrl.query);
if (actualSingleUrl.length !== 1 || JSON.stringify(actualSingleUrl[0]) !== JSON.stringify(singleUrl)) {
  fail(`${singleUrl.query} targeted GSC row drifted`);
}

for (const expected of diagnosis.evidence.searchConsole.aggregatePages) {
  const actual = snapshot.gsc.top_pages.find((row) => row.page === expected.page);
  if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${expected.page} aggregate GSC evidence drifted`);
}

const routingFile = path.join(root, diagnosis.evidence.routing.file);
if (sha256(routingFile) !== diagnosis.evidence.routing.sha256) fail("routing config hash drifted");
const routing = readJson(routingFile);
const redirect = routing.redirects?.find((row) => row.source === diagnosis.evidence.routing.legacySource);
if (!redirect || redirect.destination !== diagnosis.evidence.routing.destination || redirect.permanent !== true) {
  fail("legacy Salt Lake City consolidation redirect drifted");
}
if (!(Date.parse(diagnosis.evidence.searchConsole.window.endDate) < Date.parse(diagnosis.evidence.routing.mergedAt))) {
  fail("GSC window must predate the legacy redirect before historical rows can be classified that way");
}

for (const route of diagnosis.evidence.routes) {
  const file = path.join(root, route.file);
  if (sha256(file) !== route.sha256) fail(`${route.file} hash drifted; regenerate before using this diagnosis`);
  const signals = pageSignals(file);
  if (signals.title !== route.title) fail(`${route.file} title drifted`);
  if (route.h1 && signals.h1 !== route.h1) fail(`${route.file} H1 drifted`);
  if (signals.canonical !== route.canonical) fail(`${route.file} canonical drifted`);
  const target = new URL(route.canonical).pathname.replace(/\/$/, "") || "/";
  if (inboundLinks(target) !== route.inboundInternalLinks) fail(`${route.file} inbound internal-link count drifted`);
}

const packetFile = path.join(root, diagnosis.evidence.integrityGate.packet);
if (sha256(packetFile) !== diagnosis.evidence.integrityGate.packetSha256) fail("owner-gated remediation packet drifted");
const packet = readJson(packetFile);
const holladayFindings = packet.currentAudit?.findingsByPage?.["locations/holladay.html"] || [];
const holladayWarnings = (packet.currentAudit?.warningDetails || []).filter((row) => row.file === "locations/holladay.html");
if (holladayFindings.length !== diagnosis.evidence.integrityGate.holladayBlockingFindingClasses) fail("Holladay integrity finding-class count drifted");
if (holladayWarnings.length !== diagnosis.evidence.integrityGate.holladayProvisionalWarnings) fail("Holladay provisional-warning count drifted");

const experiment = diagnosis.nextExperiment;
if (experiment.status !== "draft-only-do-not-apply-before-prerequisites") fail("experiment must remain owner-gated draft");
if (experiment.singleVariable !== "html-title") fail("experiment must change one variable only");
const mainRoute = diagnosis.evidence.routes.find((route) => route.file === experiment.page);
if (!mainRoute || experiment.currentValue !== mainRoute.title) fail("experiment baseline title does not match pinned page");
if (!experiment.heldConstant.includes("H1") || !experiment.heldConstant.includes("Holladay blog routes")) {
  fail("experiment must hold H1 and Holladay blog routes constant");
}
if (!Array.isArray(experiment.prerequisites) || experiment.prerequisites.length < 6) fail("experiment prerequisites are incomplete");
if (!experiment.measurement.guardrails.some((row) => row.includes("position 6 or better"))) fail("position-4 foothold guardrail missing");
if (!diagnosis.prohibited.some((row) => row.includes("Redirecting"))) fail("route-removal prohibition missing");

if (!process.exitCode) {
  console.log(
    `PASS Holladay architecture diagnosis: ${panel.results.length} fixed queries select the main page, ` +
      `${holladayRows.length} historical GSC rows classified, ${diagnosis.evidence.routes.length} routes pinned, ` +
      `title-only experiment remains owner-gated`,
  );
}
