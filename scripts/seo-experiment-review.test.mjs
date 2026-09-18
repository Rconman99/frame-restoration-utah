import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { evaluateHomepageTitleExperiment, firstFullGscDay } from "./evaluate-homepage-title-experiment.mjs";

const read = path => JSON.parse(fs.readFileSync(new URL(`../${path}`, import.meta.url)));
const experiment = read("data/seo-experiments/utah-homepage-commercial-title-2026-08-09.json");
const baselineSnapshot = read(experiment.baseline.sourceReceipt);
const crawlGuardBaselineSnapshot = read(experiment.measurement.crawlGuardBaselineReceipt);
const post = { file: "data/seo/snapshots/2026-09-09.json", snapshot: read("data/seo/snapshots/2026-09-09.json") };
const run = (candidateSnapshots = [post], options = {}) => evaluateHomepageTitleExperiment({
  experiment, baselineSnapshot, crawlGuardBaselineSnapshot, candidateSnapshots, now: "2026-09-18T05:20:00Z", ...options,
});

test("homepage review binds the original numbers to the actual baseline and full window", () => {
  const r = run();
  assert.equal(r.baseline.clicks, 9);
  assert.equal(r.baseline.impressions, 4429);
  assert.equal(r.postMeasurement.clicks, 8);
  assert.equal(r.postMeasurement.impressions, 3197);
  assert.deepEqual(r.requiredPostWindow, { start: "2026-08-10", end: "2026-09-06" });
  assert.equal(r.baseline.crawl.indexablePages, 148);
  assert.equal(r.verdict, "keep");
  assert.equal(r.checks.averagePositionImprovesByAtLeastTwo, false);
  assert.match(r.interpretation, /not causal/);
  assert.equal(r.publicMutationPerformed, false);
});
test("escaped baseline date mismatch fails instead of comparing unrelated measurements", () => {
  assert.throws(() => run([post], { baselineSnapshot: read("data/seo/snapshots/2026-08-09.json") }), /baseline start parity/);
});
test("missing, partial or future snapshots never decide an experiment", () => {
  assert.equal(run([]).verdict, "hold");
  const partial = structuredClone(post); partial.snapshot.gsc.window.startDate = "2026-08-11";
  assert.equal(run([partial]).verdict, "hold");
  const future = structuredClone(post); future.snapshot.date = "2026-10-01";
  assert.equal(run([future]).verdict, "hold");
  assert.equal(run([post], { now: "2026-09-07T00:00:00Z" }).status, "AWAITING_CALENDAR_GATE");
});
test("GSC full-day boundary is Pacific in both daylight and standard time", () => {
  assert.equal(firstFullGscDay("2026-08-10T06:13:14Z"), "2026-08-10");
  assert.equal(firstFullGscDay("2026-08-10T07:13:14Z"), "2026-08-11");
  assert.equal(firstFullGscDay("2026-01-10T07:13:14Z"), "2026-01-10");
  assert.equal(firstFullGscDay("2026-01-10T08:13:14Z"), "2026-01-11");
});
test("a post-release crawl cannot masquerade as pre-release guard evidence", () => {
  assert.throws(() => run([post], { crawlGuardBaselineSnapshot: read("data/seo/snapshots/2026-08-10.json") }), /must precede deployment/);
});
test("missing deployment evidence and malformed metrics fail closed", () => {
  const missing = structuredClone(experiment); missing.measurement.deployedAt = null;
  assert.throws(() => run([post], { experiment: missing }), /deployment date/);
  const bad = structuredClone(post); bad.snapshot.gsc.top_pages.find(p => p.page === experiment.page).position = null;
  assert.throws(() => run([bad]), /metrics must be valid/);
});
test("small samples hold and crawl regressions cannot receive keep", () => {
  const low = structuredClone(post); low.snapshot.gsc.top_pages.find(p => p.page === experiment.page).impressions = 900;
  assert.equal(run([low]).verdict, "hold");
  const broken = structuredClone(post); broken.snapshot.crawl.issues.push({ severity: "error", urls: ["https://www.framerestorationutah.com/broken"] });
  assert.equal(run([broken]).verdict, "revert");
});
