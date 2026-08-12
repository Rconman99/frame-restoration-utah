#!/usr/bin/env node

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registry = JSON.parse(fs.readFileSync(path.join(root, "data/rank-tracker/expansion-panels.json"), "utf8"));
const business = JSON.parse(fs.readFileSync(path.join(root, "data/route-factory/business.json"), "utf8"));
const strict = process.argv.includes("--strict");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check");
const outputFile = path.join(root, "data/authority/SLV-EXPANSION-INTEGRITY-AUDIT-2026-08-12.json");
if (write && check) throw new Error("Use either --write or --check, not both");
const slvCid = registry.sourceOfTruth.profileCid;
const heberCid = business.gbp.cid;

const patterns = [
  {
    id: "pricing-ranges",
    pattern: /\$[0-9][0-9,]*(?:\s*[–-]\s*\$?[0-9][0-9,]*)?/gu,
    guidance: "Replace unsupported dollar figures with scope-dependent factors and a written-estimate invitation.",
  },
  {
    id: "exact-response-or-availability",
    pattern: /\b(?:24\/7|within\s+24\s*[-–]\s*48\s+hours|within\s+24\s+hours|15\s+minutes?)\b/giu,
    guidance: "Remove exact availability, response-window, or travel-time promises until an operating policy is registered.",
  },
  {
    id: "universal-permit-handling",
    pattern: /\b(?:handles?|manage[sd]?|coordinates?|pulls?)\b[^.<]{0,100}\bpermit(?:s|ting| applications?| filings?)\b|\bpermit(?:s|ting| applications?| filings?)\b[^.<]{0,100}\b(?:handles?|manage[sd]?|coordinates?|pulls?)\b/giu,
    guidance: "Use municipality guidance and confirm responsibility in the written scope; do not promise universal handling.",
  },
  {
    id: "unverified-insurance-credentials",
    pattern: /\b(?:fully\s+)?licensed\s*(?:&|and)\s*insured\b|\bgeneral liability insurance\b|\bworkers['’]? compensation\b/giu,
    guidance: "Keep the verified license only until current insurance evidence is registered.",
  },
  {
    id: "universal-project-duration",
    pattern: /\b(?:take|takes|average|averages|run|runs|typically)[^.<]{0,120}\b(?:1\s*[-–]\s*3|1\s*[-–]\s*2|2\s*[-–]\s*4|3\s*[-–]\s*5)\s+(?:days?|weeks?)\b/giu,
    guidance: "Replace a universal duration with scoped timing factors.",
  },
  {
    id: "unsourced-roof-life-loss",
    pattern: /\bshorten(?:s|ed|ing)?\b[^.<]{0,120}\b5\s*[-–]\s*10\s+years?\b/giu,
    guidance: "Describe observable damage without an unregistered years-of-life-loss number.",
  },
];

const occurrences = (text, pattern) => [...text.matchAll(new RegExp(pattern.source, pattern.flags))].length;
const sha256 = (text) => crypto.createHash("sha256").update(text).digest("hex");
const stripTags = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();

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

const pages = [];
let blockingFindingClasses = 0;
let blockingOccurrences = 0;
let provisionalWarningClasses = 0;
let provisionalOccurrences = 0;

for (const panel of registry.panels) {
  const slug = panel.route.split("/").pop();
  const file = `${panel.route.slice(1)}.html`;
  const full = path.join(root, file);
  const html = fs.readFileSync(full, "utf8");
  const config = JSON.parse(fs.readFileSync(path.join(root, panel.configPath), "utf8"));
  const findings = [];
  const warnings = [];

  for (const rule of patterns) {
    const count = occurrences(html, rule.pattern);
    if (count) findings.push({ id: rule.id, count, guidance: rule.guidance });
  }

  const cityPattern = new RegExp(
    `(?:alt|content)=["'][^"']*\\b(?:completed|project|reroof)\\b[^"']*\\b${config.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^"']*["']|` +
    `(?:alt|content)=["'][^"']*\\b${config.city.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b[^"']*\\b(?:completed|project|reroof)\\b[^"']*["']`,
    "giu",
  );
  const projectTextCount = occurrences(html, cityPattern);
  const cityAssetCount = occurrences(html, new RegExp(`/images/projects/cities/${slug}(?:[-/.])`, "giu"));
  if (projectTextCount + cityAssetCount) {
    findings.push({
      id: "unverified-city-project-attribution",
      count: projectTextCount + cityAssetCount,
      guidance: "Use neutral asset text until a city-specific project record establishes the location.",
    });
  }

  const reviewCount = occurrences(html, /"review"\s*:\s*\{|reviewBody|\bGoogle reviewer?\b/giu);
  if (reviewCount) {
    findings.push({
      id: "unverified-city-review-attribution",
      count: reviewCount,
      guidance: "Remove or neutralize the review until the public review or private project record establishes the city.",
    });
  }

  const warrantyCount = occurrences(html, /\b10-year workmanship warranty\b/giu);
  if (warrantyCount) {
    warnings.push({
      id: "provisional-10-year-workmanship-warranty",
      count: warrantyCount,
      guidance: "Preserve but do not expand until the current warranty instrument is registered.",
    });
  }

  const primary = jsonLdBlocks(html).map(findPrimaryContractor).find(Boolean) || null;
  const hasMap = primary?.hasMap || null;
  let identityState = "missing-primary-entity-map";
  if (hasMap === `https://www.google.com/maps?cid=${heberCid}`) identityState = "current-heber-keystone-pending-service-area-evidence";
  else if (hasMap === `https://www.google.com/maps?cid=${slvCid}`) identityState = "salt-lake-valley-identity-present-requires-registered-evidence";
  else if (hasMap) identityState = "other-map-identity-requires-review";

  blockingFindingClasses += findings.length;
  blockingOccurrences += findings.reduce((sum, finding) => sum + finding.count, 0);
  provisionalWarningClasses += warnings.length;
  provisionalOccurrences += warnings.reduce((sum, warning) => sum + warning.count, 0);
  pages.push({
    city: config.city,
    slug,
    file,
    sha256: sha256(html),
    title: html.match(/<title>([^<]+)<\/title>/i)?.[1] || null,
    h1: stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    canonical: html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] || null,
    serviceAreaStatus: "pending-current-profile-service-area-verification",
    identity: {
      state: identityState,
      publishedHasMap: hasMap,
      publishedSameAsCount: Array.isArray(primary?.sameAs) ? primary.sameAs.length : 0,
      decision: "Measurement only. Do not change the entity graph until current profile service-area evidence and explicit public scope are registered.",
    },
    findings,
    warnings,
  });
}

const report = {
  schemaVersion: 1,
  auditId: "frame-utah-slv-expansion-integrity-v1",
  preparedAt: "2026-08-12T17:15:48Z",
  preparedFromCommit: "abb96cda25c47155f2484e96e432023eeeb47d55",
  publicMutationPerformed: false,
  status: blockingFindingClasses ? "measurement-only-integrity-cleanup-required" : "measurement-only-integrity-green",
  scope: {
    registry: "data/rank-tracker/expansion-panels.json",
    cities: pages.length,
    pages: pages.map((page) => page.file),
    serviceAreaEvidence: "pending-for-all-cities",
  },
  summary: {
    checkedPages: pages.length,
    blockingFindingClasses,
    blockingOccurrences,
    provisionalWarningClasses,
    provisionalOccurrences,
    pagesWithSaltLakeValleyIdentity: pages.filter((page) => page.identity.state.startsWith("salt-lake-valley")).length,
    pagesWithHeberKeystone: pages.filter((page) => page.identity.state.startsWith("current-heber")).length,
  },
  rules: patterns.map(({ id, guidance }) => ({ id, guidance })).concat([
    { id: "unverified-city-project-attribution", guidance: "Require a city-specific public review or private project record before attribution." },
    { id: "unverified-city-review-attribution", guidance: "Require the public review or private project record to establish the city." },
  ]),
  identityRule: "A pending expansion city is not failed merely for retaining the current Heber keystone; it is blocked from Salt Lake Valley identity adoption until current service-area evidence and explicit public approval exist.",
  pages,
};

const reportText = `${JSON.stringify(report, null, 2)}\n`;
if (write) {
  fs.writeFileSync(outputFile, reportText);
  console.log(`WROTE ${path.relative(root, outputFile)}: ${blockingFindingClasses} blocking finding classes across ${pages.length} pages`);
} else if (check) {
  const current = fs.readFileSync(outputFile, "utf8");
  if (current !== reportText) throw new Error("SLV expansion integrity audit is stale; run npm run sync:slv-expansion-integrity");
  console.log(`PASS SLV expansion integrity audit: ${blockingFindingClasses} blocking finding classes, ${provisionalWarningClasses} provisional warnings, ${pages.length} measurement-only pages`);
} else {
  console.log(reportText.trimEnd());
}
if (strict && blockingFindingClasses) process.exit(1);
