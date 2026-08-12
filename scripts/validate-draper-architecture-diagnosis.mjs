#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosisFile = path.join(root, "data/rank-tracker/DRAPER-ARCHITECTURE-DIAGNOSIS-2026-08-12.json");

function fail(message) {
  console.error(`FAIL Draper architecture diagnosis: ${message}`);
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
      if (href === target || href.startsWith(`${target}#`) || href.startsWith(`${target}?`)) count += 1;
    }
  }
  return count;
}

const diagnosis = readJson(diagnosisFile);
if (diagnosis.schemaVersion !== 1) fail("schemaVersion must be 1");
if (diagnosis.publicMutationPerformed !== false) fail("publicMutationPerformed must remain false");
if (diagnosis.decision?.cannibalization !== "not-evidenced") fail("cannibalization decision drifted");
if (diagnosis.serviceAreaStatus !== "pending-current-profile-service-area-verification") {
  fail("service-area status must remain explicit until owner evidence changes it");
}

const panel = readJson(path.join(root, diagnosis.evidence.fixedPanel.file));
if (sha256(path.join(root, diagnosis.evidence.fixedPanel.file)) !== diagnosis.evidence.fixedPanel.sha256) fail("fixed panel hash drifted");
if (panel.observedAt !== diagnosis.evidence.fixedPanel.observedAt) fail("fixed panel observation timestamp drifted");
const panelQueries = panel.results.map((row) => row.keyword);
if (JSON.stringify(panelQueries) !== JSON.stringify(diagnosis.evidence.fixedPanel.queries)) fail("fixed query contract drifted");
if (panel.results.some((row) => row.organicRank !== null || row.rankingUrl !== null)) fail("diagnosis expects all four queries outside depth with no ranking URL");
if (panel.summary.organicRanked !== 0 || panel.summary.mapPackMatched !== 0) fail("panel summary no longer matches diagnosis");

const snapshot = readJson(path.join(root, diagnosis.evidence.searchConsole.file));
if (sha256(path.join(root, diagnosis.evidence.searchConsole.file)) !== diagnosis.evidence.searchConsole.sha256) fail("Search Console snapshot hash drifted");
const tracked = snapshot.gsc?.tracked_query_pages;
const requested = new Set((tracked?.requested || []).map((query) => String(query).toLowerCase()));
const draperQueries = diagnosis.evidence.fixedPanel.queries.map((query) => query.toLowerCase());
if (!draperQueries.every((query) => requested.has(query))) fail("targeted GSC request did not include all four Draper queries");
const draperRows = (tracked?.rows || []).filter((row) => draperQueries.includes(String(row.query).toLowerCase()));
if (draperRows.length !== diagnosis.evidence.searchConsole.targetedCommercialRowsReturned) fail("targeted Draper GSC row count drifted");
const stormPage = snapshot.gsc.top_pages.find((row) => row.page === diagnosis.evidence.searchConsole.stormChild.page);
if (!stormPage || stormPage.impressions !== diagnosis.evidence.searchConsole.stormChild.impressions || stormPage.position !== diagnosis.evidence.searchConsole.stormChild.position) {
  fail("storm-child aggregate GSC evidence drifted");
}

for (const route of diagnosis.evidence.routes) {
  const file = path.join(root, route.file);
  if (sha256(file) !== route.sha256) fail(`${route.file} hash drifted; regenerate before using this diagnosis`);
  const signals = pageSignals(file);
  if (signals.title !== route.title) fail(`${route.file} title drifted`);
  if (route.h1 && signals.h1 !== route.h1) fail(`${route.file} H1 drifted`);
  if (signals.canonical !== route.canonical) fail(`${route.file} canonical drifted`);
  const target = new URL(route.canonical).pathname.replace(/\/$/, "");
  if (inboundLinks(target) !== route.inboundInternalLinks) fail(`${route.file} inbound internal-link count drifted`);
}

const packetFile = path.join(root, diagnosis.evidence.integrityGate.packet);
if (sha256(packetFile) !== diagnosis.evidence.integrityGate.packetSha256) fail("owner-gated remediation packet drifted");
const packet = readJson(packetFile);
const draperFindings = packet.currentAudit?.findingsByPage?.["locations/draper.html"] || [];
const draperWarnings = (packet.currentAudit?.warningDetails || []).filter((row) => row.file === "locations/draper.html");
if (draperFindings.length !== diagnosis.evidence.integrityGate.draperBlockingFindingClasses) fail("Draper integrity finding-class count drifted");
if (draperWarnings.length !== diagnosis.evidence.integrityGate.draperProvisionalWarnings) fail("Draper provisional-warning count drifted");

const experiment = diagnosis.nextExperiment;
if (experiment.status !== "draft-only-do-not-apply-before-prerequisites") fail("experiment must remain owner-gated draft");
if (experiment.singleVariable !== "html-title") fail("experiment must change one variable only");
const mainRoute = diagnosis.evidence.routes.find((route) => route.file === experiment.page);
if (!mainRoute || experiment.currentValue !== mainRoute.title) fail("experiment baseline title does not match pinned page");
if (!experiment.heldConstant.includes("H1") || !experiment.heldConstant.includes("storm child")) fail("experiment must hold H1 and storm child constant");
if (!Array.isArray(experiment.prerequisites) || experiment.prerequisites.length < 6) fail("experiment prerequisites are incomplete");
if (!diagnosis.prohibited.some((row) => row.includes("Redirecting"))) fail("route-removal prohibition missing");

if (!process.exitCode) {
  console.log(
    `PASS Draper architecture diagnosis: ${panel.results.length} fixed queries, ${draperRows.length} targeted GSC rows, ` +
      `${diagnosis.evidence.routes.length} pinned routes, title-only experiment remains owner-gated`,
  );
}
