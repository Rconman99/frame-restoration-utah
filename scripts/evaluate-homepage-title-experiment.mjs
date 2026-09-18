#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const experimentPath = "data/seo-experiments/utah-homepage-commercial-title-2026-08-09.json";
const outputPath = "data/seo/experiment-readouts/utah-homepage-commercial-title-2026-08-09.json";
const snapshotDir = path.join(root, "data", "seo", "snapshots");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const normalizeUrl = (value) => new URL(value).href.replace(/\/$/u, "");
const round = (value, digits = 6) => Number(value.toFixed(digits));
export function firstFullGscDay(deployedAt) {
  // Search Analytics dates are Pacific, not UTC or the business's local timezone.
  const parts = Object.fromEntries(new Intl.DateTimeFormat("en-US", {
    timeZone: "America/Los_Angeles", year: "numeric", month: "2-digit", day: "2-digit",
  }).formatToParts(new Date(deployedAt)).map(part => [part.type, part.value]));
  return new Date(Date.parse(`${parts.year}-${parts.month}-${parts.day}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
}

export function evaluateHomepageTitleExperiment({ experiment, baselineSnapshot, crawlGuardBaselineSnapshot = baselineSnapshot, candidateSnapshots, now = new Date().toISOString() }) {
  assert.ok(Number.isFinite(Date.parse(now)), "valid evaluation timestamp required");
  assert.ok(Number.isFinite(Date.parse(experiment.measurement.deployedAt)), "verified deployment date required");
  assert.ok(Number.isFinite(Date.parse(experiment.measurement.earliestEvaluationAt)), "evaluation date required");
  const baselineWindow = baselineSnapshot.gsc?.window;
  const baselineHomepage = baselineSnapshot.gsc?.top_pages?.find(({ page }) => normalizeUrl(page) === normalizeUrl(experiment.page));
  assert.equal(baselineSnapshot.gsc?.available, true, "baseline GSC must be measured");
  assert.ok(baselineWindow && baselineHomepage, "baseline window and exact homepage row required");
  assert.ok([baselineHomepage.clicks, baselineHomepage.impressions, baselineHomepage.position].every(Number.isFinite)
    && baselineHomepage.clicks >= 0 && baselineHomepage.impressions > 0
    && baselineHomepage.clicks <= baselineHomepage.impressions && baselineHomepage.position > 0,
  "baseline metrics must be valid");
  assert.equal(baselineWindow.startDate, experiment.baseline.window.start, "baseline start parity");
  assert.equal(baselineWindow.endDate, experiment.baseline.window.end, "baseline end parity");
  assert.equal(baselineHomepage.clicks, experiment.baseline.homepage.clicks, "baseline click parity");
  assert.equal(baselineHomepage.impressions, experiment.baseline.homepage.impressions, "baseline impression parity");
  assert.equal(baselineHomepage.position, experiment.baseline.homepage.averagePosition, "baseline position parity");

  assert.ok(Number.isFinite(Date.parse(crawlGuardBaselineSnapshot.crawl?.fetched_at))
    && Date.parse(crawlGuardBaselineSnapshot.crawl.fetched_at) < Date.parse(experiment.measurement.deployedAt),
  "crawl guard baseline must precede deployment");
  const postWindowStart = firstFullGscDay(experiment.measurement.deployedAt);
  const postWindowEnd = new Date(Date.parse(`${postWindowStart}T00:00:00Z`) + (experiment.measurement.evaluationWindowDays - 1) * 86_400_000).toISOString().slice(0, 10);
  const eligible = candidateSnapshots
    .filter(({ snapshot }) => snapshot.gsc?.available === true
      && snapshot.date <= now.slice(0, 10)
      && snapshot.gsc?.window?.startDate === postWindowStart
      && snapshot.gsc?.window?.endDate === postWindowEnd)
    .sort((a, b) => a.snapshot.date.localeCompare(b.snapshot.date));
  const chosen = eligible.at(-1) ?? null;
  const beforeCtr = baselineHomepage.impressions > 0 ? baselineHomepage.clicks / baselineHomepage.impressions : null;
  const base = {
    schemaVersion: 1,
    evaluationId: "utah-homepage-commercial-title-2026-08-09-evaluation-v1",
    experimentId: experiment.id,
    evaluatedAt: now,
    publicMutationPerformed: false,
    interpretation: "Pinned-rule observation only, not causal SEO lift or proof of leads/revenue. Crawl indexability counts are not Google indexing confirmation. Other site changes overlapped this period.",
    requiredPostWindow: { start: postWindowStart, end: postWindowEnd },
    baseline: {
      sourceReceipt: experiment.baseline.sourceReceipt,
      window: experiment.baseline.window,
      clicks: baselineHomepage.clicks,
      impressions: baselineHomepage.impressions,
      ctr: beforeCtr === null ? null : round(beforeCtr),
      averagePosition: baselineHomepage.position,
      crawl: {
        sourceReceipt: experiment.measurement.crawlGuardBaselineReceipt ?? experiment.baseline.sourceReceipt,
        pages: crawlGuardBaselineSnapshot.crawl.pages,
        indexablePages: crawlGuardBaselineSnapshot.crawl.indexable_pages,
        errorIssueUrls: crawlGuardBaselineSnapshot.crawl.issues.filter(({ severity }) => severity === "error").flatMap(({ urls }) => urls).sort(),
      },
    },
  };
  if (Date.parse(now) < Date.parse(experiment.measurement.earliestEvaluationAt)) return {
    ...base, status: "AWAITING_CALENDAR_GATE", verdict: "hold", decisionReady: false, postMeasurement: null,
    reason: "Do not evaluate before the recorded experiment review date.",
  };
  if (!chosen) return {
    ...base,
    status: "AWAITING_COMPLETE_POST_DEPLOYMENT_GSC_WINDOW",
    verdict: "hold",
    decisionReady: false,
    postMeasurement: null,
    checks: {
      fullWindow: false,
      minimumHomepageImpressions: false,
      ctrImprovesRelative: null,
      averagePositionImprovesByAtLeastTwo: null,
      noCrawlOrIndexRegression: null,
    },
    reason: `No measured snapshot has the exact post-deployment ${postWindowStart} through ${postWindowEnd} GSC window. A partial or overlapping window cannot decide this experiment.`,
  };

  const { file, snapshot } = chosen;
  const homepage = snapshot.gsc.top_pages?.find(({ page }) => normalizeUrl(page) === normalizeUrl(experiment.page));
  if (homepage) assert.ok([homepage.clicks, homepage.impressions, homepage.position].every(Number.isFinite)
    && homepage.clicks >= 0 && homepage.impressions > 0 && homepage.clicks <= homepage.impressions && homepage.position > 0,
  "post-window metrics must be valid, not coerced null/negative values");
  const afterCtr = homepage?.impressions > 0 ? homepage.clicks / homepage.impressions : null;
  const ctrImprovesRelative = beforeCtr !== null && afterCtr !== null && afterCtr > beforeCtr;
  const positionImprovement = homepage ? baselineHomepage.position - homepage.position : null;
  const averagePositionImprovesByAtLeastTwo = positionImprovement !== null
    && positionImprovement >= experiment.measurement.keepWhen.orHomepageAveragePositionImprovement;
  const baselineErrors = new Set(base.baseline.crawl.errorIssueUrls);
  const postErrorIssueUrls = snapshot.crawl.issues.filter(({ severity }) => severity === "error").flatMap(({ urls }) => urls).sort();
  const newErrorIssueUrls = postErrorIssueUrls.filter((url) => !baselineErrors.has(url));
  const noCrawlOrIndexRegression = snapshot.crawl.indexable_pages >= crawlGuardBaselineSnapshot.crawl.indexable_pages && newErrorIssueUrls.length === 0;
  const minimumHomepageImpressions = homepage?.impressions >= experiment.measurement.minimumHomepageImpressions;
  const decisionReady = Boolean(homepage && minimumHomepageImpressions && Number.isFinite(afterCtr) && Number.isFinite(positionImprovement));
  const positiveSignal = ctrImprovesRelative || averagePositionImprovesByAtLeastTwo;
  const verdict = !decisionReady
    ? "hold"
    : noCrawlOrIndexRegression && positiveSignal
      ? "keep"
      : "revert";
  return {
    ...base,
    status: decisionReady ? "DECISION_READY" : "INSUFFICIENT_POST_WINDOW_EVIDENCE",
    verdict,
    decisionReady,
    postMeasurement: {
      sourceReceipt: file,
      window: { start: snapshot.gsc.window.startDate, end: snapshot.gsc.window.endDate },
      clicks: homepage?.clicks ?? null,
      impressions: homepage?.impressions ?? null,
      ctr: afterCtr === null ? null : round(afterCtr),
      averagePosition: homepage?.position ?? null,
      positionImprovement,
      crawl: {
        pages: snapshot.crawl.pages,
        indexablePages: snapshot.crawl.indexable_pages,
        newErrorIssueUrls,
      },
    },
    checks: {
      fullWindow: true,
      minimumHomepageImpressions,
      ctrImprovesRelative,
      averagePositionImprovesByAtLeastTwo,
      noCrawlOrIndexRegression,
    },
    reason: !decisionReady
      ? "The exact post-deployment window exists but lacks a comparable homepage row or the minimum 1,000 impressions. Missing evidence cannot become a keep or revert."
      : verdict === "keep"
        ? "Keep: at least one pinned performance signal improved and crawl/index guardrails held."
        : "Revert only the isolated homepage title/description experiment: the pinned performance rule or crawl/index guardrail failed. Never restore an unsupported claim.",
  };
}

if (path.resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const experiment = read(experimentPath);
  const baselineSnapshot = read(experiment.baseline.sourceReceipt);
  const crawlGuardBaselineSnapshot = read(experiment.measurement.crawlGuardBaselineReceipt);
  const snapshots = fs.readdirSync(snapshotDir).filter((name) => /^\d{4}-\d{2}-\d{2}\.json$/u.test(name)).sort().map((name) => ({
    file: `data/seo/snapshots/${name}`,
    snapshot: read(`data/seo/snapshots/${name}`),
  }));
  const artifact = evaluateHomepageTitleExperiment({ experiment, baselineSnapshot, crawlGuardBaselineSnapshot, candidateSnapshots: snapshots });

  assert.ok(["running", "kept"].includes(experiment.status));
  assert.equal(artifact.publicMutationPerformed, false);
  assert.equal(artifact.requiredPostWindow.start, "2026-08-10");
  assert.equal(artifact.requiredPostWindow.end, "2026-09-06");
  assert.equal(artifact.baseline.sourceReceipt, "data/seo/snapshots/2026-08-07.json");
  assert.equal(artifact.baseline.crawl.sourceReceipt, "data/seo/snapshots/2026-08-09.json");
  assert.equal(artifact.baseline.clicks, 9);
  assert.equal(artifact.baseline.impressions, 4429);
  assert.equal(artifact.baseline.averagePosition, 16.8);
  assert.ok(["hold", "keep", "revert"].includes(artifact.verdict));
  if (!artifact.decisionReady) assert.equal(artifact.verdict, "hold");
  if (artifact.decisionReady) assert.ok(["keep", "revert"].includes(artifact.verdict));
  if (experiment.measurement.decidedAt) {
    assert.equal(experiment.measurement.decision, artifact.verdict, "recorded decision must match the retained evaluation");
    assert.equal(experiment.measurement.result.sourceReceipt, outputPath, "recorded decision must point to this evaluation");
  }

  const nextText = `${JSON.stringify(artifact, null, 2)}\n`;
  const fullOutputPath = path.join(root, outputPath);
  if (write) {
    fs.mkdirSync(path.dirname(fullOutputPath), { recursive: true });
    fs.writeFileSync(fullOutputPath, nextText);
    console.log(`EVALUATE homepage title: ${artifact.status}, verdict ${artifact.verdict}, window ${artifact.requiredPostWindow.start}..${artifact.requiredPostWindow.end}`);
  } else if (check) {
    assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
    const stored = JSON.parse(fs.readFileSync(fullOutputPath, "utf8"));
    const stable = structuredClone(artifact);
    stable.evaluatedAt = stored.evaluatedAt;
    assert.equal(fs.readFileSync(fullOutputPath, "utf8"), `${JSON.stringify(stable, null, 2)}\n`, "homepage title evaluation is stale; run node scripts/evaluate-homepage-title-experiment.mjs --write");
    console.log(`PASS homepage title evaluation: ${stored.status}, verdict ${stored.verdict}`);
  }
}
