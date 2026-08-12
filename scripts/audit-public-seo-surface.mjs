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
const canonicalBbbProfile = "https://www.bbb.org/us/ut/heber-city/profile/roofing-contractors/frame-restoration-utah-llc-1126-90056184";
const retiredBbbProfileFragment = "frame-restoration-utah-llc-1166-90056184";
const bbbGradePatterns = [
  /BBB[\s\S]{0,160}(?:\bA\+(?![\w-])|\bA-(?![\w-])|\bA\s+Plus\b|\bA\s+Minus\b)/iu,
  /(?:\bA\+(?![\w-])|\bA-(?![\w-])|\bA\s+Plus\b|\bA\s+Minus\b)[\s\S]{0,160}BBB/iu,
  /BBB[\s\S]{0,160}A&#43;/iu,
  /A&#43;[\s\S]{0,160}BBB/iu,
];
const unverifiedManufacturerCredentialPatterns = [
  /(?:CertainTeed|TAMKO)[\s\S]{0,100}\bcertif(?:ied|ication|ications)\b/iu,
  /\bcertif(?:ied|ication|ications)\b[\s\S]{0,100}(?:CertainTeed|TAMKO)/iu,
];

const internalArtifactDenylist = new Set([
  "Frame-AEO-Master-Play.html",
  "Frame-Innovation-Audit-2026-05-16.html",
  "Frame-Reddit-AEO-Playbook.html",
  "data/blog-published/roof-replacement-quote-checklist-utah-2026-skeleton-2026-05-09.html",
  "images/projects/DieselEye_GTM_BusinessPlan.html",
  "images/projects/DieselEye_Marketing_Funding_Sprint.html",
  "images/projects/DieselEye_NextLevel_Roadmap.html",
]);

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

function auditBbbTrustSurface(rel, text, { auditManufacturerCredentials = true } = {}) {
  if (text.includes(retiredBbbProfileFragment)) {
    fail(`${rel} contains retired BBB profile URL; use ${canonicalBbbProfile}`);
  }
  if (bbbGradePatterns.some((pattern) => pattern.test(text))) {
    fail(`${rel} publishes an unstable BBB letter-grade claim; publish accreditation only`);
  }
  if (
    auditManufacturerCredentials
    && unverifiedManufacturerCredentialPatterns.some((pattern) => pattern.test(text))
  ) {
    fail(`${rel} publishes an unregistered CertainTeed/TAMKO certification claim`);
  }
}

const deployed = walk(repoRoot).sort();

const homepage = fs.readFileSync(path.join(repoRoot, "index.html"), "utf8");
const today = new Date();
today.setUTCHours(23, 59, 59, 999);
for (const match of homepage.matchAll(/service-card-caption[^>]*>[\s\S]*?(\d{2})\/(\d{2})\/(\d{2})<\/span>/giu)) {
  const [, month, day, year] = match;
  const captionDate = new Date(Date.UTC(2000 + Number(year), Number(month) - 1, Number(day)));
  if (Number.isNaN(captionDate.getTime()) || captionDate > today) {
    fail(`index.html contains an invalid or future-dated project caption: ${month}/${day}/${year}`);
  }
}
if (!/aria-label="Mountain-Grade Roofing\. Valley-Wide\."/u.test(homepage)) {
  fail("index.html hero heading lacks its whitespace-safe accessible name");
}

const roofRepair = fs.readFileSync(path.join(repoRoot, "pages/roof-repair.html"), "utf8");
if (!/aria-label="Roof Repair Across Utah"/u.test(roofRepair)) {
  fail("pages/roof-repair.html heading lacks its whitespace-safe accessible name");
}

for (const rel of deployed) {
  if (internalArtifactDenylist.has(rel)) {
    fail(`${rel} is an internal, unfinished, or cross-client artifact in the public build`);
  }
}

for (const rel of deployed) {
  const text = fs.readFileSync(path.join(repoRoot, rel), "utf8");
  if (/frameroofingutah\.com/i.test(text)) {
    fail(`${rel} contains retired domain frameroofingutah.com`);
  }
  if (/(?:\+?1[-.\s]?)?\(?435\)?[-.\s]?302[-.\s]?4422/.test(text)) {
    fail(`${rel} contains legacy/internal phone (435) 302-4422`);
  }
  auditBbbTrustSurface(rel, text);
}

const activeBbbClaimSources = [
  "add-author-bio.py",
  "fix-unique-content.py",
  "scripts/blog-autobrief.py",
  "scripts/blog-draft-openrouter.py",
  "scripts/generate-blog-post.py",
];
for (const directory of ["data/blog-briefs", "data/blog-published"]) {
  const fullDirectory = path.join(repoRoot, directory);
  if (!fs.existsSync(fullDirectory)) continue;
  for (const entry of fs.readdirSync(fullDirectory, { withFileTypes: true })) {
    if (entry.isFile() && entry.name.endsWith(".json")) {
      activeBbbClaimSources.push(`${directory}/${entry.name}`);
    }
  }
}
for (const rel of activeBbbClaimSources) {
  const fullPath = path.join(repoRoot, rel);
  if (!fs.existsSync(fullPath)) continue;
  auditBbbTrustSurface(rel, fs.readFileSync(fullPath, "utf8"), {
    // Generator source contains the deny-list pattern itself. Generated JSON
    // briefs/posts are still checked as public claim sources below.
    auditManufacturerCredentials: rel !== "scripts/generate-blog-post.py",
  });
}

const businessIdentity = JSON.parse(
  fs.readFileSync(path.join(repoRoot, "data/route-factory/business.json"), "utf8"),
);
const canonicalProfiles = businessIdentity.entity_links?.sameAs ?? [];
if (!canonicalProfiles.includes(canonicalBbbProfile)) {
  fail("data/route-factory/business.json is missing the canonical BBB profile URL");
}
if (canonicalProfiles.some((profile) => profile.includes(retiredBbbProfileFragment))) {
  fail("data/route-factory/business.json still contains the retired BBB profile URL");
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
