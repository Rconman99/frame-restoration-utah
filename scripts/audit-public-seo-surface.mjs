#!/usr/bin/env node
/**
 * Public SEO surface guard for Frame Restoration Utah.
 *
 * Scans files that Vercel would deploy and blocks stale public SEO/AEO signals:
 * old domain, legacy public phone, and sitemap URLs that point at noindex pages.
 */

import fs from "node:fs";
import path from "node:path";

const repoRoot = process.cwd();
const failures = [];

const textExt = new Set([".html", ".htm", ".xml", ".txt"]);
const skipDirs = new Set(["node_modules", ".git", ".vercel", ".claude", "scripts"]);

const ignoreMatchers = loadVercelIgnore();

function loadVercelIgnore() {
  const file = path.join(repoRoot, ".vercelignore");
  if (!fs.existsSync(file)) return [];
  const out = [];
  for (let line of fs.readFileSync(file, "utf8").split("\n")) {
    line = line.trim();
    if (!line || line.startsWith("#")) continue;
    const neg = line.startsWith("!");
    if (neg) line = line.slice(1);
    const pat = line.replace(/^\//, "");
    const hasSlash = pat.includes("/") && !pat.endsWith("/");
    const isDir = pat.endsWith("/");
    const base = isDir ? pat.slice(0, -1) : pat;
    const reStr = base.replace(/[.+^${}()|[\]\\]/g, "\\$&").replace(/\*/g, "[^/]*").replace(/\?/g, ".");
    out.push({ re: new RegExp(`^${reStr}${isDir ? "(/|$)" : "$"}`), hasSlash, isDir, neg });
  }
  return out;
}

function isDeployed(rel) {
  const base = path.basename(rel);
  let ignored = false;
  for (const matcher of ignoreMatchers) {
    const target = matcher.hasSlash || matcher.isDir ? rel : base;
    const hit = matcher.isDir ? matcher.re.test(rel) : matcher.re.test(target);
    if (hit) ignored = !matcher.neg;
  }
  return !ignored;
}

function walk(dir, acc = []) {
  for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
    if (skipDirs.has(ent.name)) continue;
    const full = path.join(dir, ent.name);
    const rel = path.relative(repoRoot, full).replaceAll(path.sep, "/");
    if (ent.isDirectory()) walk(full, acc);
    else if (textExt.has(path.extname(ent.name).toLowerCase()) && isDeployed(rel)) acc.push(rel);
  }
  return acc;
}

function fail(message) {
  failures.push(message);
  console.error(`::error::${message}`);
}

const deployed = walk(repoRoot).sort();

for (const rel of deployed) {
  const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  if (/frameroofingutah\.com/i.test(text)) {
    fail(`${rel} contains retired domain frameroofingutah.com`);
  }
  if (/(?:\+?1[-.\s]?)?\(?435\)?[-.\s]?302[-.\s]?4422/.test(text)) {
    fail(`${rel} contains legacy/internal phone (435) 302-4422`);
  }
}

const sitemapPath = path.join(repoRoot, "sitemap.xml");
if (fs.existsSync(sitemapPath)) {
  const sitemap = fs.readFileSync(sitemapPath, "utf8");
  const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map((m) => m[1]);
  for (const url of urls) {
    const relPath = url.replace(/^https:\/\/www\.framerestorationutah\.com\/?/, "");
    const localRel = relPath || "index";
    const candidates = [
      `${localRel}.html`,
      `${localRel}/index.html`,
      localRel,
    ];
    const local = candidates.find((candidate) => fs.existsSync(path.join(repoRoot, candidate)));
    if (!local) continue;
    const text = fs.readFileSync(path.join(repoRoot, local), "utf8");
    if (/<meta[^>]+name=["']robots["'][^>]+content=["'][^"']*noindex/i.test(text)) {
      fail(`sitemap includes noindex URL ${url} (${local})`);
    }
  }
}

console.log(`Public SEO surface audit scanned ${deployed.length} deployed text file(s)`);

if (failures.length) {
  console.error(`Public SEO surface audit failed (${failures.length} issue(s))`);
  process.exit(1);
}

console.log("Public SEO surface audit passed");
