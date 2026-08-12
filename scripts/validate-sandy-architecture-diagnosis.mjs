#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosisFile = path.join(root, "data/rank-tracker/SANDY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json");

function fail(message) {
  console.error(`FAIL Sandy architecture diagnosis: ${message}`);
  process.exitCode = 1;
}

const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stripTags = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

function visibleTermCounts(file, terms) {
  const html = fs.readFileSync(file, "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const text = body
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&[a-z0-9#]+;/gi, " ")
    .replace(/\s+/g, " ")
    .toLowerCase();
  return Object.fromEntries(terms.map((term) => [term, text.split(term).length - 1]));
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
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1].replace(/\.html(?=($|[#?]))/, "");
      if (href === target || href.startsWith(`${target}#`) || href.startsWith(`${target}?`)) count += 1;
    }
  }
  return count;
}

const diagnosis = readJson(diagnosisFile);
if (diagnosis.schemaVersion !== 1) fail("schemaVersion must be 1");
if (diagnosis.publicMutationPerformed !== false) fail("publicMutationPerformed must remain false");
if (diagnosis.decision?.currentCommercialCannibalization !== "not-evidenced") fail("cannibalization decision drifted");
if (diagnosis.serviceAreaStatus !== "pending-current-profile-service-area-verification") fail("service-area status drifted");

const panelFile = path.join(root, diagnosis.evidence.fixedPanel.file);
const panel = readJson(panelFile);
if (sha256(panelFile) !== diagnosis.evidence.fixedPanel.sha256) fail("fixed panel hash drifted");
if (panel.observedAt !== diagnosis.evidence.fixedPanel.observedAt) fail("fixed panel timestamp drifted");
if (JSON.stringify(panel.results.map((row) => row.keyword)) !== JSON.stringify(diagnosis.evidence.fixedPanel.queries)) fail("fixed queries drifted");
if (JSON.stringify(panel.results.map((row) => row.organicRank)) !== JSON.stringify(diagnosis.evidence.fixedPanel.organicRanks)) fail("fixed ranks drifted");
if (panel.results.some((row) => row.rankingUrl !== diagnosis.evidence.fixedPanel.rankingUrl)) fail("a fixed query no longer selects the Sandy main page");
if (panel.summary.organicRanked !== 4 || panel.summary.mapPackMatched !== 0) fail("panel summary drifted");

const snapshotFile = path.join(root, diagnosis.evidence.searchConsole.file);
const snapshot = readJson(snapshotFile);
if (sha256(snapshotFile) !== diagnosis.evidence.searchConsole.sha256) fail("Search Console snapshot hash drifted");
const tracked = snapshot.gsc?.tracked_query_pages;
const sandyQueries = diagnosis.evidence.fixedPanel.queries.map((query) => query.toLowerCase());
const requested = new Set((tracked?.requested || []).map((query) => String(query).toLowerCase()));
if (!sandyQueries.every((query) => requested.has(query))) fail("targeted GSC request omitted a Sandy query");
const sandyRows = (tracked?.rows || []).filter((row) => sandyQueries.includes(String(row.query).toLowerCase()));
if (JSON.stringify(sandyRows) !== JSON.stringify(diagnosis.evidence.searchConsole.rows)) fail("targeted Sandy GSC rows drifted");
if (new Set(sandyRows.map((row) => row.query)).size !== 4 || new Set(sandyRows.map((row) => row.page)).size !== 1) {
  fail("diagnosis requires all four targeted GSC queries to select one page");
}
for (const expected of diagnosis.evidence.searchConsole.aggregatePages) {
  const actual = snapshot.gsc.top_pages.find((row) => row.page === expected.page);
  if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${expected.page} aggregate GSC evidence drifted`);
}

for (const route of diagnosis.evidence.routes) {
  const file = path.join(root, route.file);
  if (sha256(file) !== route.sha256) fail(`${route.file} hash drifted; regenerate the diagnosis`);
  const signals = pageSignals(file);
  if (signals.title !== route.title) fail(`${route.file} title drifted`);
  if (signals.h1 !== route.h1) fail(`${route.file} H1 drifted`);
  if (signals.canonical !== route.canonical) fail(`${route.file} canonical drifted`);
  const target = new URL(route.canonical).pathname.replace(/\/$/, "");
  if (inboundLinks(target) !== route.inboundInternalLinks) fail(`${route.file} inbound link count drifted`);
  if (route.visibleTermCounts) {
    const counts = visibleTermCounts(file, Object.keys(route.visibleTermCounts));
    if (JSON.stringify(counts) !== JSON.stringify(route.visibleTermCounts)) fail(`${route.file} visible term counts drifted`);
  }
}

const packetFile = path.join(root, diagnosis.evidence.integrityGate.packet);
if (sha256(packetFile) !== diagnosis.evidence.integrityGate.packetSha256) fail("owner-gated remediation packet drifted");
const packet = readJson(packetFile);
const findings = packet.currentAudit?.findingsByPage?.["locations/sandy.html"] || [];
const warnings = (packet.currentAudit?.warningDetails || []).filter((row) => row.file === "locations/sandy.html");
if (findings.length !== diagnosis.evidence.integrityGate.sandyBlockingFindingClasses) fail("Sandy integrity findings drifted");
if (warnings.length !== diagnosis.evidence.integrityGate.sandyProvisionalWarnings) fail("Sandy provisional warnings drifted");

const experiment = diagnosis.nextExperiment;
if (experiment.status !== "draft-only-do-not-apply-before-prerequisites") fail("experiment must remain draft-only");
if (experiment.singleVariable !== "html-title") fail("experiment must remain title-only");
const mainRoute = diagnosis.evidence.routes.find((route) => route.file === experiment.page);
if (!mainRoute || mainRoute.title !== experiment.currentValue) fail("experiment baseline title drifted");
if (!experiment.heldConstant.includes("H1") || !experiment.heldConstant.includes("Sandy blog routes")) fail("held constants are incomplete");
if (!Array.isArray(experiment.prerequisites) || experiment.prerequisites.length < 6) fail("experiment prerequisites are incomplete");
if (!diagnosis.prohibited.some((row) => row.includes("Redirecting"))) fail("route-removal prohibition missing");

if (!process.exitCode) {
  console.log(
    `PASS Sandy architecture diagnosis: ${panel.results.length} fixed SERPs and ${sandyRows.length} targeted GSC rows select the main page, ` +
      `${diagnosis.evidence.routes.length} routes pinned, title-only experiment remains owner-gated`,
  );
}
