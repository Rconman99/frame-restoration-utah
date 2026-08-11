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
  if (hash(html) !== manifest.candidate?.candidateHash) fail(htmlFile, "candidate hash does not match the manifest");
  if (!html.includes(`data-city-generator-marker="${manifest.candidate?.marker}"`)) fail(htmlFile, "freshness marker is missing");
  if (!/<meta\s+name="robots"\s+content="noindex, nofollow, noarchive"\s*\/>/u.test(html)) fail(htmlFile, "strict noindex policy is missing");
  if (/rel=["']canonical["']/iu.test(html)) fail(htmlFile, "draft must not publish a canonical URL");
  if (/href=["']tel:/iu.test(html)) fail(htmlFile, "draft must not publish an unverified phone CTA");
  if (/"@type"\s*:\s*"LocalBusiness"/u.test(html)) fail(htmlFile, "draft must not publish LocalBusiness schema before identity verification");
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
