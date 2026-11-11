import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
import {
  acceptRow,
  buildQueue,
  classifyTopic,
  isEditedWithinDays,
  normalizePageUrl,
} from "./close-to-page-one.mjs";
import { redactSecrets } from "../close-to-page-one.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, "../..");
const fixtureDir = path.join(root, "scripts/fixtures/close-to-page-one");
const fixture = JSON.parse(fs.readFileSync(path.join(fixtureDir, "rows.json"), "utf8"));
const pathMap = JSON.parse(fs.readFileSync(path.join(fixtureDir, "path-map.json"), "utf8"));
const editedAt = JSON.parse(fs.readFileSync(path.join(fixtureDir, "edited-at.json"), "utf8"));
const NOW = new Date("2026-11-11T00:00:00Z");

function queueFromFixture() {
  return buildQueue({
    rows: fixture.rows,
    window: fixture.window,
    siteUrl: fixture.siteUrl,
    truncated: fixture.truncated,
    now: NOW,
    pathForPage: (page) => pathMap[page] || null,
    editedAtByPath: (repoPath) => (Object.prototype.hasOwnProperty.call(editedAt, repoPath) ? editedAt[repoPath] : null),
  });
}

test("position band is inclusive at 5 and 15 and rejects the neighbours", () => {
  assert.equal(acceptRow({ query: "a", page: "https://www.framerestorationutah.com/locations/lehi", clicks: 0, impressions: 10, position: 5 }).ok, true);
  assert.equal(acceptRow({ query: "a", page: "https://www.framerestorationutah.com/locations/lehi", clicks: 0, impressions: 10, position: 15 }).ok, true);
  assert.equal(acceptRow({ query: "a", page: "https://www.framerestorationutah.com/locations/lehi", clicks: 0, impressions: 10, position: 4.9 }).bucket, "outsideBand");
  assert.equal(acceptRow({ query: "a", page: "https://www.framerestorationutah.com/locations/lehi", clicks: 0, impressions: 10, position: 15.1 }).bucket, "outsideBand");
});

test("incomplete and foreign-host rows are not treated as zero", () => {
  assert.equal(acceptRow({ query: "a", page: "https://www.framerestorationutah.com/x", clicks: 1, impressions: 5 }).bucket, "incomplete");
  assert.equal(acceptRow({ query: "a", page: "https://example.com/x", clicks: 1, impressions: 5, position: 8 }).bucket, "unmappedHost");
  assert.equal(normalizePageUrl("https://www.framerestorationutah.com/locations/heber-city/"), "https://www.framerestorationutah.com/locations/heber-city");
});

test("60-day git recency skips the inside and keeps the boundary", () => {
  assert.equal(isEditedWithinDays("2026-09-13T00:00:00Z", NOW, 60), true);
  assert.equal(isEditedWithinDays("2026-09-12T00:00:00Z", NOW, 60), false);
  assert.equal(isEditedWithinDays("not-a-date", NOW, 60), false);
  assert.equal(isEditedWithinDays("2026-11-12T00:00:00Z", NOW, 60), true);
});

test("fixture selects the top 3 eligible pages and skips recent or unmapped ones", () => {
  const report = queueFromFixture();
  assert.deepEqual(report.tasks.map((task) => task.repoPath), [
    "locations/heber-city.html",
    "locations/orem.html",
    "locations/draper.html",
  ]);
  assert.equal(report.tasks[0].qualifyingImpressions, 2372);
  assert.equal(report.tasks[0].qualifyingClicks, 1);
  assert.equal(report.tasks[0].status, "needs-review");
  assert.equal(report.tasks[0].draftable, false);
  assert.equal(report.autoPublish, false);
  assert.deepEqual(
    report.tasks[0].queries.map((row) => row.query),
    ["roof repair heber city ut", "roofing heber city ut"],
  );
  const reasons = Object.fromEntries(report.skippedPages.map((row) => [row.page, row.reason]));
  assert.equal(reasons["https://www.framerestorationutah.com/locations/sandy"], "edited-within-60-days");
  assert.equal(reasons["https://www.framerestorationutah.com/locations/provo"], "no-repo-file");
  assert.equal(report.tasks.some((task) => task.page.includes("provo") || task.page.includes("sandy")), false);
  assert.equal(report.rowCounts.rejected.outsideBand, 2);
  assert.equal(report.rowCounts.rejected.incomplete, 1);
  assert.equal(report.rowCounts.rejected.unmappedHost, 1);
  assert.equal(report.candidateTopics.length, 0);
  assert.equal(JSON.stringify(report).includes("estimatedVolume"), false);
});

test("a query that already ranks is a page refresh, not a new topic", () => {
  const report = queueFromFixture();
  const heber = report.cannibalization.find((item) => item.query === "roof repair heber city ut");
  assert.ok(heber);
  assert.equal(heber.newTopicBlocked, true);
  assert.equal(heber.improvePage, "https://www.framerestorationutah.com/locations/heber-city");
  assert.equal(heber.rankingPages.length, 2);
  const fresh = classifyTopic("utah metal roof versus asphalt", []);
  assert.equal(fresh.kind, "candidate-topic");
  assert.equal(fresh.newTopicBlocked, false);
  assert.equal(fresh.draftable, false);
  const ranked = classifyTopic("roof repair heber city ut", report.tasks.flatMap((task) => task.queries));
  assert.equal(ranked.kind, "page-refresh");
  assert.equal(ranked.newTopicBlocked, true);
});

test("CLI fixture mode writes no estimates and does not need credentials", () => {
  const result = spawnSync(process.execPath, [
    path.join(root, "scripts/close-to-page-one.mjs"),
    "--rows", path.join(fixtureDir, "rows.json"),
    "--path-map", path.join(fixtureDir, "path-map.json"),
    "--edited-at", path.join(fixtureDir, "edited-at.json"),
    "--now", "2026-11-11T00:00:00Z",
    "--no-write",
  ], {
    cwd: root,
    env: { ...process.env, GSC_SERVICE_ACCOUNT_JSON: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  const report = JSON.parse(result.stdout);
  assert.equal(report.tasks.length, 3);
  assert.match(result.stdout, /roof repair heber city ut/);
  assert.doesNotMatch(result.stdout, /private_key/);
});

test("missing Search Console credentials skip without failing", () => {
  const result = spawnSync(process.execPath, [path.join(root, "scripts/close-to-page-one.mjs"), "--no-write"], {
    cwd: root,
    env: { PATH: process.env.PATH, GSC_SERVICE_ACCOUNT_JSON: "" },
    encoding: "utf8",
  });
  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /GSC_SERVICE_ACCOUNT_JSON/);
  assert.match(result.stdout, /SKIP close-to-page-one/);
  assert.doesNotMatch(`${result.stdout}\n${result.stderr}`, /private_key|BEGIN /);
});

test("secret-shaped errors are redacted", () => {
  const begin = ["-----BEGIN ", "PRIVATE KEY-----"].join("");
  const end = ["-----END ", "PRIVATE KEY-----"].join("");
  const hidden = redactSecrets(`token failed {"private_key":"super-secret-value"} ${begin}\nabc\n${end}`);
  assert.equal(hidden.includes("super-secret-value"), false);
  assert.equal(hidden.includes("abc"), false);
});
