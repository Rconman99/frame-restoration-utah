#!/usr/bin/env node

import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const registryPath = path.join(repoRoot, "data/route-factory/claim-registry.json");
const llmsPath = path.join(repoRoot, "llms.txt");
const writeMode = process.argv.includes("--write");
const jsonMode = process.argv.includes("--json");
const today = new Date().toISOString().slice(0, 10);

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, "utf8"));
}

function resolvePointer(value, pointer) {
  if (pointer === "" || pointer === "/") return value;
  return pointer
    .split("/")
    .slice(1)
    .map((part) => part.replace(/~1/g, "/").replace(/~0/g, "~"))
    .reduce((current, part) => current?.[part], value);
}

function isIsoDate(value) {
  return typeof value === "string" && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function renderLlms(registry, claimsById) {
  const claim = (id) => claimsById.get(id)?.value ?? "";
  const baseUrl = claim("identity.canonical_url").replace(/\/+$/, "");
  const locationPages = fs
    .readdirSync(path.join(repoRoot, "locations"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html")).length;

  const lines = [
    `# ${claim("identity.public_brand")}`,
    "",
    `> ${claim("operations.summary")}`,
    "",
    "## Verified public identity",
    `- Legal entity: ${claim("identity.legal_entity")}`,
    `- Website: ${baseUrl}`,
    `- Phone: ${claim("identity.public_phone")}`,
    `- Email: ${claim("identity.public_email")}`,
    `- Address: ${claim("identity.public_address")}`,
    "",
    "## Published roofing services",
    ...registry.services.map((service) => `- ${service.name}: ${baseUrl}${service.path}`),
    "",
    "## Published local coverage",
    `- ${locationPages} top-level Utah location pages are present in the published repository and sitemap.`,
    `- Canonical sitemap: ${baseUrl}/sitemap.xml`,
    "",
    "## Operating boundary",
    claim("operations.insurance_boundary"),
    "",
    "## Source policy",
    "- This file is a generated fact sheet, not a ranking signal or a substitute for the linked pages.",
    "- Pricing, insurance outcomes, third-party rankings, review counts, and unregistered credentials are intentionally excluded.",
    "- Repository source: data/route-factory/claim-registry.json (not a public route)",
    `- Last fact review: ${registry.reviewedAt}`,
    "",
  ];

  return lines.join("\n");
}

const errors = [];
let registry;

try {
  registry = readJson(registryPath);
} catch (error) {
  console.error(`[claim-registry] cannot read registry: ${error.message}`);
  process.exit(2);
}

if (registry.schemaVersion !== 1) errors.push("schemaVersion must be 1");
if (!isIsoDate(registry.reviewedAt)) errors.push("reviewedAt must be YYYY-MM-DD");
if (isIsoDate(registry.reviewedAt) && registry.reviewedAt > today) {
  errors.push(`reviewedAt cannot be in the future: ${registry.reviewedAt}`);
}
if (!Array.isArray(registry.claims) || registry.claims.length === 0) {
  errors.push("claims must be a non-empty array");
}
if (!Array.isArray(registry.services) || registry.services.length === 0) {
  errors.push("services must be a non-empty array");
}

const claimsById = new Map();
for (const claim of registry.claims || []) {
  const prefix = claim?.id ? `claim ${claim.id}` : "claim <missing-id>";
  if (!claim?.id || typeof claim.id !== "string") {
    errors.push(`${prefix}: id is required`);
    continue;
  }
  if (claimsById.has(claim.id)) errors.push(`${prefix}: duplicate id`);
  claimsById.set(claim.id, claim);
  if (!claim.label || typeof claim.value !== "string" || !claim.value.trim()) {
    errors.push(`${prefix}: label and non-empty string value are required`);
  }
  if (claim.status !== "verified") errors.push(`${prefix}: status must be verified`);
  if (!claim.verifiedBy || !isIsoDate(claim.verifiedOn)) {
    errors.push(`${prefix}: verifiedBy and verifiedOn are required`);
  }
  if (isIsoDate(claim.verifiedOn) && claim.verifiedOn > today) {
    errors.push(`${prefix}: verifiedOn cannot be in the future: ${claim.verifiedOn}`);
  }
  if (claim.expiresOn !== null && !isIsoDate(claim.expiresOn)) {
    errors.push(`${prefix}: expiresOn must be null or YYYY-MM-DD`);
  }
  if (claim.expiresOn && claim.expiresOn < today) {
    errors.push(`${prefix}: expired on ${claim.expiresOn}`);
  }
  if (!Array.isArray(claim.allowedSurfaces) || claim.allowedSurfaces.length === 0) {
    errors.push(`${prefix}: allowedSurfaces must be non-empty`);
  }
  if (!Array.isArray(claim.prohibitedVariants)) {
    errors.push(`${prefix}: prohibitedVariants must be an array`);
  }
  if (!Array.isArray(claim.evidence) || claim.evidence.length === 0) {
    errors.push(`${prefix}: evidence must be non-empty`);
  }

  for (const evidence of claim.evidence || []) {
    if (!evidence.path) {
      errors.push(`${prefix}: local evidence path is required`);
      continue;
    }
    const evidencePath = path.join(repoRoot, evidence.path);
    if (!fs.existsSync(evidencePath)) {
      errors.push(`${prefix}: evidence path missing: ${evidence.path}`);
      continue;
    }
    if (evidence.kind === "local-json" && evidence.pointer) {
      try {
        const actual = resolvePointer(readJson(evidencePath), evidence.pointer);
        if (actual === undefined) {
          errors.push(`${prefix}: evidence pointer missing: ${evidence.path}${evidence.pointer}`);
        }
      } catch (error) {
        errors.push(`${prefix}: invalid JSON evidence ${evidence.path}: ${error.message}`);
      }
    }
  }

  for (const mirror of claim.mirrors || []) {
    const mirrorPath = path.join(repoRoot, mirror.path || "");
    if (!mirror.path || !fs.existsSync(mirrorPath)) {
      errors.push(`${prefix}: mirror path missing: ${mirror.path || "<missing>"}`);
      continue;
    }
    try {
      const actual = resolvePointer(readJson(mirrorPath), mirror.pointer);
      const expected = mirror.expected ?? claim.value;
      if (actual !== expected) {
        errors.push(`${prefix}: mirror drift at ${mirror.path}${mirror.pointer}; expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    } catch (error) {
      errors.push(`${prefix}: invalid mirror ${mirror.path}: ${error.message}`);
    }
  }
}

for (const service of registry.services || []) {
  if (!service.name || !service.path || !service.sourceFile) {
    errors.push("each service requires name, path, and sourceFile");
    continue;
  }
  if (!fs.existsSync(path.join(repoRoot, service.sourceFile))) {
    errors.push(`service source missing: ${service.sourceFile}`);
  }
}

const canonicalUrl = claimsById.get("identity.canonical_url")?.value?.replace(/\/+$/, "");
const sitemapPath = path.join(repoRoot, "sitemap.xml");
if (canonicalUrl && fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  for (const service of registry.services || []) {
    const expectedUrl = `<loc>${canonicalUrl}${service.path}</loc>`;
    if (!sitemap.includes(expectedUrl)) errors.push(`service route missing from sitemap: ${service.path}`);
  }
  const locationEntries = fs
    .readdirSync(path.join(repoRoot, "locations"), { withFileTypes: true })
    .filter((entry) => entry.isFile() && entry.name.endsWith(".html"));
  for (const entry of locationEntries) {
    const slug = entry.name.replace(/\.html$/, "");
    const expectedUrl = `<loc>${canonicalUrl}/locations/${slug}</loc>`;
    if (!sitemap.includes(expectedUrl)) errors.push(`location route missing from sitemap: ${slug}`);
  }
} else {
  errors.push("canonical URL or sitemap.xml is missing");
}

const requiredClaimIds = [
  "identity.public_brand",
  "identity.legal_entity",
  "identity.canonical_url",
  "identity.public_phone",
  "identity.public_email",
  "identity.public_address",
  "operations.summary",
  "operations.insurance_boundary",
];
for (const id of requiredClaimIds) {
  if (!claimsById.has(id)) errors.push(`required claim missing: ${id}`);
}

const rendered = renderLlms(registry, claimsById);
for (const claim of registry.claims || []) {
  for (const prohibited of claim.prohibitedVariants || []) {
    if (prohibited && rendered.toLowerCase().includes(prohibited.toLowerCase())) {
      errors.push(`generated llms.txt contains prohibited variant from ${claim.id}: ${prohibited}`);
    }
  }
}

if (writeMode && errors.length === 0) {
  fs.writeFileSync(llmsPath, rendered, "utf8");
}

if (!writeMode) {
  const actual = fs.existsSync(llmsPath) ? fs.readFileSync(llmsPath, "utf8") : "";
  if (actual !== rendered) {
    errors.push("llms.txt drifted from the claim registry; run node scripts/audit-claim-registry.mjs --write");
  }
}

const result = {
  schemaVersion: 1,
  market: registry.market,
  claims: claimsById.size,
  services: registry.services?.length ?? 0,
  wroteLlms: writeMode && errors.length === 0,
  errors,
};

if (jsonMode) {
  console.log(JSON.stringify(result, null, 2));
} else if (errors.length > 0) {
  console.error(`[claim-registry] FAILED (${errors.length})`);
  for (const error of errors) console.error(`- ${error}`);
} else {
  console.log(`[claim-registry] PASS: ${result.claims} verified claims, ${result.services} service routes, llms.txt ${writeMode ? "generated" : "in parity"}`);
}

process.exit(errors.length > 0 ? 1 : 0);
