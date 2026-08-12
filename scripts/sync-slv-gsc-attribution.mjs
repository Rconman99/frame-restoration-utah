#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { trackedQueryFilter } from "./lib/gsc.mjs";
import { cityAttributionState, normalizeSiteUrl, summarizeQueryAttribution } from "./lib/slv-gsc-attribution.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-GSC-URL-ATTRIBUTION-LATEST.json";
const sourceFiles = {
  portfolio: "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json",
  coreRegistry: "data/rank-tracker/panels.json",
  expansionRegistry: "data/rank-tracker/expansion-panels.json",
};
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");

function latestMeasuredGscSnapshot() {
  const directory = path.join(root, "data/seo/snapshots");
  const candidates = fs.readdirSync(directory)
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .reverse();
  const latestSnapshotPath = candidates[0] ? `data/seo/snapshots/${candidates[0]}` : null;
  for (const file of candidates) {
    const source = `data/seo/snapshots/${file}`;
    const snapshot = read(source);
    if (snapshot.gsc?.available === true && snapshot.gsc?.tracked_query_pages) return { source, snapshot, latestSnapshotPath };
  }
  throw new Error("no measured GSC snapshot with targeted query-page evidence");
}

function pageCanonical(file) {
  const html = fs.readFileSync(path.join(root, file), "utf8");
  return html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1]
    || html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1]
    || null;
}

const portfolio = read(sourceFiles.portfolio);
const registries = [read(sourceFiles.coreRegistry), read(sourceFiles.expansionRegistry)];
const panels = new Map(registries.flatMap((registry) => registry.panels).map((panel) => [panel.id, panel]));
const { source: snapshotPath, snapshot, latestSnapshotPath } = latestMeasuredGscSnapshot();
const tracked = snapshot.gsc.tracked_query_pages;
const requested = new Set((tracked.requested || []).map((query) => String(query).trim().toLowerCase()));
const allRows = tracked.rows || [];

const cities = portfolio.cityGoals.map((goal) => {
  const panel = panels.get(goal.panelId);
  assert.ok(panel, `missing panel registry entry: ${goal.panelId}`);
  const config = read(panel.configPath);
  assert.equal(config.panelId, goal.panelId);
  assert.equal(config.city, goal.city);
  assert.equal(config.keywords.length, 4, `fixed query count mismatch: ${goal.city}`);
  const canonical = pageCanonical(goal.page);
  assert.ok(canonical, `missing canonical: ${goal.page}`);
  assert.equal(normalizeSiteUrl(canonical), normalizeSiteUrl(`https://www.framerestorationutah.com/${goal.page.replace(/\.html$/, "")}`), `unexpected intended canonical: ${goal.city}`);

  const queries = config.keywords.map(({ id, keyword }) => {
    const normalizedKeyword = keyword.toLowerCase();
    const queryRows = allRows.filter((row) => String(row.query).trim().toLowerCase() === normalizedKeyword);
    return {
      queryId: id,
      ...summarizeQueryAttribution({
        keyword,
        intendedCanonical: canonical,
        requested: requested.has(normalizedKeyword),
        rows: queryRows,
      }),
    };
  });
  const state = cityAttributionState(queries);
  const requestedCount = queries.filter((query) => query.requested).length;
  const returnedQueryCount = queries.filter((query) => query.rows.length > 0).length;
  const alternateNormalizedUrls = [...new Set(queries.flatMap((query) => query.rows.filter((row) => !row.intended).map((row) => row.normalizedUrl)))].sort();
  const protectedOrganicNumberOne = goal.current.organicRanks
    .map((rank, index) => rank === 1 ? config.keywords[index].keyword : null)
    .filter(Boolean);
  const protectedAioCitations = goal.current.googleAiOverview.ownedCitations
    ? config.keywords.filter((_, index) => {
        const report = read(goal.rankSource);
        return report.results[index]?.aiOverviewCited;
      }).map((query) => query.keyword)
    : [];

  let nextEvidenceAction = "Preserve the intended city hub and all related routes; use the next complete targeted GSC read before selecting an architecture or intent experiment.";
  if (state === "url-competition-requires-diagnosis") {
    nextEvidenceAction = "Inspect the alternate URLs against redirect dates, canonicals, current live routing, and query intent. Treat this blended 28-day evidence as a diagnosis trigger, not proof of current cannibalization or permission to redirect.";
  } else if (goal.city === "Salt Lake City") {
    nextEvidenceAction = "Keep the Salt Lake City page frozen under its active experiment until the 2026-09-09 evaluation gate; continue weekly fixed panels and targeted GSC reads.";
  } else if (protectedOrganicNumberOne.length || protectedAioCitations.length) {
    nextEvidenceAction = "Protect the measured #1/AIO foothold. Do not change title, H1, canonical, route, or internal-link intent until exact owner approval and a declared isolated experiment exist.";
  }

  return {
    priority: goal.priority,
    city: goal.city,
    slug: goal.slug,
    cohort: goal.cohort,
    panelId: goal.panelId,
    page: goal.page,
    intendedCanonical: canonical,
    intendedPageSha256: sha256(goal.page),
    state,
    coverage: {
      fixedQueries: queries.length,
      requestedQueries: requestedCount,
      returnedQueries: returnedQueryCount,
      exactRows: queries.reduce((sum, query) => sum + query.rows.length, 0),
    },
    protectedFootholds: {
      organicNumberOneQueries: protectedOrganicNumberOne,
      googleAiOverviewCitedQueries: protectedAioCitations,
    },
    alternateNormalizedUrls,
    nextEvidenceAction,
    queries,
  };
});

const countQueries = (predicate) => cities.flatMap((city) => city.queries).filter(predicate).length;
const workflowFilter = trackedQueryFilter(cities.flatMap((city) => city.queries.map((query) => query.keyword)));
assert.ok(workflowFilter, "missing 72-query GSC workflow filter");
assert.equal(workflowFilter.requested.length, 72, "daily GSC workflow must target all 72 fixed queries");
const artifact = {
  schemaVersion: 1,
  ledgerId: "frame-utah-slv-18-city-gsc-url-attribution-v1",
  market: "utah-salt-lake-valley",
  asOfSnapshotDate: snapshot.date,
  latestSeoSnapshotDate: latestSnapshotPath ? path.basename(latestSnapshotPath, ".json") : null,
  measurementFreshness: latestSnapshotPath === snapshotPath ? "latest-snapshot-measured" : "last-measured-snapshot-retained",
  status: requested.size === 72 ? "complete-targeted-request-evidence" : "partial-targeted-request-evidence",
  publicMutationPerformed: false,
  evidenceWindow: snapshot.gsc.window,
  measurementContract: {
    workflowTargetQueries: workflowFilter.requested.length,
    workflowFilterBytes: Buffer.byteLength(workflowFilter.dimensionFilterGroups[0].filters[0].expression, "utf8"),
    workflowFilterLimitBytes: 4096,
    currentSnapshotRequestedQueries: requested.size,
    rule: "The daily SEO snapshot builds this exact filter from the complete six-city core registry plus the twelve-city manual expansion registry; this read does not buy additional SERPs or admit expansion cities to recurring DataForSEO spend.",
  },
  sources: {
    ...Object.fromEntries(Object.entries(sourceFiles).map(([key, file]) => [key, { file, sha256: sha256(file) }])),
    gscSnapshot: { file: snapshotPath, sha256: sha256(snapshotPath) },
    latestSeoSnapshot: latestSnapshotPath ? { file: latestSnapshotPath, sha256: sha256(latestSnapshotPath) } : null,
  },
  policy: {
    missingRow: "An unrequested or unreturned GSC row is unmeasured/withheld evidence, never zero demand or proof that no Frame URL ranks.",
    blendedWindow: "Search Console query-to-page rows cover a rolling 28-day window and can retain historical URLs after a redirect or canonical correction.",
    multiUrl: "Multiple normalized URLs are a diagnosis trigger, not automatic proof of current cannibalization and not permission to redirect, noindex, delete, or change a canonical.",
    parameterNormalization: "Query strings, fragments, www, .html, and trailing slash variants are normalized before classifying distinct Frame URLs.",
  },
  summary: {
    cities: cities.length,
    fixedQueries: cities.reduce((sum, city) => sum + city.coverage.fixedQueries, 0),
    requestedQueries: countQueries((query) => query.requested),
    queriesWithRows: countQueries((query) => query.rows.length > 0),
    exactRows: cities.reduce((sum, city) => sum + city.coverage.exactRows, 0),
    intendedUrlOnlyQueries: countQueries((query) => query.state === "intended-url-only"),
    multiUrlIncludingIntendedQueries: countQueries((query) => query.state === "multi-url-including-intended"),
    alternateUrlOnlyQueries: countQueries((query) => query.state === "alternate-url-only"),
    requestedNoRowQueries: countQueries((query) => query.state === "requested-no-row-returned"),
    unrequestedQueries: countQueries((query) => query.state === "unmeasured-not-requested"),
    citiesWithUrlCompetitionEvidence: cities.filter((city) => city.state === "url-competition-requires-diagnosis").length,
    citiesWithAllFourQueriesRequested: cities.filter((city) => city.coverage.requestedQueries === 4).length,
    publicMutations: 0,
  },
  actionQueue: cities
    .map((city) => ({
      priority: city.city === "Salt Lake City"
        ? 0
        : city.state === "url-competition-requires-diagnosis"
          ? 1
          : city.protectedFootholds.organicNumberOneQueries.length || city.protectedFootholds.googleAiOverviewCitedQueries.length
            ? 2
            : city.state === "targeted-gsc-not-complete"
              ? 3
              : city.state === "complete-request-with-unreturned-rows"
                ? 4
                : 5,
      city: city.city,
      state: city.state,
      protectedFootholds: city.protectedFootholds,
      action: city.nextEvidenceAction,
    }))
    .sort((a, b) => a.priority - b.priority || a.city.localeCompare(b.city)),
  prohibited: [
    "No public page, GBP, review, directory, service-area, indexing, outreach, DNS, ad, or owner-message mutation from this ledger.",
    "No query is assigned zero impressions or an exact position when GSC does not return a row.",
    "No multi-URL row alone authorizes a redirect, canonical, noindex, deletion, title, H1, or internal-link change.",
  ],
  cities,
};

assert.equal(artifact.summary.cities, 18);
assert.equal(artifact.summary.fixedQueries, 72);
assert.equal(artifact.summary.requestedQueries + artifact.summary.unrequestedQueries, 72);
assert.equal(artifact.summary.queriesWithRows + artifact.summary.requestedNoRowQueries + artifact.summary.unrequestedQueries, 72);
assert.equal(artifact.summary.exactRows, allRows.length);
assert.equal(new Set(cities.map((city) => city.city)).size, 18);
assert.equal(artifact.actionQueue.length, 18);
assert.ok(artifact.measurementContract.workflowFilterBytes <= artifact.measurementContract.workflowFilterLimitBytes);
assert.ok(cities.every((city) => city.queries.length === 4));
assert.ok(cities.every((city) => city.queries.every((query) => !query.requested || requested.has(query.keyword.toLowerCase()))));
assert.ok(artifact.prohibited.some((rule) => rule.includes("No public page")));

const nextText = `${JSON.stringify(artifact, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV GSC attribution: ${artifact.summary.requestedQueries}/72 queries requested, ${artifact.summary.queriesWithRows} returned, ${artifact.summary.citiesWithUrlCompetitionEvidence} cities need URL diagnosis`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV GSC attribution is stale; run npm run sync:slv-gsc-attribution");
  console.log(`PASS SLV GSC attribution: ${artifact.summary.requestedQueries}/72 requested, ${artifact.summary.queriesWithRows} returned, no missing row converted to zero`);
}
