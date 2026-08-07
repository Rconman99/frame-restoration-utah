import test from "node:test";
import assert from "node:assert/strict";
import { computeDiff, renderReadout, checkDeadman, expectedCtr } from "./seo-diff.mjs";

function snap(overrides = {}) {
  return {
    date: "2026-08-06",
    source: "frame-seo-loop",
    site: "https://www.framerestorationutah.com",
    crawl: { pages: 100, indexable_pages: 90, fetched_at: "2026-08-06T12:00:00Z", issues: [] },
    ranks: [],
    gsc: { available: false, clicks28d: 0, impressions28d: 0, top_queries: [], reason: "not_configured" },
    ai_visibility: { measured: false, prompts_ok: 0, cited: 0, competitors: {} },
    ...overrides,
  };
}

test("first snapshot: absolutes only, no delta against zero", () => {
  const diff = computeDiff(snap(), null);
  assert.equal(diff.first, true);
  const readout = renderReadout(diff);
  assert.match(readout, /First snapshot — no previous run to compare against/);
  assert.doesNotMatch(readout, /Regressions/);
});

test("null rank positions are not measured — never a regression", () => {
  const today = snap({ ranks: [{ keyword: "allen roof replacement", position: null, url: "" }] });
  const prev = snap({ date: "2026-08-05", ranks: [{ keyword: "allen roof replacement", position: null, url: "" }] });
  const diff = computeDiff(today, prev);
  assert.equal(diff.regressions.rankDrops.measured, false);
  assert.match(renderReadout(diff), /Rank movement: not measured — no rank tracker configured/);
});

test("a rank drop of >=3 with both positions measured is a regression", () => {
  const today = snap({ ranks: [{ keyword: "frisco roofer", position: 9, url: "/locations/frisco" }] });
  const prev = snap({ date: "2026-08-05", ranks: [{ keyword: "frisco roofer", position: 5, url: "/locations/frisco" }] });
  const diff = computeDiff(today, prev);
  assert.equal(diff.regressions.rankDrops.drops.length, 1);
  assert.equal(diff.regressions.rankDrops.drops[0].to, 9);
});

test("new error-severity issue URLs are flagged; unchanged ones are not", () => {
  const prev = snap({
    date: "2026-08-05",
    crawl: { pages: 100, issues: [{ type: "broken-internal-link", severity: "error", count: 1, urls: ["https://x.com/a"] }] },
  });
  const today = snap({
    crawl: { pages: 100, issues: [{ type: "broken-internal-link", severity: "error", count: 2, urls: ["https://x.com/a", "https://x.com/b"] }] },
  });
  const diff = computeDiff(today, prev);
  assert.equal(diff.regressions.newErrorIssues.length, 1);
  assert.deepEqual(diff.regressions.newErrorIssues[0].urls, ["https://x.com/b"]);
  const clean = computeDiff(prev, prev);
  assert.equal(clean.regressions.newErrorIssues.length, 0);
});

test("GSC week-over-week uses date-sorted per-date rows and flags a >=20% drop", () => {
  const by_date = [];
  for (let d = 1; d <= 14; d += 1) {
    // first week 100/day, second week 50/day -> 50% drop
    by_date.push({ date: `2026-07-${String(d).padStart(2, "0")}`, clicks: d <= 7 ? 100 : 50, impressions: 1000 });
  }
  // shuffle to prove the sort (GSC returns clicks-desc, not date order)
  by_date.reverse();
  const today = snap({ gsc: { available: true, clicks28d: 1050, impressions28d: 14000, top_queries: [], by_date } });
  const prev = snap({ date: "2026-08-05", gsc: { available: true, clicks28d: 1400, impressions28d: 14000, top_queries: [] } });
  const wow = computeDiff(today, prev).regressions.gscWoW;
  assert.equal(wow.measured, true);
  assert.equal(wow.prior, 700);
  assert.equal(wow.recent, 350);
  assert.equal(wow.dropped, true);
});

test("GSC unavailable -> WoW, quick wins and new queries all read not measured, never zero", () => {
  const diff = computeDiff(snap(), snap({ date: "2026-08-05" }));
  assert.equal(diff.regressions.gscWoW.measured, false);
  assert.equal(diff.quickWins.source, "not-measured");
  assert.equal(diff.newQueries.measured, false);
  const readout = renderReadout(diff);
  assert.match(readout, /GSC: not measured/);
  assert.doesNotMatch(readout, /GSC: 0 clicks/);
});

test("quick wins: GSC rows in the 4-15 band, sorted by impressions, with pages attached", () => {
  const today = snap({
    gsc: {
      available: true,
      clicks28d: 10,
      impressions28d: 500,
      top_queries: [
        { query: "allen roof replacement", clicks: 0, impressions: 49, position: 8.9 },
        { query: "plano roofer", clicks: 2, impressions: 200, position: 12.1 },
        { query: "frame restoration", clicks: 8, impressions: 90, position: 1.2 }, // outside band
      ],
      top_query_pages: { "plano roofer": "https://www.framerestorationutah.com/locations/plano" },
    },
  });
  const qw = computeDiff(today, snap({ date: "2026-08-05", gsc: { available: true, clicks28d: 9, impressions28d: 480, top_queries: [] } })).quickWins;
  assert.equal(qw.source, "gsc");
  assert.equal(qw.rows.length, 2);
  assert.equal(qw.rows[0].query, "plano roofer");
  assert.equal(qw.rows[0].page, "https://www.framerestorationutah.com/locations/plano");
});

test("experiment candidates: page-one low CTR with enough impressions, report-only shape", () => {
  const today = snap({
    gsc: {
      available: true,
      clicks28d: 2,
      impressions28d: 300,
      top_queries: [
        { query: "allen roof replacement", clicks: 0, impressions: 49, position: 8.9 }, // ctr 0 < 0.025 ✓
        { query: "tiny query", clicks: 0, impressions: 5, position: 9 }, // too few impressions
        { query: "healthy ctr", clicks: 10, impressions: 100, position: 8 }, // ctr 0.1 >= 0.025
      ],
      top_query_pages: {},
    },
  });
  const c = computeDiff(today, null).candidates;
  assert.equal(c.length, 1);
  assert.equal(c[0].query, "allen roof replacement");
  assert.equal(c[0].expectedCtr, 0.025);
});

test("expectedCtr buckets match the Allen experiment scale", () => {
  assert.equal(expectedCtr(4), 0.05);
  assert.equal(expectedCtr(8.9), 0.025);
  assert.equal(expectedCtr(14), 0.015);
});

test("deadman fires past the threshold and stays quiet inside it", () => {
  assert.equal(checkDeadman("2026-08-06", { date: "2026-08-05" }, 48), null);
  const fired = checkDeadman("2026-08-06", { date: "2026-08-01" }, 48);
  assert.equal(fired.previousDate, "2026-08-01");
  assert.ok(fired.gapHours > 48);
  const readout = renderReadout(computeDiff(snap(), snap({ date: "2026-08-01" })), { deadman: fired });
  assert.match(readout, /A scheduled run appears to have been missed/);
});
