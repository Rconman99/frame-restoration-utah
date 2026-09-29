import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import test from "node:test";

const audit = fileURLToPath(new URL("./audit-static-assets.mjs", import.meta.url));
function run({ rules = "images/brand-source/\n", html = "", files = {} } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "frame-asset-audit-"));
  try {
    const fixtures = {
      ".vercelignore": rules,
      ".gitignore": "*\n", // Actual source Git rules must not influence deployment rules.
      "index.html": '<meta content="width=device-width, initial-scale=1.0">' + html,
      "sitemap.xml": "<urlset><url><loc>https://www.framerestorationutah.com/</loc></url></urlset>",
      "global.css": "", "global-critical.css": "",
      "images/brand-source/original.eps": "original design",
      "images/projects/heber-valley-drone-poster.webp": "optimized image",
      "scripts/generate-blog-post.py": "", "scripts/blog-cron.sh": "", "scripts/blog-publish.py": "",
      ...files,
    };
    for (const [name, content] of Object.entries(fixtures)) {
      if (content === null) continue;
      fs.mkdirSync(path.dirname(path.join(root, name)), { recursive: true });
      fs.writeFileSync(path.join(root, name), content);
    }
    return spawnSync(process.execPath, [audit], { cwd: root, encoding: "utf8" });
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
}

test("keeps optimized assets and explicit data-feed exceptions available", () => {
  const result = run({ rules: "images/brand-source/\ndata/*\n!data/feed.json\n",
    html: '<img src="/images/projects/heber-valley-drone-poster.webp"><script>fetch("/data/feed.json")</script>',
    files: { "data/feed.json": "{}" } });
  assert.equal(result.status, 0, result.stderr);
});
test("fails if original designs would return to deployments", () => {
  const result = run({ rules: "" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Original design source would be deployed/);
});
test("fails references to excluded EPS and PDF files, including globstar rules", () => {
  const result = run({ rules: "images/brand-source/\nprivate/**/*.pdf\n",
    html: '<a href="/images/brand-source/original.eps">Design</a><a href="/private/deep/report.pdf">Report</a>',
    files: { "private/deep/report.pdf": "report" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excluded from deployment: \/images\/brand-source\/original\.eps/);
  assert.match(result.stderr, /excluded from deployment: \/private\/deep\/report\.pdf/);
});
test("directory patterns also exclude nested directory assets", () => {
  const result = run({ rules: "images/brand-source/\ncache/\n",
    html: '<img src="/assets/cache/logo.png">', files: { "assets/cache/logo.png": "image" } });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /excluded from deployment: \/assets\/cache\/logo\.png/);
});
test("negating a file cannot reinclude it while its parent is excluded", () => {
  const result = run({ rules: "images/brand-source/\n!images/brand-source/original.eps\n" });
  assert.equal(result.status, 0, result.stderr);
});
test("a valid file exception that exposes a design is rejected", () => {
  const result = run({ rules: "images/brand-source/*\n!images/brand-source/original.eps\n" });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /Original design source would be deployed/);
});

test("an absent original-design folder and empty reference set are valid", () => {
  const result = run({ files: { "images/brand-source/original.eps": null } });
  assert.equal(result.status, 0, result.stderr);
});
test("ignore matching uses Linux case sensitivity on every platform", () => {
  const result = run({ rules: "images/brand-source/\nassets/private/\n",
    html: '<img src="/assets/Private/logo.png">', files: { "assets/Private/logo.png": "image" } });
  assert.equal(result.status, 0, result.stderr);
});
