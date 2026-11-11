#!/usr/bin/env node
/**
 * Fail if a published page is missing from sitemap.xml.
 *
 * --url checks one URL (the page a publish run just wrote).
 * With no --url, the newest indexable HTML page added under blog/, locations/,
 * pages/, or index.html — by git add date — must be in the sitemap. A shallow
 * clone fails this mode instead of pretending the newest page was checked.
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

export function normalizeLoc(value) {
  try {
    const url = new URL(String(value).trim());
    url.hash = "";
    url.search = "";
    let pathname = url.pathname;
    if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    return `${host}${pathname}`;
  } catch {
    return String(value || "").trim();
  }
}

export function sitemapLocs(xml) {
  const locs = new Set();
  for (const match of String(xml).matchAll(/<loc>\s*([^<]+?)\s*<\/loc>/g)) locs.add(normalizeLoc(match[1]));
  return locs;
}

export function isPublishedPath(file) {
  const rel = String(file || "").replace(/\\/g, "/").replace(/^\.\//, "");
  if (!rel.endsWith(".html")) return false;
  return rel === "index.html" || rel.startsWith("blog/") || rel.startsWith("locations/") || rel.startsWith("pages/");
}

export function parseAddedHtml(logText) {
  const byFile = new Map();
  let addedAt = null;
  for (const line of String(logText).split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    if (/^\d{4}-\d{2}-\d{2}T/.test(trimmed)) {
      addedAt = trimmed;
      continue;
    }
    if (!addedAt || !isPublishedPath(trimmed)) continue;
    const prev = byFile.get(trimmed);
    if (!prev || Date.parse(addedAt) > Date.parse(prev.addedAt)) byFile.set(trimmed, { file: trimmed, addedAt });
  }
  return [...byFile.values()];
}

export function canonicalFromHtml(html) {
  const tags = String(html).match(/<link\b[^>]*>/gi) || [];
  for (const tag of tags) {
    if (!/\brel\s*=\s*["'][^"']*\bcanonical\b[^"']*["']/i.test(tag)) continue;
    const href = tag.match(/\bhref\s*=\s*["']([^"']+)["']/i);
    if (href) return href[1].trim();
  }
  return null;
}

export function urlForRepoPath(rel) {
  const file = String(rel).replace(/\\/g, "/");
  if (file === "index.html") return "https://www.framerestorationutah.com/";
  let pathname = file;
  if (pathname.endsWith("/index.html")) pathname = pathname.slice(0, -"/index.html".length);
  else if (pathname.endsWith(".html")) pathname = pathname.slice(0, -".html".length);
  return `https://www.framerestorationutah.com/${pathname}`;
}

export function isNoindex(html) {
  return /\bnoindex\b/i.test(String(html));
}

/** Pages that share the newest add timestamp. One commit can publish several. */
export function newestPublishedBatch(entries) {
  const indexable = (entries || []).filter((entry) => entry && !entry.noindex && Number.isFinite(Date.parse(entry.addedAt)));
  if (!indexable.length) return [];
  const newest = Math.max(...indexable.map((entry) => Date.parse(entry.addedAt)));
  return indexable
    .filter((entry) => Date.parse(entry.addedAt) === newest)
    .sort((a, b) => a.file.localeCompare(b.file));
}

export function missingFromSitemap(entries, locs) {
  return entries.filter((entry) => !locs.has(normalizeLoc(entry.canonical || entry.url || "")));
}

function fail(message) {
  console.error(message);
  if (process.env.GITHUB_ACTIONS) console.error(`::error::${message.split("\n")[0]}`);
  process.exit(1);
}

function parseArgs(argv) {
  const args = { root, sitemap: path.join(root, "sitemap.xml") };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--url") args.url = argv[++i];
    else if (argv[i] === "--sitemap") args.sitemap = argv[++i];
    else if (argv[i] === "--root") args.root = argv[++i];
    else if (argv[i] === "--git-log") args.gitLog = argv[++i];
    else throw new Error(`unknown argument ${argv[i]}`);
  }
  return args;
}

export function assertUrlInSitemap(url, xml) {
  const locs = sitemapLocs(xml);
  if (!locs.has(normalizeLoc(url))) {
    throw new Error(
      `SITEMAP MISSING PUBLISHED PAGE: ${url}\nThat URL is not a <loc> in sitemap.xml. The publish is incomplete until the sitemap lists it.`,
    );
  }
}

function readXml(sitemapPath) {
  if (!fs.existsSync(sitemapPath)) fail(`SITEMAP MISSING: ${sitemapPath} does not exist.`);
  return fs.readFileSync(sitemapPath, "utf8");
}

function shallowClone(repoRoot) {
  if (fs.existsSync(path.join(repoRoot, ".git/shallow"))) return true;
  try {
    const value = execFileSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: repoRoot, encoding: "utf8" }).trim();
    return value === "true";
  } catch {
    return false;
  }
}

export function loadPublishedEntries(logText, { readFile }) {
  return parseAddedHtml(logText).map((entry) => {
    let html = "";
    let missingFile = false;
    try {
      html = readFile(entry.file);
    } catch {
      missingFile = true;
    }
    const canonical = html ? canonicalFromHtml(html) || urlForRepoPath(entry.file) : urlForRepoPath(entry.file);
    return {
      ...entry,
      missingFile,
      noindex: html ? isNoindex(html) : false,
      canonical,
    };
  }).filter((entry) => !entry.missingFile);
}

function checkNewest(args) {
  if (!args.gitLog && shallowClone(args.root)) {
    fail(
      "SITEMAP CHECK REFUSED: git history is shallow, so the newest published page cannot be identified. Check out with fetch-depth: 0 and run this again.",
    );
  }
  const logText = args.gitLog
    ? fs.readFileSync(args.gitLog, "utf8")
    : execFileSync(
      "git",
      ["log", "--diff-filter=A", "--pretty=format:%cI", "--name-only", "--", "blog", "locations", "pages", "index.html"],
      { cwd: args.root, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 },
    );
  const entries = loadPublishedEntries(logText, {
    readFile: (rel) => fs.readFileSync(path.join(args.root, rel), "utf8"),
  });
  const batch = newestPublishedBatch(entries);
  if (!batch.length) {
    fail("SITEMAP CHECK FAILED: git history has no indexable published HTML page under blog/, locations/, pages/, or index.html.");
  }
  const locs = sitemapLocs(readXml(args.sitemap));
  const missing = missingFromSitemap(batch, locs);
  if (missing.length) {
    const detail = missing.map((entry) => `${entry.file} (added ${entry.addedAt}) canonical ${entry.canonical}`).join("\n");
    fail(`SITEMAP MISSING NEWEST PUBLISHED PAGE:\n${detail}\nAdd the canonical URL to sitemap.xml.`);
  }
  const listed = batch.map((entry) => `${entry.canonical} (${entry.file}, added ${entry.addedAt})`).join("; ");
  console.log(`Sitemap contains the newest published page: ${listed}`);
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.url) {
    try {
      assertUrlInSitemap(args.url, readXml(args.sitemap));
    } catch (error) {
      fail(error.message);
    }
    console.log(`Sitemap contains ${args.url}`);
    return;
  }
  checkNewest(args);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) main();
