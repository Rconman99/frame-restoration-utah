#!/usr/bin/env node
/**
 * Verify that every local static asset referenced by sitemap pages and shared
 * stylesheets exists in the deployment source tree.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const productionHost = "www.framerestorationutah.com";
const assetExtensions = /\.(?:avif|css|gif|ico|jpe?g|js|json|png|svg|webp|woff2?)(?:[?#]|$)/iu;
const failures = [];
const generatedFallbackAsset = "images/projects/heber-valley-drone-poster.webp";
const generatorSources = [
  "scripts/generate-blog-post.py",
  "scripts/blog-cron.sh",
  "scripts/blog-publish.py",
];

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
  if (!assetExtensions.test(token)) return null;
  if (/^https?:\/\//iu.test(token)) {
    const url = new URL(token);
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

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  console.error(`Static asset audit failed: ${failures.length} missing reference(s)`);
  process.exit(1);
}

console.log(`Static asset audit passed: ${sources.length} source files, ${references} unique local references`);
