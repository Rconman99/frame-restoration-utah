import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import {
  assertUrlInSitemap,
  canonicalFromHtml,
  loadPublishedEntries,
  missingFromSitemap,
  newestPublishedBatch,
  normalizeLoc,
  parseAddedHtml,
  sitemapLocs,
} from "./check-published-sitemap.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const logPath = path.join(root, "scripts/fixtures/published-sitemap/added.log");

test("added-file log keeps the newest add and ignores non-pages", () => {
  const entries = parseAddedHtml(fs.readFileSync(logPath, "utf8"));
  const byFile = Object.fromEntries(entries.map((entry) => [entry.file, entry.addedAt]));
  assert.equal(byFile["locations/millcreek/water-damage.html"], "2026-10-04T17:42:46Z");
  assert.equal(byFile["blog/farmington/hail-roof-inspection-farmington.html"], "2026-09-18T22:22:36Z");
  assert.equal(byFile["blog/farmington/not-a-page.txt"], undefined);
});

test("newest indexable page must be in the sitemap, and a noindex page is not the newest", () => {
  const html = {
    "locations/millcreek/water-damage.html": '<link rel="canonical" href="https://www.framerestorationutah.com/locations/millcreek/water-damage">',
    "blog/farmington/hail-roof-inspection-farmington.html": '<meta name="robots" content="noindex"><link rel="canonical" href="https://www.framerestorationutah.com/blog/farmington/hail-roof-inspection-farmington">',
    "pages/licensed-roofer-wasatch-front.html": '<link rel="canonical" href="https://www.framerestorationutah.com/pages/licensed-roofer-wasatch-front" />',
  };
  const entries = loadPublishedEntries(fs.readFileSync(logPath, "utf8"), {
    readFile: (rel) => html[rel],
  });
  const batch = newestPublishedBatch(entries);
  assert.deepEqual(batch.map((entry) => entry.file), ["locations/millcreek/water-damage.html"]);
  const locs = sitemapLocs("<urlset><url><loc>https://www.framerestorationutah.com/pages/licensed-roofer-wasatch-front</loc></url></urlset>");
  const missing = missingFromSitemap(batch, locs);
  assert.equal(missing.length, 1);
  assert.equal(missing[0].canonical, "https://www.framerestorationutah.com/locations/millcreek/water-damage");
  assert.throws(
    () => assertUrlInSitemap("https://www.framerestorationutah.com/locations/millcreek/water-damage", "<urlset></urlset>"),
    /SITEMAP MISSING PUBLISHED PAGE/,
  );
});

test("canonical and trailing-slash locs match", () => {
  const html = '<link rel="canonical" href="https://www.framerestorationutah.com/blog/utah/example/" />';
  assert.equal(canonicalFromHtml(html), "https://www.framerestorationutah.com/blog/utah/example/");
  assert.equal(
    normalizeLoc("https://www.framerestorationutah.com/blog/utah/example/"),
    normalizeLoc("https://framerestorationutah.com/blog/utah/example"),
  );
  assertUrlInSitemap(
    "https://www.framerestorationutah.com/blog/utah/example/",
    "<urlset><url><loc>https://framerestorationutah.com/blog/utah/example</loc></url></urlset>",
  );
});

test("the live sitemap contains the newest published page when history is complete", () => {
  const shallow = fs.existsSync(path.join(root, ".git/shallow"))
    || spawnSync("git", ["rev-parse", "--is-shallow-repository"], { cwd: root, encoding: "utf8" }).stdout.trim() === "true";
  if (shallow) return;
  const result = spawnSync(process.execPath, [path.join(root, "scripts/check-published-sitemap.mjs")], {
    cwd: root,
    encoding: "utf8",
  });
  assert.equal(result.status, 0, `${result.stdout}\n${result.stderr}`);
  assert.match(result.stdout, /Sitemap contains the newest published page/);
});

test("--url fails loudly when the published page is absent", () => {
  const sitemap = path.join(root, "scripts/fixtures/published-sitemap/empty.xml");
  fs.mkdirSync(path.dirname(sitemap), { recursive: true });
  fs.writeFileSync(sitemap, "<?xml version=\"1.0\"?><urlset></urlset>\n");
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/check-published-sitemap.mjs"),
    "--url", "https://www.framerestorationutah.com/blog/example",
    "--sitemap", sitemap,
  ], { cwd: root, encoding: "utf8" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /SITEMAP MISSING PUBLISHED PAGE: https:\/\/www.framerestorationutah.com\/blog\/example/);
  fs.unlinkSync(sitemap);
});
