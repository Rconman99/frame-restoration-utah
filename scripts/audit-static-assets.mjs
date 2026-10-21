#!/usr/bin/env node
/**
 * Verify that every local static asset referenced by sitemap pages and shared
 * stylesheets exists and is included in the deployment. Original brand design
 * sources stay in Git but must not be part of the hosted output.
 */

import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import { execFileSync, spawnSync } from "node:child_process";

const root = process.cwd();
const productionHost = "www.framerestorationutah.com";
// Recognize extensions beyond web media, including original designs and documents.
const assetExtensions = /\.[a-z0-9]*[a-z][a-z0-9]*(?:[?#]|$)/iu;
const originalDesignSources = [];
const referencedAssets = new Map();
const failures = [];
const generatedFallbackAsset = "images/projects/heber-valley-drone-poster.webp";
const generatorSources = [
  "scripts/generate-blog-post.py",
  "scripts/blog-cron.sh",
  "scripts/blog-publish.py",
];

// Use Git's ignore engine in a disposable repository containing only these rules.
// This preserves globstar, nested-directory and parent-negation semantics without
// inheriting this checkout's .gitignore, global excludes, or tracked-file status.
// Match the case-sensitive Linux deployment paths on every developer platform.
function ignoredDeploymentFiles(files) {
  files = [...new Set(files)];
  if (!files.length) return new Set();
  const fixture = fs.mkdtempSync(path.join(os.tmpdir(), "frame-vercel-ignore-"));
  const env = { ...process.env, GIT_CONFIG_GLOBAL: os.devNull, GIT_CONFIG_NOSYSTEM: "1" };
  for (const key of ["GIT_DIR", "GIT_WORK_TREE", "GIT_INDEX_FILE", "GIT_COMMON_DIR"]) delete env[key];
  try {
    execFileSync("git", ["init", "--quiet", "--template=", fixture], { env });
    fs.copyFileSync(path.join(root, ".vercelignore"), path.join(fixture, ".gitignore"));
    const result = spawnSync("git", ["-C", fixture, "-c", `core.excludesFile=${os.devNull}`,
      "-c", "core.ignoreCase=false", "check-ignore", "--no-index", "--stdin", "-z"], {
      input: files.join("\0") + "\0", encoding: "utf8", env,
    });
    if (result.error || ![0, 1].includes(result.status)) {
      throw new Error(`Deployment ignore evaluation failed: ${result.error?.message || result.stderr}`);
    }
    return new Set(result.stdout.split("\0").filter(Boolean));
  } finally {
    fs.rmSync(fixture, { recursive: true, force: true });
  }
}

function auditOriginalDesignSources(directory) {
  if (!fs.existsSync(path.join(root, directory))) return;
  for (const entry of fs.readdirSync(path.join(root, directory), { withFileTypes: true })) {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) auditOriginalDesignSources(relative);
    else originalDesignSources.push(relative);
  }
}

auditOriginalDesignSources("images/brand-source");

function localPageForUrl(value) {
  const url = new URL(value);
  const rel = decodeURIComponent(url.pathname).replace(/^\/+|\/+$/gu, "");
  const candidates = rel
    ? [`${rel}.html`, `${rel}/index.html`, rel]
    : ["index.html"];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
}

function localAssetForToken(rawToken, sourceRel) {
  const token = rawToken.trim().replaceAll("&amp;", "&");
  if (!assetExtensions.test(token) || /^(?:data:|blob:|mailto:|tel:|sms:|#)/iu.test(token)) return null;
  if (/^(?:https?:)?\/\//iu.test(token)) {
    const url = new URL(token, `https://${productionHost}`);
    if (url.hostname !== productionHost && url.hostname !== `framerestorationutah.com`) return null;
    return decodeURIComponent(url.pathname).replace(/^\/+/, "");
  }

  const withoutSuffix = token.split(/[?#]/u, 1)[0];
  if (withoutSuffix.startsWith("/")) {
    return decodeURIComponent(withoutSuffix).replace(/^\/+/, "");
  }
  return path.normalize(path.join(path.dirname(sourceRel), decodeURIComponent(withoutSuffix)));
}

function scan(sourceRel) {
  const sourcePath = path.join(root, sourceRel);
  const text = fs.readFileSync(sourcePath, "utf8");
  const seen = new Set();
  const values = [];
  for (const match of text.matchAll(/\b(?:content|href|poster|src)\s*=\s*["']([^"']+)["']/giu)) {
    values.push(...match[1].split(/\s*,\s*|\s+(?=https?:|\.?\.?\/)/u).map((value) => value.split(/\s+/u, 1)[0]));
  }
  for (const match of text.matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/giu)) values.push(match[1]);
  for (const match of text.matchAll(/["'](?:contentUrl|image|logo|thumbnailUrl)["']\s*:\s*["']([^"']+)["']/giu)) values.push(match[1]);
  for (const match of text.matchAll(/fetch\(\s*["']([^"']+)["']/giu)) values.push(match[1]);

  for (const value of values) {
    const localRel = localAssetForToken(value, sourceRel);
    if (!localRel || seen.has(localRel)) continue;
    seen.add(localRel);
    const absolute = path.resolve(root, localRel);
    if (absolute !== root && !absolute.startsWith(`${root}${path.sep}`)) {
      failures.push(`${sourceRel} references an asset outside the site root: ${value}`);
    } else if (!fs.existsSync(absolute) || !fs.statSync(absolute).isFile()) {
      failures.push(`${sourceRel} references missing asset /${localRel}`);
    } else {
      const owners = referencedAssets.get(localRel) || new Set();
      owners.add(sourceRel);
      referencedAssets.set(localRel, owners);
    }
  }
  return seen.size;
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const sitemapUrls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map((match) => match[1]);
const pages = sitemapUrls.map(localPageForUrl).filter(Boolean);
const sources = [...new Set([...pages, "global.css", "global-critical.css"])];
let references = 0;
for (const source of sources) references += scan(source);

if (!fs.existsSync(path.join(root, generatedFallbackAsset))) {
  failures.push(`blog generator fallback asset is missing: /${generatedFallbackAsset}`);
}
for (const source of generatorSources) {
  const text = fs.readFileSync(path.join(root, source), "utf8");
  if (text.includes("/images/projects/cities/heber-valley-drone-poster.webp")) {
    failures.push(`${source} would regenerate the retired /images/projects/cities fallback path`);
  }
}

const ignored = ignoredDeploymentFiles([...originalDesignSources, ...referencedAssets.keys()]);
for (const file of originalDesignSources) {
  if (!ignored.has(file)) failures.push(`Original design source would be deployed: /${file}`);
}
for (const [file, sources] of referencedAssets) {
  if (ignored.has(file)) {
    for (const source of sources) failures.push(`${source} references an asset excluded from deployment: /${file}`);
  }
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  console.error(`Static asset audit failed: ${failures.length} deployment issue(s)`);
  process.exit(1);
}

console.log(`Static asset audit passed: ${sources.length} source files, ${references} unique local references`);
