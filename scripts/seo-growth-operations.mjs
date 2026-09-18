#!/usr/bin/env node
// Read-only business work queue, refreshed by the EXISTING daily SEO job.
// No extra API calls, paid rank panels, messaging, public edits or CRM writes.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { slcObservationAction } from "./lib/slv-intervention-queue.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DAY = 86400000;
const site = "https://www.framerestorationutah.com";
const targets = [
  ["slc", "/locations/salt-lake-city"],
  ["heber", "/locations/heber-city"],
  ...["midway", "hideout", "charleston", "layton", "farmington"].map(city => [city, `/blog/${city}/hail-roof-inspection-${city}`]),
];
const regions = [
  ["slc", /\bsalt lake (?:city|valley)\b|\bslc\b/i],
  ["heber", /\bheber\b/i],
  ["hail-service-area", /\b(?:midway|hideout|charleston)\b/i],
  ["davis-hail", /\b(?:layton|farmington)\b/i],
];
const sha256 = bytes => crypto.createHash("sha256").update(bytes).digest("hex");
const validMetric = row => row && [row.clicks, row.impressions, row.position].every(Number.isFinite)
  && row.clicks >= 0 && row.impressions > 0 && row.clicks <= row.impressions && row.position > 0;

export function validateObservationPanel(source, bytes) {
  if (sha256(bytes) !== source.sha256) throw new Error("Observation panel evidence hash mismatch");
  const panel = JSON.parse(bytes);
  if (panel.market !== "utah" || panel.city !== "Salt Lake City" || panel.observedAt !== source.observedAt) throw new Error("Observation panel identity/date mismatch");
  const rows = panel.results.map(row => ({ query: row.keyword, organicRank: row.organicRank,
    depth: panel.provider.depth, mapPackRank: row.mapPackRank, aiOverviewPresent: row.aiOverviewPresent,
    aiOverviewCited: row.aiOverviewCited, rankingUrl: row.rankingUrl }));
  if (JSON.stringify(rows) !== JSON.stringify(source.rows)) throw new Error("Observation panel rows mismatch");
}

export function observationReviewCurrent(review, record, weekly, now) {
  const panel = weekly?.cities?.find(row => row.city === "Salt Lake City")?.latestObservedAt;
  const times = [review?.reviewedAt, review?.nextReviewAt, review?.throughPanelObservedAt, panel].map(Date.parse);
  return review?.artifact === "frame-seo-observation-review" && review.experimentId === record?.id
    && review.publicMutationAuthorized === false && times.every(Number.isFinite)
    && times[2] <= times[0] && times[0] <= now.getTime() && now.getTime() < times[1]
    && times[3] <= times[2];
}

export function buildGrowthOperations({ snapshot, experiments = [], weekly, reviews = {}, now = new Date(), sources = [] }) {
  const observed = Date.parse(snapshot?.crawl?.fetched_at);
  const ageHours = (now.getTime() - observed) / 3600000;
  const fresh = Number.isFinite(ageHours) && ageHours >= 0 && ageHours <= 48;
  const gsc = snapshot?.gsc || {};
  const end = Date.parse(gsc.window?.endDate);
  const start = Date.parse(gsc.window?.startDate);
  const measured = fresh && gsc.available === true && gsc.siteUrl === `${site}/`
    && Number.isFinite(start) && Number.isFinite(end) && start <= end
    && end <= now.getTime() && now.getTime() - end <= 7 * DAY;
  const blockers = [];
  if (!fresh) blockers.push("snapshot_missing_stale_or_future: refresh the existing daily SEO job before choosing work");
  if (!measured) blockers.push("search_data_unavailable_or_stale: no opportunities promoted from old or partial data");
  const crawlErrors = (snapshot?.crawl?.issues || []).filter(row => row.severity === "error");
  if (crawlErrors.length) blockers.push("crawl_regression: repair the reported crawl errors before search-intent changes");
  const actionReady = measured && crawlErrors.length === 0;
  const pages = targets.map(([id, pathname]) => {
    const page = site + pathname;
    const row = measured ? gsc.top_pages?.find(row => row.page === page) : null;
    return { id, page, state: validMetric(row) ? "observed_rolling_window" : "not_measured_or_not_returned",
      metrics: validMetric(row) ? { clicks: row.clicks, impressions: row.impressions, averagePosition: row.position } : null };
  });
  const opportunities = regions.flatMap(([region, pattern]) => (measured ? gsc.top_queries || [] : [])
    .filter(row => pattern.test(row.query) && validMetric(row) && row.impressions >= 30 && row.position >= 4 && row.position <= 15)
    .sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query))
    .slice(0, 3).map(row => ({ region, query: row.query, clicks: row.clicks, impressions: row.impressions,
      averagePosition: row.position, state: actionReady ? "exact_query_page_diagnosis_ready" : "blocked_by_crawl_regression",
      nextAction: "Obtain an exact query + intended-page baseline; check current URL selection and running experiments before drafting one isolated change.",
      limitation: "Query-level discovery only: these metrics are not a page baseline, lead count or revenue estimate." })));
  const experimentReviews = experiments.map(record => {
    const measurement = record.measurement || {};
    const deployed = Date.parse(measurement.deployedAt);
    const earliest = Date.parse(measurement.earliestEvaluationAt);
    const closed = Boolean(measurement.decidedAt);
    const review = reviews[record.id];
    const currentReview = observationReviewCurrent(review, record, weekly, now);
    return { id: record.id, page: record.page,
      state: closed ? "decision_recorded_review_source" : currentReview ? "review_recorded_evidence_blocked" : !Number.isFinite(deployed) ? "deployment_evidence_missing"
        : !Number.isFinite(earliest) ? "evaluation_date_missing"
        : measured && end >= earliest ? "observation_review_due" : "waiting_for_settled_window",
      earliestEvaluationAt: measurement.earliestEvaluationAt || null,
      decision: measurement.decision || "not_recorded",
      integrityCorrection: record.classification === "integrity-required-observed-for-ranking-impact",
      nextReviewAt: currentReview ? review.nextReviewAt : null,
      publicMutationAuthorized: false };
  });
  const slcRanking = weekly?.cities?.find(row => row.city === "Salt Lake City")?.decisions?.ranking;
  const reviewedSlc = experimentReviews.find(row => row.id === "utah-slc-entity-trust-correction-2026-08-12" && row.state === "review_recorded_evidence_blocked");
  return {
    artifact: "frame-utah-growth-operations", version: 1, generatedAt: now.toISOString(),
    snapshotDate: snapshot?.date || null, sourceAgeHours: Number.isFinite(ageHours) ? Math.round(ageHours * 10) / 10 : null,
    state: actionReady ? "measurement_operational_outcomes_incomplete" : "evidence_blocked",
    northStar: "qualified_organic_leads", publicMutationAuthorized: false,
    businessOutcomes: { qualifiedLeads: null, bookedInspections: null, soldJobs: null, collectedRevenue: null,
      state: "not_measured", nextAction: "Reconcile existing lead source/city/page attribution with owner-confirmed CRM outcomes through the approved read-only lane; do not infer jobs from clicks or change CRM truth." },
    searchWindow: measured ? gsc.window : null, blockers, crawlErrors,
    priorityPolicy: "Fix regressions first; SLC is the owner's commercial priority, then Heber and the hail-service towns. No inferred profit weighting.",
    pages, opportunities, experimentReviews,
    slcNextAction: reviewedSlc ? {
      decision: "Monitor", action: reviews[reviewedSlc.id].nextAction,
      gate: "review-recorded-wait-for-next-panel-or-review-date-public-approval-required",
      ownerApprovalPhrase: null,
    } : slcObservationAction(slcRanking),
    hailCampaign: {
      releaseCommit: "259446f5dd85849061bd136f22b0227087768b3b",
      releasePullRequest: "https://github.com/Rconman99/frame-restoration-utah/pull/295",
      firstFullDay: "2026-09-18", observationWindowEnd: "2026-10-15", earliestSettledReadDate: "2026-10-18",
      state: !measured ? "not_measured" : gsc.window.endDate < "2026-09-18" ? "window_precedes_release"
        : gsc.window.endDate >= "2026-10-15" ? "dedicated_readout_due" : "dedicated_window_readout_pending",
      limitation: "The page metrics above are rolling discovery readings, not a fixed campaign outcome. Fetch Sep 18–Oct 15 explicitly at closeout; no pre-release baseline, causality, storm footprint, indexing or lead result is inferred." },
    davisHailCampaign: {
      releaseCommit: "69b2295d0fab798a01903482f3c13f3f0d6f7411",
      releasePullRequest: "https://github.com/Rconman99/frame-restoration-utah/pull/298",
      firstFullDay: "2026-09-19", observationWindowEnd: "2026-10-16", earliestSettledReadDate: "2026-10-19",
      state: !measured ? "not_measured" : gsc.window.endDate < "2026-09-19" ? "window_precedes_release"
        : now.getTime() >= Date.parse("2026-10-19T06:00:00Z") && gsc.window.endDate >= "2026-10-16"
          ? "dedicated_readout_due" : "dedicated_window_readout_pending",
      limitation: "Rolling discovery is not a campaign result. Fetch Sep 19–Oct 16 explicitly no earlier than Oct 19 MDT with final data. No baseline, causality, indexing, citation, lead or revenue result inferred. Davis activity is not SLC attribution." },
    aiVisibility: { state: "not_measured_by_this_report", namedCitationRate: null,
      nextAction: "Use existing provider-specific fixed-panel receipts. GSC Web is not a separate AI citation measurement; do not buy new panels or reconnect credentials from this report." },
    sources,
  };
}

export function renderGrowthOperations(report) {
  const lines = ["# Utah operational growth readout", "", `State: ${report.state}. Snapshot: ${report.snapshotDate}.`,
    "", "Qualified leads, inspections, sold jobs and collected revenue: **not measured** by this search report.",
    "", "## Work next", "", ...report.blockers.map(value => `- BLOCKED: ${value}`),
    `- SLC: ${report.slcNextAction.action}`,
    ...report.experimentReviews.map(row => `- ${row.id}: ${row.state}. Public changes remain separately gated.`),
    "", "## Query discovery — exact query/page diagnosis required", "",
    ...report.opportunities.map(row => `- ${row.region}: ${row.query.replace(/[\r\n<>|`]/g, " ")} — ${row.impressions} impressions, ${row.clicks} clicks, position ${row.averagePosition}; ${row.state}.`),
    "", "## Priority pages — rolling search window", "",
    ...report.pages.map(row => `- ${row.id}: ${row.metrics ? `${row.metrics.clicks} clicks / ${row.metrics.impressions} impressions / position ${row.metrics.averagePosition}` : "not measured or not returned"}.`),
    "", `Hail campaign: ${report.hailCampaign.state}; fixed Sep 18–Oct 15 readout no earlier than Oct 18, subject to available final data.`,
    "", `Davis hail campaign: ${report.davisHailCampaign.state}; fixed Sep 19–Oct 16 readout no earlier than Oct 19 MDT, subject to available final data. Keep Davis separate from SLC attribution.`,
    "", "Owner lane: use existing request records for current local photos/permissions, exact-profile GBP evidence and verified job outcomes. No new owner messages, GBP posts, spend or public edits are sent by this job.",
    "", "Source hashes and limitations: data/seo/growth/latest.json. Search visibility is not proof of leads, revenue or causality.", ""];
  return lines.join("\n");
}

export function runGrowthOperations({ cwd = root, now = new Date(), write = true } = {}) {
  const sources = [];
  const read = relative => {
    const bytes = fs.readFileSync(path.join(cwd, relative));
    sources.push({ file: relative, sha256: sha256(bytes) });
    return JSON.parse(bytes);
  };
  const dates = fs.readdirSync(path.join(cwd, "data/seo/snapshots")).filter(file => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort();
  if (!dates.length) throw new Error("No SEO snapshot: cannot build growth readout");
  const snapshot = read(`data/seo/snapshots/${dates.at(-1)}`);
  const experiments = fs.readdirSync(path.join(cwd, "data/seo-experiments")).filter(file => file.endsWith(".json")).sort().map(file => read(`data/seo-experiments/${file}`));
  const weekly = read("data/rank-tracker/SLV-WEEKLY-DECISIONS-2026-08-12.json");
  const reviews = {};
  for (const record of experiments) {
    for (const reference of [record.measurement?.result?.sourceReceipt, record.measurement?.observationReview?.sourceReceipt].filter(Boolean)) {
      if (!/^data\/seo\/experiment-readouts\/[a-z0-9-]+\.json$/.test(reference)) throw new Error("Invalid experiment readout path");
      const receipt = read(reference);
      if (receipt.experimentId !== record.id) throw new Error("Experiment/readout identity mismatch");
      if (receipt.artifact === "frame-seo-observation-review") {
        if (!Array.isArray(receipt.evidence) || receipt.evidence.length < 2) throw new Error("Observation review requires two retained panel receipts");
        if (new Set(receipt.evidence.map(source => source.file)).size !== receipt.evidence.length) throw new Error("Observation panels must be distinct");
        if (!receipt.evidence.some(source => source.observedAt === receipt.throughPanelObservedAt)) throw new Error("Observation review end is not evidence-bound");
        for (const source of receipt.evidence) {
          if (!/^data\/rank-tracker\/\d{4}-\d{2}-\d{2}\.json$/.test(source.file)) throw new Error("Invalid panel evidence path");
          const bytes = fs.readFileSync(path.join(cwd, source.file));
          validateObservationPanel(source, bytes);
          sources.push({ file: source.file, sha256: source.sha256 });
        }
        reviews[record.id] = receipt;
      }
    }
  }
  const report = buildGrowthOperations({ snapshot, experiments, weekly, reviews, now, sources });
  const markdown = renderGrowthOperations(report);
  if (write) {
    const dir = path.join(cwd, "data/seo/growth");
    fs.mkdirSync(dir, { recursive: true });
    fs.writeFileSync(path.join(dir, "latest.json"), JSON.stringify(report, null, 2) + "\n");
    fs.writeFileSync(path.join(dir, "latest.md"), markdown);
  }
  return { report, markdown };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const { report, markdown } = runGrowthOperations({ write: !process.argv.includes("--no-write") });
  console.log(markdown);
  if (report.state === "evidence_blocked" && process.env.GITHUB_ACTIONS) console.log("::warning::Utah growth decisions are evidence-blocked; inspect the growth readout");
}
