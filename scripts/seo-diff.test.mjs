import test from "node:test";
import assert from "node:assert/strict";
import { computeDiff, renderReadout, checkDeadman, expectedCtr, silentPages, queryCoverageCaveat, rankPanelLines, displacementLines, slvGscLines } from "./seo-diff.mjs";

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

test("an exact rank falling outside measured depth is an honest bounded regression", () => {
  const today = snap({ ranks: [{ keyword: "roof repair salt lake city", position: null, measured: true, outsideTop: 30, url: "" }] });
  const prev = snap({ date: "2026-08-05", ranks: [{ keyword: "roof repair salt lake city", position: 25, measured: true, outsideTop: null, url: "/locations/salt-lake-city" }] });
  const drops = computeDiff(today, prev).regressions.rankDrops.drops;
  assert.equal(drops.length, 1);
  assert.equal(drops[0].from, 25);
  assert.equal(drops[0].to, ">30");
});

test("two measured >depth observations never become an invented exact drop", () => {
  const today = snap({ ranks: [{ keyword: "roofer draper", position: null, measured: true, outsideTop: 30, url: "" }] });
  const prev = snap({ date: "2026-08-05", ranks: [{ keyword: "roofer draper", position: null, measured: true, outsideTop: 30, url: "" }] });
  const rankState = computeDiff(today, prev).regressions.rankDrops;
  assert.equal(rankState.measured, true);
  assert.equal(rankState.drops.length, 0);
});

test("a missing current panel never reports zero rank drops from yesterday's data", () => {
  const today = snap({ ranks: [], rank_measurement: { available: false, reason: "incomplete_panel", issues: ["panel-1: latest_report_unreadable"] } });
  const prev = snap({ date: "2026-08-05", ranks: [{ keyword: "roofer sandy", position: 11, measured: true, url: "/locations/sandy" }] });
  const diff = computeDiff(today, prev);
  assert.equal(diff.regressions.rankDrops.measured, false);
  assert.equal(diff.regressions.rankDrops.reason, "incomplete_panel");
  const output = renderReadout(diff);
  assert.match(output, /Rank movement: not measured — current rank panel unavailable \(incomplete_panel\)/);
  assert.doesNotMatch(output, /Rank drops: none/);
  assert.match(output, /latest_report_unreadable/);
});

test("fixed panel readout groups cities and reports #1 coverage without converting >depth to a rank", () => {
  const lines = rankPanelLines(snap({
    date: "2026-08-12",
    rank_measurement: {
      queriesExpected: 4,
      queriesMeasured: 4,
      newestObservedAt: "2026-08-12T05:40:51.327Z",
      issues: [],
    },
    ranks: [
      { city: "Millcreek", keyword: "contractor", position: 4, measured: true, mapPackRank: null, aiOverviewPresent: false, aiOverviewCited: false },
      { city: "Millcreek", keyword: "repair", position: 1, measured: true, mapPackRank: 1, aiOverviewPresent: true, aiOverviewCited: true },
      { city: "Draper", keyword: "contractor", position: null, measured: true, outsideTop: 30, mapPackRank: null, aiOverviewPresent: false, aiOverviewCited: false },
      { city: "Draper", keyword: "repair", position: null, measured: true, outsideTop: 30, mapPackRank: null, aiOverviewPresent: false, aiOverviewCited: false },
    ],
  }));
  const output = lines.join("\n");
  assert.match(output, /Millcreek: organic `4 \/ 1`/);
  assert.match(output, /Draper: organic `>30 \/ >30`/);
  assert.match(output, /organic #1 `1\/4`; exact-CID maps #1 `1\/4`/);
});

test("fixed panel readout exposes a stale weekly measurement", () => {
  const output = rankPanelLines(snap({
    date: "2026-08-21",
    rank_measurement: { queriesExpected: 1, queriesMeasured: 1, newestObservedAt: "2026-08-12T05:40:51.327Z", issues: [] },
    ranks: [{ city: "Millcreek", keyword: "contractor", position: 4, measured: true, mapPackRank: null, aiOverviewPresent: false, aiOverviewCited: false }],
  })).join("\n");
  assert.match(output, /STALE 9d/);
});

test("fixed panel readout renders measured organic, maps, and AIO displacement evidence", () => {
  const output = displacementLines(snap({
    ranks: [{
      city: "Millcreek",
      keyword: "roofing contractor millcreek",
      position: 4,
      measured: true,
      mapPackPresent: true,
      aiOverviewPresent: true,
      organicLeaders: [{ rank: 1, domain: "leader.example", isTarget: false }],
      mapPackLeaders: [{ rank: 1, name: "Map Leader", cid: "123", isTarget: false }],
      paidMapPackLeaders: [{ rank: 1, name: "Paid Leader", cid: "456", isTarget: false }],
      aiOverviewSources: [{ domain: "source.example", isTarget: false }],
    }],
  })).join("\n");
  assert.match(output, /organic #1 leader\.example/);
  assert.match(output, /organic maps #1 Map Leader \[CID 123\]/);
  assert.match(output, /paid local \(excluded\) #1 Paid Leader \[CID 456\]/);
  assert.match(output, /AIO source\.example/);
  assert.match(output, /do not copy competitor content/);
});

test("older rank artifacts omit the displacement section instead of inventing unknown leaders", () => {
  assert.deepEqual(displacementLines(snap({
    ranks: [{ city: "Millcreek", keyword: "roofer millcreek", position: 5, measured: true }],
  })), []);
});

test("SLV GSC demand joins exact city pages, strongest children, and retained roofing queries", () => {
  const output = slvGscLines(snap({
    ranks: [
      { city: "Salt Lake City", keyword: "roof repair salt lake city", position: 25, measured: true },
      { city: "Sandy", keyword: "roof repair sandy", position: 14, measured: true },
    ],
    gsc: {
      available: true,
      clicks28d: 1,
      impressions28d: 10000,
      truncated: true,
      queries_seen: 100,
      queries_stored: 4,
      queries_stored_impressions: 2500,
      top_pages: [
        { page: "https://www.framerestorationutah.com/locations/sandy/", clicks: 0, impressions: 3521, position: 23.6 },
        { page: "https://www.framerestorationutah.com/locations/sandy/storm-damage", clicks: 1, impressions: 900, position: 8.5 },
      ],
      top_queries: [
        { query: "roof repair sandy ut", clicks: 0, impressions: 1041, position: 19.4 },
        { query: "roofing sandy ut", clicks: 0, impressions: 908, position: 24.7 },
        { query: "smoke damage restoration sandy ut", clicks: 0, impressions: 500, position: 30 },
        { query: "best roofing companies in salt lake city", clicks: 0, impressions: 5, position: 47.2 },
      ],
    },
  })).join("\n");
  assert.match(output, /Salt Lake City: main page not retained/);
  assert.match(output, /retained roofing-query floor 5 impr \/ 0 clicks across 1 row/);
  assert.match(output, /Sandy: main page 3521 impr \/ 0 clicks \/ avg pos 23\.6/);
  assert.match(output, /strongest child \/locations\/sandy\/storm-damage at 900 impr/);
  assert.match(output, /retained roofing-query floor 1949 impr \/ 0 clicks across 2 rows/);
  assert.doesNotMatch(output, /2449 impr/, "non-roof smoke-restoration demand must not be counted");
  assert.match(output, /Coverage caveat: showing 4 of 100 queries \(25\.0% of impressions\)/);
});

test("SLV GSC demand says not measured instead of zero when GSC is unavailable", () => {
  const output = slvGscLines(snap({ ranks: [{ city: "Millcreek" }] })).join("\n");
  assert.match(output, /Not measured \(not_configured\)/);
  assert.doesNotMatch(output, /0 impr/);
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

test("a page under a running experiment is suppressed, not recommended again", () => {
  // The real 2026-08-07 case: the loop recommended rewriting /locations/allen
  // while an experiment deployed 2026-07-26 was still running on that exact
  // page. Acting on it would have destroyed the measurement mid-window.
  const today = snap({
    gsc: {
      available: true,
      clicks28d: 0,
      impressions28d: 100,
      top_queries: [
        { query: "allen roof replacement", clicks: 0, impressions: 49, position: 8.9 },
        { query: "colleyville roof replacement", clicks: 0, impressions: 42, position: 14.1 },
      ],
      top_query_pages: {
        "allen roof replacement": "https://www.framerestorationutah.com/locations/allen",
        "colleyville roof replacement": "https://www.framerestorationutah.com/locations/colleyville",
      },
    },
  });
  const experiments = [{
    id: "texas-allen-roof-replacement-ctr-2026-07-26",
    query: "allen roof replacement",
    page: "https://www.framerestorationutah.com/locations/allen",
    earliestEvaluationAt: "2026-08-24T00:00:00.000Z",
  }];
  const d = computeDiff(today, null, { experiments });

  assert.equal(d.candidates.length, 1, "only the un-experimented page is actionable");
  assert.equal(d.candidates[0].query, "colleyville roof replacement");
  assert.equal(d.candidatesSuppressed.length, 1, "the held-back one is reported, never dropped");
  assert.equal(d.candidatesSuppressed[0].experimentId, "texas-allen-roof-replacement-ctr-2026-07-26");

  // The readout must SAY it withheld something — a silently shortened list
  // reads as "nothing else qualified", which is a different and false claim.
  const out = renderReadout(d, { now: new Date("2026-08-07T12:00:00Z") });
  assert.match(out, /already under a running experiment/i);
  assert.match(out, /texas-allen-roof-replacement-ctr-2026-07-26/);
  assert.match(out, /2026-08-24/);
});

test("a sibling query on an experimented page is suppressed too", () => {
  // An experiment rewrites the page title/description, which moves every query
  // that page ranks for — so a different query on the same page is equally
  // contaminated, even though the experiment names only one query.
  const today = snap({
    gsc: {
      available: true,
      clicks28d: 0,
      impressions28d: 60,
      top_queries: [{ query: "roof replacement allen tx", clicks: 0, impressions: 40, position: 7 }],
      top_query_pages: { "roof replacement allen tx": "https://www.framerestorationutah.com/locations/allen/" },
    },
  });
  const d = computeDiff(today, null, {
    experiments: [{ id: "exp-allen", query: "allen roof replacement", page: "https://www.framerestorationutah.com/locations/allen" }],
  });
  assert.equal(d.candidates.length, 0, "matched on page despite a different query and trailing slash");
  assert.equal(d.candidatesSuppressed.length, 1);
});

test("no experiments loaded -> behaviour is unchanged", () => {
  const today = snap({
    gsc: {
      available: true,
      clicks28d: 0,
      impressions28d: 50,
      top_queries: [{ query: "allen roof replacement", clicks: 0, impressions: 49, position: 8.9 }],
      top_query_pages: {},
    },
  });
  const d = computeDiff(today, null);
  assert.equal(d.candidates.length, 1);
  assert.equal(d.candidatesSuppressed.length, 0);
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

test("silent pages: impressions with zero clicks, impressions-desc, capped with the remainder named", () => {
  const top_pages = [{ page: "https://x/a", clicks: 0, impressions: 223, position: 42.1 }];
  for (let i = 0; i < 12; i += 1) top_pages.push({ page: `https://x/p${i}`, clicks: 0, impressions: 60 + i, position: 30 });
  top_pages.push({ page: "https://x/converting", clicks: 9, impressions: 900, position: 3 }); // has clicks -> excluded
  top_pages.push({ page: "https://x/tiny", clicks: 0, impressions: 4, position: 80 }); // under threshold -> excluded
  const d = computeDiff(snap({ gsc: { available: true, clicks28d: 9, impressions28d: 2000, top_queries: [], top_pages } }), null);
  assert.equal(d.silentPages.measured, true);
  assert.equal(d.silentPages.total, 13);
  assert.equal(d.silentPages.rows.length, 10);
  assert.equal(d.silentPages.rows[0].page, "https://x/a"); // sorted before the cap, not after
  assert.ok(!d.silentPages.rows.some((r) => r.page === "https://x/converting"));
  const out = renderReadout(d);
  assert.match(out, /223 impr, 0 clicks, avg position 42\.1/);
  assert.match(out, /and 3 more \(list capped at 10\)/);
});

test("silent pages: an older snapshot with no page dimension is NOT MEASURED, never zero", () => {
  const d = computeDiff(snap({ gsc: { available: true, clicks28d: 5, impressions28d: 99, top_queries: [] } }), null);
  assert.equal(d.silentPages.measured, false);
  assert.equal(d.silentPages.rows.length, 0);
  const out = renderReadout(d);
  assert.match(out, /Not measured — page dimension not in this snapshot/);
  assert.doesNotMatch(out, /zero clicks \(≥50 impr\)\n- None\./);
});

test("silent pages: measured but genuinely empty says None, not not-measured", () => {
  const d = computeDiff(snap({ gsc: { available: true, clicks28d: 5, impressions28d: 99, top_queries: [], top_pages: [] } }), null);
  assert.equal(d.silentPages.measured, true);
  assert.match(renderReadout(d), /zero clicks[^\n]*\n- None\./);
});

test("truncation caveat counts storage drops, not just the fetch limit", () => {
  // 400 fetched, 200 stored: the old `queryRows.length >= 1000` test called this
  // untruncated and the readout claimed full coverage over half the data.
  assert.equal(
    queryCoverageCaveat({ truncated: true, queries_seen: 400, queries_stored: 200 }),
    "showing 200 of 400 queries — arrivals outside that set are not visible",
  );
  // Fetch maxed out (rowLimit 5000): the true total is unknown, so the count is a floor.
  assert.match(queryCoverageCaveat({ truncated: true, queries_seen: 5000, queries_stored: 400 }), /of at least 5000 queries/);
  // A fetch that did NOT max out reports the exact total, with no "at least".
  assert.doesNotMatch(queryCoverageCaveat({ truncated: true, queries_seen: 1000, queries_stored: 200 }), /at least/);
  // Older snapshot with no counts still gets the plain sentence.
  assert.equal(queryCoverageCaveat({ truncated: true }), "arrivals outside the stored query set are not visible");
  assert.equal(queryCoverageCaveat({ truncated: false }), null);
});

test("coverage caveat states impression share, and rides the GSC totals line", () => {
  const msg = queryCoverageCaveat({ truncated: true, queries_seen: 5000, queries_stored: 400, queries_stored_impressions: 2107, impressions28d: 85434 });
  assert.equal(msg, "showing 400 of at least 5000 queries (2.5% of impressions) — arrivals outside that set are not visible");
  // Absent counts (older snapshot) must not fabricate a percentage.
  assert.doesNotMatch(queryCoverageCaveat({ truncated: true }), /%/);
  // It must appear on a FIRST snapshot too, where the new-queries section cannot render.
  const out = renderReadout(computeDiff(snap({
    gsc: { available: true, clicks28d: 73, impressions28d: 85434, top_queries: [], top_pages: [], truncated: true, queries_seen: 5000, queries_stored: 400, queries_stored_impressions: 2107 },
  }), null));
  assert.match(out, /Query coverage: showing 400 of at least 5000 queries \(2\.5% of impressions\)/);
});
