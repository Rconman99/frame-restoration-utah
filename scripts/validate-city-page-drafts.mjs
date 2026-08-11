#!/usr/bin/env node

import { createHash } from "node:crypto";
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { basename, join, relative, resolve } from "node:path";

const root = process.cwd();
const previewRoot = resolve(root, "previews/city-pages");
const failures = [];

function hash(value) {
  return createHash("sha256").update(value).digest("hex");
}

function fail(file, message) {
  failures.push(`${relative(root, file)}: ${message}`);
}

function safeTarget(rel, file, label) {
  if (typeof rel !== "string" || !rel || rel.startsWith("/") || rel.split("/").includes("..")) {
    fail(file, `${label} is not a safe repository-relative path`);
    return null;
  }
  const target = resolve(root, rel);
  if (target !== root && !target.startsWith(`${root}/`)) {
    fail(file, `${label} escapes the repository`);
    return null;
  }
  return target;
}

function jsonLdNodes(html, file) {
  const nodes = [];
  const blocks = html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu,
  );
  const append = (value) => {
    if (Array.isArray(value)) {
      for (const item of value) append(item);
      return;
    }
    if (!value || typeof value !== "object") return;
    nodes.push(value);
    if (Array.isArray(value["@graph"])) append(value["@graph"]);
  };
  for (const block of blocks) {
    try {
      append(JSON.parse(block[1]));
    } catch (error) {
      fail(file, `invalid JSON-LD: ${error.message}`);
    }
  }
  return nodes;
}

if (!existsSync(previewRoot)) {
  console.error("City page draft audit FAILED: previews/city-pages is missing");
  process.exit(1);
}

const manifestFiles = readdirSync(previewRoot)
  .filter((name) => name.endsWith(".manifest.json"))
  .map((name) => join(previewRoot, name))
  .sort();

if (!manifestFiles.length) failures.push("previews/city-pages: no generated draft manifests found");

for (const manifestFile of manifestFiles) {
  let manifest;
  try {
    manifest = JSON.parse(readFileSync(manifestFile, "utf8"));
  } catch (error) {
    fail(manifestFile, `invalid JSON: ${error.message}`);
    continue;
  }

  if (manifest.artifact !== "frame-city-page-generator" || manifest.version !== 1 || manifest.mode !== "preview_only") {
    fail(manifestFile, "unsupported generator contract");
  }
  if (manifest.status !== "draft_ready" || manifest.errors?.length) fail(manifestFile, "manifest is not an error-free draft_ready artifact");

  const safety = manifest.safety || {};
  for (const key of ["publicSideEffects", "liveRouteWrites", "indexingSubmissions", "gbpMutations", "outreachSends"]) {
    if (safety[key] !== 0) fail(manifestFile, `${key} must remain zero`);
  }
  if (safety.secretsIncluded !== false) fail(manifestFile, "secretsIncluded must be false");

  const htmlFile = safeTarget(manifest.destination?.previewPath, manifestFile, "previewPath");
  const expectedManifestFile = safeTarget(manifest.destination?.previewManifestPath, manifestFile, "previewManifestPath");
  const liveFile = safeTarget(manifest.destination?.livePath, manifestFile, "livePath");
  if (expectedManifestFile && expectedManifestFile !== manifestFile) fail(manifestFile, "previewManifestPath does not point to this manifest");
  if (!htmlFile || !existsSync(htmlFile)) {
    fail(manifestFile, "preview HTML is missing");
    continue;
  }

  const html = readFileSync(htmlFile, "utf8");
  const identityMarker = manifest.candidate?.identityMarker;
  const identityVerified =
    manifest.candidate?.localIdentityStatus === "verified" &&
    manifest.candidate?.gbpCidPresent === true &&
    manifest.candidate?.publicPhonePresent === true &&
    typeof identityMarker === "string" &&
    /^frame-city-generator-identity-v1:\d{10,20}$/u.test(identityMarker);
  const telCtaPresent = /href=["']tel:/iu.test(html);
  const schemaNodes = jsonLdNodes(html, htmlFile);
  const roofingContractors = schemaNodes.filter((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return types.includes("RoofingContractor");
  });
  const genericLocalBusinesses = schemaNodes.filter((node) => {
    const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
    return types.includes("LocalBusiness");
  });
  if (hash(html) !== manifest.candidate?.candidateHash) fail(htmlFile, "candidate hash does not match the manifest");
  if (!html.includes(`data-city-generator-marker="${manifest.candidate?.marker}"`)) fail(htmlFile, "freshness marker is missing");
  if (!/<meta\s+name="robots"\s+content="noindex, nofollow, noarchive"\s*\/>/u.test(html)) fail(htmlFile, "strict noindex policy is missing");
  if (/rel=["']canonical["']/iu.test(html)) fail(htmlFile, "draft must not publish a canonical URL");
  if (genericLocalBusinesses.length) fail(htmlFile, "draft must use the verified specific business subtype, not generic LocalBusiness schema");
  if (!identityVerified) {
    if (telCtaPresent) fail(htmlFile, "draft must not publish an unverified phone CTA");
    if (roofingContractors.length) fail(htmlFile, "draft must not publish RoofingContractor schema before identity verification");
  } else {
    const gbpCid = identityMarker.split(":").at(-1);
    if (!telCtaPresent) fail(htmlFile, "verified identity draft must render its phone CTA");
    if (roofingContractors.length !== 1) fail(htmlFile, "verified identity draft must render exactly one RoofingContractor node");
    const contractor = roofingContractors[0];
    if (contractor && contractor.hasMap !== `https://www.google.com/maps?cid=${gbpCid}`) {
      fail(htmlFile, "RoofingContractor hasMap must match the verified identity CID");
    }
    if (contractor && !/^\+1\d{10}$/u.test(contractor.telephone || "")) {
      fail(htmlFile, "RoofingContractor telephone must be a verified E.164 US number");
    }
  }
  if (!/data-publication-state="draft"/u.test(html)) fail(htmlFile, "draft publication state is missing");

  if (manifest.destination?.existingLiveRoute) {
    if (!liveFile || !existsSync(liveFile)) fail(manifestFile, "recorded existing live route is missing");
    else if (hash(readFileSync(liveFile)) !== manifest.destination.existingLiveHash) fail(liveFile, "existing live route changed after draft generation");
  }

  if (basename(htmlFile).replace(/\.html$/u, "") !== manifest.candidate?.slug) fail(htmlFile, "preview filename and candidate slug differ");
}

if (failures.length) {
  console.error(`City page draft audit FAILED (${failures.length} issue(s))`);
  for (const failure of failures) console.error(`- ${failure}`);
  process.exit(1);
}

console.log(`PASS city page draft audit: ${manifestFiles.length} preview(s), live routes unchanged, no public mutation signals`);
