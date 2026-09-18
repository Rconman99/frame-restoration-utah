import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import { buildGrowthOperations, renderGrowthOperations, runGrowthOperations } from "./seo-growth-operations.mjs";

const now = new Date("2026-09-18T05:00:00Z");
function fixture() {
  return { date: "2026-09-17", crawl: { fetched_at: "2026-09-17T13:00:00Z", issues: [] }, gsc: {
    available: true, siteUrl: "https://www.framerestorationutah.com/", window: { startDate: "2026-08-18", endDate: "2026-09-14" },
    top_pages: [{ page: "https://www.framerestorationutah.com/locations/salt-lake-city", clicks: 5, impressions: 12000, position: 24 }],
    top_queries: [{ query: "roof repair heber city ut", clicks: 0, impressions: 2000, position: 8 },
      { query: "roofing salt lake city", clicks: 1, impressions: 300, position: 10 },
      { query: "roofing midway ut", clicks: 0, impressions: 1900, position: 6 }],
  } };
}
test("SLC commercial priority does not fabricate revenue or page/query attribution", () => {
  const report = buildGrowthOperations({ snapshot: fixture(), now });
  assert.equal(report.state, "measurement_operational_outcomes_incomplete");
  assert.deepEqual(report.opportunities.map(row => row.region), ["slc", "heber", "hail-service-area"]);
  assert.equal(report.businessOutcomes.qualifiedLeads, null);
  assert.equal(report.businessOutcomes.collectedRevenue, null);
  assert.equal(report.pages[0].metrics.clicks, 5);
  assert.equal(report.pages[1].metrics, null);
  assert.equal(report.hailCampaign.state, "window_precedes_release");
  assert.equal(report.aiVisibility.namedCitationRate, null);
  assert.equal(report.publicMutationAuthorized, false);
  assert.match(renderGrowthOperations(report), /not measured/);
});
test("stale, future, failed, wrong-property and malformed GSC inputs never promote opportunities", () => {
  for (const mutate of [
    s => { s.crawl.fetched_at = "2026-09-10T00:00:00Z"; },
    s => { s.crawl.fetched_at = "2026-09-20T00:00:00Z"; },
    s => { s.gsc.available = false; },
    s => { s.gsc.siteUrl = "sc-domain:framerestoration.com"; },
    s => { s.gsc.window.endDate = "2026-09-01"; },
    s => { s.gsc.window.endDate = "2026-09-20"; },
    s => { s.gsc.window = {}; },
  ]) {
    const snapshot = fixture(); mutate(snapshot);
    const report = buildGrowthOperations({ snapshot, now });
    assert.equal(report.state, "evidence_blocked");
    assert.equal(report.opportunities.length, 0);
    assert.ok(report.pages.every(row => row.metrics === null));
  }
});
test("crawl regressions block optimization without deleting observed metrics", () => {
  const snapshot = fixture(); snapshot.crawl.issues.push({ severity: "error", type: "server-error", count: 1 });
  const report = buildGrowthOperations({ snapshot, now });
  assert.equal(report.state, "evidence_blocked");
  assert.ok(report.opportunities.every(row => row.state === "blocked_by_crawl_regression"));
  assert.equal(report.pages[0].metrics.clicks, 5);
});
test("experiment reviews require recorded deployment and settled evidence; expiry is not a verdict", () => {
  const experiments = [
    { id: "missing", measurement: { deployedAt: null, earliestEvaluationAt: "2026-09-01" } },
    { id: "mature", measurement: { deployedAt: "2026-08-10", earliestEvaluationAt: "2026-09-09", decision: "pending" } },
    { id: "wait", measurement: { deployedAt: "2026-09-01", earliestEvaluationAt: "2026-09-29" } },
  ];
  const report = buildGrowthOperations({ snapshot: fixture(), experiments, now });
  assert.deepEqual(report.experimentReviews.map(row => row.state), ["deployment_evidence_missing", "observation_review_due", "waiting_for_settled_window"]);
  assert.equal(report.experimentReviews[1].decision, "pending");
  assert.ok(report.experimentReviews.every(row => row.publicMutationAuthorized === false));
});
test("hail closeout stays due after rolling window moves beyond the campaign", () => {
  const snapshot = fixture(); snapshot.crawl.fetched_at = "2026-11-01T13:00:00Z";
  snapshot.gsc.window = { startDate: "2026-10-01", endDate: "2026-10-28" };
  const report = buildGrowthOperations({ snapshot, now: new Date("2026-11-01T14:00:00Z") });
  assert.equal(report.hailCampaign.state, "dedicated_readout_due");
  assert.match(report.hailCampaign.limitation, /Fetch Sep 18–Oct 15 explicitly/);
});
test("malformed metrics cannot become measured demand or fake zero", () => {
  const snapshot = fixture(); snapshot.gsc.top_pages[0].position = null;
  snapshot.gsc.top_queries.forEach(row => { row.impressions = -1; });
  const report = buildGrowthOperations({ snapshot, now });
  assert.equal(report.pages[0].metrics, null);
  assert.equal(report.opportunities.length, 0);
});
test("real repository inputs are hash-bound and existing daily job runs and commits the report", () => {
  const { report } = runGrowthOperations({ now, write: false });
  assert.ok(report.sources.length >= 4);
  assert.ok(report.sources.every(source => /^[a-f0-9]{64}$/.test(source.sha256)));
  const workflow = fs.readFileSync(new URL("../.github/workflows/seo-loop.yml", import.meta.url), "utf8");
  assert.match(workflow, /node scripts\/seo-growth-operations.mjs \| tee/);
  assert.match(workflow, /seo-growth-operations.test.mjs/);
  assert.match(workflow, /git add data\/seo\//);
  assert.equal((workflow.match(/cron:/g) || []).length, 1, "reuse existing schedule");
});
