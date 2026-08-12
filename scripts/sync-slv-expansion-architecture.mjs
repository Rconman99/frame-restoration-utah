#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-EXPANSION-ARCHITECTURE-2026-08-12.json";
const sourcePaths = {
  registry: "data/rank-tracker/expansion-panels.json",
  priority: "data/rank-tracker/SLV-EXPANSION-PRIORITY-2026-08-12.json",
  integrity: "data/authority/SLV-EXPANSION-INTEGRITY-AUDIT-2026-08-12.json",
  gscSnapshot: "data/seo/snapshots/2026-08-12.json",
  displacement: "data/rank-tracker/SLV-COMPETITOR-DISPLACEMENT-2026-08-12.json",
};
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const stripTags = (value) => String(value).replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
const registry = read(sourcePaths.registry);
const priority = read(sourcePaths.priority);
const integrity = read(sourcePaths.integrity);
const snapshot = read(sourcePaths.gscSnapshot);
const displacement = read(sourcePaths.displacement);

function walkHtml(dir, output = []) {
  for (const entry of fs.readdirSync(path.join(root, dir), { withFileTypes: true })) {
    const relative = path.posix.join(dir, entry.name);
    if (entry.isDirectory()) walkHtml(relative, output);
    else if (entry.name.endsWith(".html")) output.push(relative);
  }
  return output;
}

const allHtml = [...walkHtml("locations"), ...walkHtml("blog")].sort();
const allHtmlBodies = new Map(allHtml.map((file) => [file, fs.readFileSync(path.join(root, file), "utf8")]));
const canonicalOrigin = "https://www.framerestorationutah.com";
const normalizePath = (href) => {
  try {
    const url = new URL(href, canonicalOrigin);
    if (url.origin !== canonicalOrigin) return null;
    return url.pathname.replace(/\.html$/, "").replace(/\/$/, "") || "/";
  } catch {
    return null;
  }
};
const inboundLinks = (targetPath) => {
  let count = 0;
  for (const html of allHtmlBodies.values()) {
    for (const match of html.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>/gi)) {
      if (normalizePath(match[1]) === targetPath) count += 1;
    }
  }
  return count;
};
const pageSignals = (file) => {
  const html = allHtmlBodies.get(file);
  assert.ok(html, `missing HTML route: ${file}`);
  const canonical =
    html.match(/<link\b[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)/i)?.[1] ||
    html.match(/<link\b[^>]*href=["']([^"']+)["'][^>]*rel=["']canonical["']/i)?.[1] ||
    null;
  return {
    file,
    sha256: sha256(file),
    title: html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() || null,
    h1: stripTags(html.match(/<h1[^>]*>([\s\S]*?)<\/h1>/i)?.[1] || ""),
    canonical,
    inboundInternalLinks: canonical ? inboundLinks(normalizePath(canonical)) : 0,
  };
};
const routeRole = (file, slug) => {
  if (file === `locations/${slug}.html`) return "commercial-city-hub";
  if (file.startsWith(`locations/${slug}/`)) return "city-service-child";
  return "city-editorial-guide";
};

const panelById = new Map(registry.panels.map((panel) => [panel.id, panel]));
const integrityByCity = new Map(integrity.pages.map((page) => [page.city, page]));
const displacementByCity = new Map();
for (const query of displacement.queries.filter((row) => row.cohort === "expansion-manual-baseline")) {
  if (!displacementByCity.has(query.city)) displacementByCity.set(query.city, []);
  displacementByCity.get(query.city).push(query);
}
const gscRequested = new Set((snapshot.gsc.tracked_query_pages?.requested || []).map((query) => String(query).toLowerCase()));
const gscRows = snapshot.gsc.tracked_query_pages?.rows || [];
const gscTopPages = new Map((snapshot.gsc.top_pages || []).map((row) => [row.page.replace(/\/$/, ""), row]));

const cities = priority.cities.map((prioritized) => {
  const panelRef = panelById.get(prioritized.panelId);
  assert.ok(panelRef, `missing panel: ${prioritized.panelId}`);
  const config = read(panelRef.configPath);
  const reportPath = panelRef.configPath.replace(/config\.json$/, "latest.json");
  const report = read(reportPath);
  const integrityPage = integrityByCity.get(prioritized.city);
  assert.ok(integrityPage, `missing integrity page: ${prioritized.city}`);
  const queryEvidence = displacementByCity.get(prioritized.city) || [];
  assert.equal(queryEvidence.length, 4, `missing displacement rows: ${prioritized.city}`);
  const mainFile = `locations/${prioritized.slug}.html`;
  const discoveredRoutes = allHtml.filter((file) =>
    file === mainFile || file.startsWith(`locations/${prioritized.slug}/`) || file.startsWith(`blog/${prioritized.slug}/`),
  );
  const expectedRoutes = [mainFile, ...prioritized.protectedRelatedRoutes].sort();
  assert.deepEqual(discoveredRoutes, expectedRoutes, `route inventory drift: ${prioritized.city}`);
  const orderedRoutes = [mainFile, ...discoveredRoutes.filter((file) => file !== mainFile)];
  const routes = orderedRoutes.map((file) => {
    const signals = pageSignals(file);
    const aggregate = signals.canonical ? gscTopPages.get(signals.canonical.replace(/\/$/, "")) || null : null;
    return {
      ...signals,
      role: routeRole(file, prioritized.slug),
      aggregateGsc: aggregate
        ? { window: snapshot.gsc.window, clicks: aggregate.clicks, impressions: aggregate.impressions, position: aggregate.position }
        : null,
      decision: file === mainFile
        ? "Preserve as the intended commercial city hub selected by every fixed query with a measured organic rank."
        : "Protect this route until exact query-to-URL evidence supports a bounded architecture change.",
    };
  });
  const fixedQueries = config.keywords.map((row) => row.keyword);
  const requested = fixedQueries.filter((query) => gscRequested.has(query.toLowerCase()));
  const exactRows = gscRows.filter((row) => fixedQueries.includes(String(row.query).toLowerCase()));
  const measuredOrganic = report.results.filter((row) => row.organicRank !== null);
  const mainCanonical = routes.find((route) => route.file === mainFile).canonical;
  assert.ok(measuredOrganic.every((row) => row.rankingUrl === mainCanonical), `fixed SERP selected another URL: ${prioritized.city}`);
  const outsideDepth = report.results.filter((row) => row.organicRank === null).map((row) => row.keyword);
  const currentCannibalization = measuredOrganic.length === 4
    ? "not-evidenced-all-four-fixed-serps-select-main"
    : "not-evidenced-bounded-panel-selects-main-when-ranked-and-exact-gsc-unmeasured";
  let nextControlledAction = "Hold public changes; obtain exact targeted GSC URL attribution, then compare the intended hub with protected related routes before a single-variable experiment.";
  if (prioritized.lane === "protect-existing-number-one-and-aio-footholds") {
    nextControlledAction = "Apply only the separately approved integrity cleanup with title, H1, canonical, links, and related routes held constant; protect the existing #1 query and any owned AIO citation through weekly observation.";
  } else if (prioritized.lane === "architecture-first-before-intent-experiment") {
    nextControlledAction = "Obtain exact targeted GSC URL attribution and inspect internal-link intent before any title or route change; outside-depth rows do not prove cannibalization.";
  }
  return {
    priority: prioritized.priority,
    city: prioritized.city,
    slug: prioritized.slug,
    lane: prioritized.lane,
    panel: {
      id: report.panelId,
      file: reportPath,
      sha256: sha256(reportPath),
      observedAt: report.observedAt,
      queries: fixedQueries,
      organicRanks: report.results.map((row) => row.organicRank),
      intendedMainSelectedForEveryMeasuredRank: true,
      outsideMeasuredDepth: outsideDepth,
      exactCidMapsNumberOne: report.results.filter((row) => row.mapPackRank === 1).length,
      aiOverviewsPresent: report.summary.aiOverviewsPresent,
      aiOverviewCitations: report.summary.aiOverviewCitations,
    },
    targetedGsc: {
      snapshot: sourcePaths.gscSnapshot,
      window: snapshot.gsc.window,
      fixedQueriesRequested: requested.length,
      exactQueryPageRowsReturned: exactRows.length,
      status: requested.length === fixedQueries.length ? "requested" : "not-requested-in-pinned-snapshot",
      interpretation: "Unrequested or unreturned exact rows are unmeasured, not zero and not evidence of cannibalization.",
    },
    integrity: {
      pageSha256: integrityPage.sha256,
      blockingFindingClasses: integrityPage.findings.length,
      provisionalWarningClasses: integrityPage.warnings.length,
      identityState: integrityPage.identity.state,
      status: "cleanup-awaiting-separate-explicit-owner-approval",
    },
    architecture: {
      currentCommercialCannibalization: currentCannibalization,
      confidence: measuredOrganic.length === 4 ? "moderate" : "low-until-targeted-gsc",
      routeCount: routes.length,
      routes,
      decision: "Preserve every route and canonical. The fixed panel selects the intended main page whenever Frame ranks; exact expansion GSC query-to-URL evidence is not yet available.",
    },
    nextControlledAction,
    prohibited: [
      "No redirect, canonical, noindex, deletion, title, H1, or internal-link mutation from this diagnosis.",
      "No inference that a related route is cannibalizing the commercial hub without exact query-to-URL evidence.",
      "No public cleanup before the exact expansion cleanup approval is recorded.",
      "No GBP, service-area, review, directory, indexing, outreach, DNS, ads, or public-profile mutation."
    ],
  };
});

const artifact = {
  schemaVersion: 1,
  auditId: "frame-utah-slv-expansion-architecture-v1",
  market: "utah-salt-lake-valley",
  preparedAt: "2026-08-12T19:00:00.000Z",
  status: "diagnosed-no-public-authorization-targeted-gsc-pending",
  publicMutationPerformed: false,
  sources: Object.fromEntries(Object.entries(sourcePaths).map(([key, file]) => [key, { file, sha256: sha256(file) }])),
  summary: {
    cities: cities.length,
    fixedQueries: cities.reduce((sum, city) => sum + city.panel.queries.length, 0),
    routesPinned: cities.reduce((sum, city) => sum + city.architecture.routeCount, 0),
    relatedRoutesProtected: cities.reduce((sum, city) => sum + city.architecture.routeCount - 1, 0),
    targetedGscQueriesRequested: cities.reduce((sum, city) => sum + city.targetedGsc.fixedQueriesRequested, 0),
    targetedGscRowsReturned: cities.reduce((sum, city) => sum + city.targetedGsc.exactQueryPageRowsReturned, 0),
    citiesWithCurrentCannibalizationEvidenced: 0,
    publicMutations: 0,
  },
  globalDecision: [
    "All 48 expansion queries have a fixed mobile baseline; the intended main city page is selected for every measured Frame organic result.",
    "The pinned GSC snapshot predates 72-query targeting and requested none of the 48 expansion queries, so current expansion query-to-URL attribution remains unmeasured.",
    "Preserve all 12 city hubs and all 11 related city-service/editorial routes; no current evidence supports redirects, canonical changes, noindex, deletion, or bulk service-page generation.",
    "Run the 72-query GSC workflow after this branch safely lands, then update these diagnoses before any ranking-intent experiment.",
    "Integrity cleanup is a separate owner-approved variable and must precede any title/H1/architecture experiment."
  ],
  cities,
};

assert.equal(artifact.summary.cities, 12);
assert.equal(artifact.summary.fixedQueries, 48);
assert.equal(artifact.summary.routesPinned, 23);
assert.equal(artifact.summary.relatedRoutesProtected, 11);
assert.equal(artifact.summary.targetedGscQueriesRequested, 0);
assert.equal(artifact.summary.targetedGscRowsReturned, 0);
assert.equal(artifact.summary.citiesWithCurrentCannibalizationEvidenced, 0);
assert.ok(artifact.cities.every((city) => city.panel.intendedMainSelectedForEveryMeasuredRank));
assert.ok(artifact.cities.every((city) => city.targetedGsc.status === "not-requested-in-pinned-snapshot"));
assert.ok(artifact.cities.every((city) => city.architecture.routes[0].role === "commercial-city-hub"));
assert.ok(artifact.cities.every((city) => city.prohibited.some((rule) => rule.includes("No GBP"))));

const nextText = `${JSON.stringify(artifact, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV expansion architecture: ${artifact.summary.cities} cities, ${artifact.summary.routesPinned} routes, ${artifact.summary.targetedGscRowsReturned} exact GSC rows, 0 cannibalization findings`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV expansion architecture is stale; run npm run sync:slv-expansion-architecture");
  console.log(`PASS SLV expansion architecture: ${artifact.summary.cities} cities, ${artifact.summary.routesPinned} routes pinned, exact GSC unmeasured, no public authorization`);
}
