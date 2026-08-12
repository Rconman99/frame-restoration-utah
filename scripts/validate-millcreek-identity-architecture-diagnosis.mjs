#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const diagnosisFile = path.join(root, "data/rank-tracker/MILLCREEK-IDENTITY-ARCHITECTURE-DIAGNOSIS-2026-08-12.json");
const diagnosis = JSON.parse(fs.readFileSync(diagnosisFile, "utf8"));
const readJson = (file) => JSON.parse(fs.readFileSync(file, "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
const stripTags = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

function fail(message) {
  console.error(`FAIL Millcreek identity/architecture diagnosis: ${message}`);
  process.exitCode = 1;
}

function jsonLdBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)) {
    try { blocks.push(JSON.parse(match[1])); } catch { /* JSON-LD validity is owned by the site audit. */ }
  }
  return blocks;
}

function findPrimaryContractor(node) {
  if (Array.isArray(node)) {
    for (const item of node) {
      const found = findPrimaryContractor(item);
      if (found) return found;
    }
    return null;
  }
  if (!node || typeof node !== "object") return null;
  const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
  if (types.includes("RoofingContractor") && (node.telephone || node.address)) return node;
  for (const value of Object.values(node)) {
    const found = findPrimaryContractor(value);
    if (found) return found;
  }
  return null;
}

function pageSignals(file) {
  const html = fs.readFileSync(file, "utf8");
  return {
    title: html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    h1: stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    canonical: html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || null,
    contractor: jsonLdBlocks(html).map(findPrimaryContractor).find(Boolean) || null,
  };
}

function visibleCounts(file, terms) {
  const html = fs.readFileSync(file, "utf8");
  const body = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i)?.[1] || html;
  const text = body.replace(/<script[\s\S]*?<\/script>/gi, " ").replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<[^>]+>/g, " ").replace(/&[a-z0-9#]+;/gi, " ").replace(/\s+/g, " ").toLowerCase();
  return Object.fromEntries(terms.map((term) => [term, text.split(term).length - 1]));
}

function inboundLinks(target) {
  const files = [];
  const walk = (dir) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if ([".git", "node_modules", "archive"].includes(entry.name)) continue;
      const file = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(file);
      else if (entry.name.endsWith(".html")) files.push(file);
    }
  };
  walk(root);
  let count = 0;
  for (const file of files) {
    for (const match of fs.readFileSync(file, "utf8").matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      const href = match[1].replace(/\.html(?=($|[#?]))/, "");
      if (href === target || href.startsWith(`${target}#`) || href.startsWith(`${target}?`)) count += 1;
    }
  }
  return count;
}

if (diagnosis.schemaVersion !== 1 || diagnosis.publicMutationPerformed !== false) fail("schema/public-mutation contract drifted");
if (diagnosis.decision?.currentCommercialCannibalization !== "not-evidenced") fail("cannibalization decision drifted");
if (diagnosis.identityEvidence !== "verified-profile-saved-service-area") fail("verified Millcreek identity evidence drifted");

const panelFile = path.join(root, diagnosis.evidence.fixedPanel.file);
const panel = readJson(panelFile);
if (sha256(panelFile) !== diagnosis.evidence.fixedPanel.sha256) fail("fixed panel hash drifted");
if (panel.observedAt !== diagnosis.evidence.fixedPanel.observedAt) fail("fixed panel timestamp drifted");
if (panel.target.gbpCid !== diagnosis.evidence.fixedPanel.targetCid) fail("fixed panel target CID drifted");
if (JSON.stringify(panel.results.map((row) => row.keyword)) !== JSON.stringify(diagnosis.evidence.fixedPanel.queries)) fail("fixed queries drifted");
if (JSON.stringify(panel.results.map((row) => row.organicRank)) !== JSON.stringify(diagnosis.evidence.fixedPanel.organicRanks)) fail("fixed ranks drifted");
if (panel.results.some((row) => row.rankingUrl !== diagnosis.evidence.fixedPanel.rankingUrl)) fail("a fixed query no longer selects the main page");
const citedRows = panel.results.filter((row) => row.aiOverviewPresent && row.aiOverviewCited);
if (citedRows.length !== 1 || citedRows[0].keyword !== diagnosis.evidence.fixedPanel.citedQuery ||
    !citedRows[0].aiOverviewSources.some((source) => source.isTarget && source.url === diagnosis.evidence.fixedPanel.citedUrl)) {
  fail("Google AI Overview citation foothold drifted");
}
if (panel.summary.organicRanked !== 4 || panel.summary.mapPackMatched !== 0 || panel.summary.aiOverviewCitations !== 1) fail("panel summary drifted");

const snapshotFile = path.join(root, diagnosis.evidence.searchConsole.file);
const snapshot = readJson(snapshotFile);
if (sha256(snapshotFile) !== diagnosis.evidence.searchConsole.sha256) fail("Search Console snapshot hash drifted");
const tracked = snapshot.gsc?.tracked_query_pages;
const fixed = diagnosis.evidence.fixedPanel.queries.map((query) => query.toLowerCase());
const requested = new Set((tracked?.requested || []).map((query) => String(query).toLowerCase()));
if (!fixed.every((query) => requested.has(query))) fail("targeted GSC request omitted a fixed query");
const rows = (tracked?.rows || []).filter((row) => fixed.includes(String(row.query).toLowerCase()));
if (rows.length !== diagnosis.evidence.searchConsole.targetedCommercialRowsReturned) fail("targeted GSC row count drifted");
for (const expected of diagnosis.evidence.searchConsole.aggregatePages) {
  const actual = snapshot.gsc.top_pages.find((row) => row.page === expected.page);
  if (!actual || JSON.stringify(actual) !== JSON.stringify(expected)) fail(`${expected.page} aggregate GSC evidence drifted`);
}

for (const route of diagnosis.evidence.routes) {
  const file = path.join(root, route.file);
  if (sha256(file) !== route.sha256) fail(`${route.file} hash drifted; regenerate the diagnosis`);
  const signals = pageSignals(file);
  if (signals.title !== route.title || signals.h1 !== route.h1 || signals.canonical !== route.canonical) fail(`${route.file} surface signals drifted`);
  if (inboundLinks(new URL(route.canonical).pathname.replace(/\/$/, "")) !== route.inboundInternalLinks) fail(`${route.file} inbound links drifted`);
  if (route.visibleTermCounts && JSON.stringify(visibleCounts(file, Object.keys(route.visibleTermCounts))) !== JSON.stringify(route.visibleTermCounts)) {
    fail(`${route.file} visible term counts drifted`);
  }
  if (route.publishedHasMap && signals.contractor?.hasMap !== route.publishedHasMap) fail(`${route.file} published identity drifted`);
  if (route.identityState === "no-primary-roofing-contractor-entity-node" && signals.contractor) fail(`${route.file} unexpectedly gained a primary contractor node`);
}

const identityContract = readJson(path.join(root, diagnosis.evidence.identity.contract));
if (identityContract.identity.verifiedSaltLakeValleyCid !== diagnosis.evidence.identity.verifiedSaltLakeValleyCid) fail("verified Salt Lake Valley CID drifted");
if (identityContract.identity.heberCid !== diagnosis.evidence.identity.heberCid) fail("Heber CID drifted");
if (!identityContract.identity.requiredSaltLakeValleyPages.includes(diagnosis.evidence.identity.requiredMainPage)) fail("Millcreek main page is no longer required by the identity contract");
if (JSON.stringify(identityContract.identity.saltLakeValleySameAs) !== JSON.stringify(diagnosis.evidence.identity.reviewedSaltLakeValleySameAs)) fail("reviewed Salt Lake Valley sameAs set drifted");
const businessFile = path.join(root, diagnosis.evidence.identity.businessSource.file);
const business = readJson(businessFile);
if (sha256(businessFile) !== diagnosis.evidence.identity.businessSource.sha256) fail("business identity source drifted");
if (Boolean(business.entity_links?.location_overrides?.["millcreek.html"]) !== diagnosis.evidence.identity.businessSource.millcreekOverridePresent) fail("Millcreek business override state drifted");

const packetFile = path.join(root, diagnosis.evidence.integrityGate.packet);
if (sha256(packetFile) !== diagnosis.evidence.integrityGate.packetSha256) fail("remediation packet drifted");
const packet = readJson(packetFile);
const findings = packet.currentAudit?.findingsByPage?.["locations/millcreek.html"] || [];
const warnings = (packet.currentAudit?.warningDetails || []).filter((row) => row.file === "locations/millcreek.html");
if (findings.length !== diagnosis.evidence.integrityGate.mainPageBlockingFindingClasses || warnings.length !== diagnosis.evidence.integrityGate.mainPageProvisionalWarnings) {
  fail("integrity findings drifted");
}
if (packet.sourceFiles.some((row) => row.file === diagnosis.evidence.identity.scopeGap.file)) fail("storm child is now in packet scope; regenerate diagnosis");

const action = diagnosis.nextControlledAction;
if (action.status !== "draft-only-do-not-apply-before-owner-and-release-gates") fail("cleanup action gate drifted");
if (action.type !== "required-public-integrity-correction-not-a-ranking-test") fail("mandatory correction was misclassified as a ranking test");
if (!action.scope.some((row) => row.includes("storm child")) || action.prerequisites.length < 5) fail("scope-gap or release prerequisites are incomplete");
if (diagnosis.laterExperiment.prohibitedNow !== true || diagnosis.laterExperiment.singleVariable !== "html-title") fail("later title experiment gate drifted");
if (!diagnosis.prohibited.some((row) => row.includes("Bundling a title"))) fail("title-bundling prohibition missing");

if (!process.exitCode) {
  console.log(`PASS Millcreek diagnosis: 4 fixed SERPs select main at mean 4, 1/1 observed AIO cites Frame, 2 Millcreek entity surfaces still carry Heber identity, cleanup remains owner-gated`);
}
