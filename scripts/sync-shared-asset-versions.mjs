#!/usr/bin/env node
/**
 * Keep explicit shared CSS/JS cache-buster URLs synchronized across every
 * deployed HTML file.
 *
 * Vercel now requires mutable JS/CSS to revalidate, while these version tokens
 * also protect against stale intermediary/browser caches and make release
 * receipts explicit. Run with --write to update the corpus; CI runs the default
 * --check mode and fails closed on drift.
 */

import { existsSync, readFileSync, readdirSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const versions = JSON.parse(
  readFileSync(resolve(root, "scripts/shared-asset-versions.json"), "utf8"),
);
const write = process.argv.includes("--write");
const failures = [];
const contractFailures = [];
const changed = [];
const skipDirs = new Set(["node_modules", ".git", ".vercel"]);

function loadVercelIgnore() {
  const file = resolve(root, ".vercelignore");
  if (!existsSync(file)) return [];
  const out = [];
  for (let line of readFileSync(file, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const negated = line.startsWith("!");
    if (negated) line = line.slice(1);
    const pattern = line.replace(/^\//u, "");
    const hasSlash = pattern.includes("/") && !pattern.endsWith("/");
    const isDir = pattern.endsWith("/");
    const base = isDir ? pattern.slice(0, -1) : pattern;
    const source = base
      .replace(/[.+^${}()|[\]\\]/gu, "\\$&")
      .replace(/\*/gu, "[^/]*")
      .replace(/\?/gu, ".");
    out.push({
      re: new RegExp(`^${source}${isDir ? "(/|$)" : "$"}`),
      hasSlash,
      isDir,
      negated,
    });
  }
  return out;
}

const ignoreMatchers = loadVercelIgnore();

function isDeployed(rel) {
  let ignored = false;
  for (const matcher of ignoreMatchers) {
    const target = matcher.hasSlash || matcher.isDir ? rel : basename(rel);
    if (matcher.re.test(target)) ignored = !matcher.negated;
  }
  return !ignored;
}

function walk(dir, files = []) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(entry.name)) continue;
    const absolute = join(dir, entry.name);
    const rel = relative(root, absolute).replaceAll(sep, "/");
    if (entry.isDirectory()) {
      walk(absolute, files);
    } else if (extname(entry.name).toLowerCase() === ".html" && isDeployed(rel)) {
      files.push({ absolute, rel });
    }
  }
  return files;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}

for (const { absolute, rel } of walk(root).sort((a, b) => a.rel.localeCompare(b.rel))) {
  const before = readFileSync(absolute, "utf8");
  let after = before;

  for (const [asset, version] of Object.entries(versions)) {
    if (!version || !/^[a-z0-9._-]+$/iu.test(version)) {
      throw new Error(`Invalid version token for ${asset}`);
    }
    const assetPattern = escapeRegExp(asset);
    const reference = new RegExp(
      `((?:href|src)=["'][^"']*?${assetPattern})(?:\\?v=[^"'#\\s>]*)?(["'])`,
      "gu",
    );
    after = after.replace(reference, `$1?v=${version}$2`);
  }

  if (after === before) continue;
  if (write) {
    writeFileSync(absolute, after);
    changed.push(rel);
  } else {
    failures.push(rel);
  }
}

const blogGenerator = readFileSync(resolve(root, "scripts/generate-blog-post.py"), "utf8");
for (const asset of ["global.css", "global-modal.js"]) {
  if (!blogGenerator.includes(`SHARED_ASSET_VERSIONS['${asset}']`)) {
    contractFailures.push(`scripts/generate-blog-post.py does not use the shared ${asset} version`);
  }
}

if (contractFailures.length) {
  console.error("Shared asset generator contract FAILED");
  for (const failure of contractFailures) console.error(`- ${failure}`);
  process.exit(1);
}

if (write) {
  console.log(`Updated shared asset versions in ${changed.length} deployed HTML file(s)`);
  for (const rel of changed) console.log(`- ${rel}`);
  process.exit(0);
}

if (failures.length) {
  console.error("Shared asset version audit FAILED");
  for (const rel of failures) console.error(`- ${rel}`);
  console.error("Run: npm run sync:shared-assets");
  process.exit(1);
}

console.log(
  `PASS shared asset versions: ${Object.keys(versions).length} cache-busted asset URL(s) are synchronized`,
);
