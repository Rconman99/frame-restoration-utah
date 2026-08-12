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

const outputPath = "data/rank-tracker/SLV-WEEKLY-DECISIONS-2026-08-12.json";
const portfolioPath = "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json";
const slcExperimentPath = "data/seo-experiments/utah-slc-entity-trust-correction-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const portfolio = read(portfolioPath);
const slcExperiment = read(slcExperimentPath);

function reportDirectory(goal) {
  if (goal.slug === "salt-lake-city") return "data/rank-tracker";
  return goal.cohort.startsWith("core-")
    ? `data/rank-tracker/panels/${goal.slug}`
    : `data/rank-tracker/expansion/${goal.slug}`;
}

function datedReports(goal) {
  const directory = reportDirectory(goal);
  return fs.readdirSync(path.join(root, directory))
    .filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file))
    .sort()
    .map((file) => {
      const source = `${directory}/${file}`;
      return { source, sha256: sha256(source), report: read(source) };
    });
}

function trailingStreak(reports, predicate) {
  let count = 0;
  for (let index = reports.length - 1; index >= 0; index -= 1) {
    if (!predicate(reports[index].report)) break;
    count += 1;
  }
  return count;
}

function isoWeekKey(report) {
  const date = new Date(`${report.date || String(report.observedAt).slice(0, 10)}T00:00:00Z`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function latestReportPerWeek(reports) {
  const weeks = new Map();
  for (const item of reports) weeks.set(isoWeekKey(item.report), item);
  return [...weeks.values()].sort((a, b) => a.report.observedAt.localeCompare(b.report.observedAt));
}

function intendedPageSelected(result, goal) {
  if (result.organicRank == null) return true;
  const intendedPath = `/${goal.page.replace(/\.html$/, "")}`;
  try {
    return new URL(result.rankingUrl).pathname.replace(/\/$/, "") === intendedPath;
  } catch {
    return false;
  }
}

const allObservedAt = [];
const sourcePanels = {};
const cityDecisions = portfolio.cityGoals.map((goal) => {
  const reports = datedReports(goal);
  assert.ok(reports.length > 0, `missing dated panel: ${goal.city}`);
  const weeklyReports = latestReportPerWeek(reports);
  const latest = weeklyReports.at(-1).report;
  assert.equal(latest.panelId, goal.panelId, `panel mismatch: ${goal.city}`);
  assert.equal(latest.results.length, 4, `fixed query count mismatch: ${goal.city}`);
  allObservedAt.push(latest.observedAt);
  sourcePanels[goal.slug] = reports.map(({ source, sha256: hash }) => ({ file: source, sha256: hash }));

  const currentOrganicNumberOne = latest.results.filter((row) => row.organicRank === 1).map((row) => row.keyword);
  const currentAioCitations = latest.results.filter((row) => row.aiOverviewPresent && row.aiOverviewCited).map((row) => row.keyword);
  const queryStreaks = latest.results.map((latestRow) => {
    const rows = weeklyReports.map(({ report }) => report.results.find((row) => row.id === latestRow.id));
    assert.ok(rows.every(Boolean), `query history mismatch: ${goal.city}/${latestRow.id}`);
    return {
      queryId: latestRow.id,
      keyword: latestRow.keyword,
      current: {
        organicRank: latestRow.organicRank,
        exactCidMapRank: latestRow.mapPackRank,
        aiOverviewPresent: latestRow.aiOverviewPresent,
        aiOverviewCited: latestRow.aiOverviewCited,
        rankingUrl: latestRow.rankingUrl,
      },
      consecutiveOrganicNumberOnePanels: trailingStreak(weeklyReports, ({ results }) => results.find((row) => row.id === latestRow.id)?.organicRank === 1),
      consecutiveExactCidMapsNumberOnePanels: trailingStreak(weeklyReports, ({ results }) => results.find((row) => row.id === latestRow.id)?.mapPackRank === 1),
      intendedPageSelected: intendedPageSelected(latestRow, goal),
    };
  });

  const cityOrganicStreak = trailingStreak(weeklyReports, ({ results }) => results.every((row) => row.organicRank === 1));
  const cityMapsStreak = trailingStreak(weeklyReports, ({ results }) => results.every((row) => row.mapPackRank === 1));
  const cityAioCoverageStreak = trailingStreak(weeklyReports, ({ results }) => results.every((row) => !row.aiOverviewPresent || row.aiOverviewCited));
  const intendedUrlStreak = trailingStreak(weeklyReports, ({ results }) => results.every((row) => intendedPageSelected(row, goal)));

  const isSlc = goal.city === "Salt Lake City";
  const postDeploymentReports = isSlc
    ? weeklyReports.filter(({ report }) => report.observedAt >= slcExperiment.measurement.deployedAt)
    : [];
  const calendarGatePassedAtLatestPanel = isSlc
    ? latest.observedAt >= slcExperiment.measurement.earliestEvaluationAt
    : false;

  const integrityDecision = isSlc
    ? {
        verdict: "keep",
        reason: "The BBB and manufacturer-credential edits are required factual corrections. Their contract forbids restoring stale grades or unsupported credentials even if ranks fluctuate.",
      }
    : {
        verdict: "pending-owner-approval",
        reason: "The bounded integrity cleanup has not been published; no keep/revert decision exists for an unapplied change.",
      };

  const rankingDecision = isSlc
    ? {
        verdict: "hold",
        reason: calendarGatePassedAtLatestPanel && postDeploymentReports.length >= 4
          ? "The calendar and panel-count gates have passed, but the running contract remains confounded and requires a fresh same-window consumer-AI reading before attribution."
          : `Only ${postDeploymentReports.length}/4 required post-deployment Google panels exist and the earliest evaluation is ${slcExperiment.measurement.earliestEvaluationAt}; keep the SLC page frozen.`,
        activeExperiment: slcExperiment.id,
        postDeploymentGooglePanels: postDeploymentReports.length,
        requiredGooglePanels: 4,
        earliestEvaluationAt: slcExperiment.measurement.earliestEvaluationAt,
        calendarGatePassedAtLatestPanel,
        confounds: slcExperiment.confounds,
      }
    : {
        verdict: "hold",
        reason: weeklyReports.length < 4
          ? `Only ${weeklyReports.length}/4 comparable weekly Google panels exist and no isolated ranking experiment is running.`
          : "No isolated ranking experiment is running; additional observations do not create a keep/revert decision by themselves.",
        activeExperiment: null,
        observedGooglePanels: weeklyReports.length,
        requiredGooglePanels: 4,
      };

  return {
    city: goal.city,
    slug: goal.slug,
    cohort: goal.cohort,
    panelId: goal.panelId,
    page: goal.page,
    latestObservedAt: latest.observedAt,
    rawDatedGoogleReports: reports.length,
    comparableWeeklyGooglePanels: weeklyReports.length,
    consumerAiState: goal.current.consumerAi,
    protectedFootholds: {
      organicNumberOneQueries: currentOrganicNumberOne,
      googleAiOverviewCitedQueries: currentAioCitations,
    },
    sustainedProgress: {
      requiredConsecutiveWeeklyPanels: 4,
      allFourOrganicNumberOneStreak: cityOrganicStreak,
      allFourExactCidMapsNumberOneStreak: cityMapsStreak,
      allObservedAiOverviewsCitedStreak: cityAioCoverageStreak,
      intendedPageSelectionStreak: intendedUrlStreak,
      consumerAiCompleteStreak: 0,
      cityAtSustainedGoal: false,
    },
    decisions: { integrity: integrityDecision, ranking: rankingDecision },
    queryStreaks,
  };
});

const artifact = {
  schemaVersion: 1,
  decisionId: "frame-utah-slv-weekly-keep-revert-v1",
  market: "utah-salt-lake-valley",
  asOf: allObservedAt.sort().at(-1),
  status: "active-insufficient-four-week-history",
  publicMutationPerformed: false,
  policy: {
    requiredConsecutiveWeeklyPanels: 4,
    integrityTruthRule: "Keep required factual corrections; never restore unsupported claims, stale credentials, or wrong entity identity to chase rank.",
    rankingRule: "Keep or revert only an isolated ranking variable after four comparable weekly panels, a complete same-window consumer-AI panel, green integrity, intended URL selection, and no material guardrail regression.",
    missingDataRule: "Missing panels, provider failures, absent consumer-AI runs, and withheld GSC rows remain unmeasured; they cannot produce a keep, revert, failure, or completion claim.",
    protectionRule: "A current #1 organic query or owned AIO citation is a protected foothold, not city completion.",
  },
  sources: {
    portfolio: { file: portfolioPath, sha256: sha256(portfolioPath) },
    saltLakeCityExperiment: { file: slcExperimentPath, sha256: sha256(slcExperimentPath) },
    panels: sourcePanels,
  },
  summary: {
    cities: cityDecisions.length,
    integrityKeep: cityDecisions.filter((city) => city.decisions.integrity.verdict === "keep").length,
    integrityPendingApproval: cityDecisions.filter((city) => city.decisions.integrity.verdict === "pending-owner-approval").length,
    rankingKeep: cityDecisions.filter((city) => city.decisions.ranking.verdict === "keep").length,
    rankingRevert: cityDecisions.filter((city) => city.decisions.ranking.verdict === "revert").length,
    rankingHold: cityDecisions.filter((city) => city.decisions.ranking.verdict === "hold").length,
    protectedOrganicNumberOneQueries: cityDecisions.reduce((sum, city) => sum + city.protectedFootholds.organicNumberOneQueries.length, 0),
    protectedGoogleAiOverviewCitations: cityDecisions.reduce((sum, city) => sum + city.protectedFootholds.googleAiOverviewCitedQueries.length, 0),
    citiesAtSustainedGoal: 0,
  },
  nextDecisionDate: "2026-08-17",
  nextAction: "Run the scheduled six-city core Google panel on 2026-08-17. Do not admit the 12 expansion cities to recurring paid measurement without explicit spend approval, and do not call a ranking keep/revert before comparable evidence exists.",
  cities: cityDecisions,
};

assert.equal(artifact.cities.length, 18);
assert.equal(artifact.summary.integrityKeep, 1);
assert.equal(artifact.summary.integrityPendingApproval, 17);
assert.equal(artifact.summary.rankingKeep, 0);
assert.equal(artifact.summary.rankingRevert, 0);
assert.equal(artifact.summary.rankingHold, 18);
assert.equal(artifact.summary.protectedOrganicNumberOneQueries, 2);
assert.equal(artifact.summary.protectedGoogleAiOverviewCitations, 2);
assert.deepEqual(
  artifact.cities.filter((city) => city.protectedFootholds.organicNumberOneQueries.length).map((city) => city.city).sort(),
  ["Kearns", "Magna"],
);
assert.equal(artifact.cities.find((city) => city.city === "Salt Lake City").decisions.ranking.postDeploymentGooglePanels, 1);
assert.equal(artifact.cities.find((city) => city.city === "Salt Lake City").rawDatedGoogleReports, 2);
assert.equal(artifact.cities.find((city) => city.city === "Salt Lake City").comparableWeeklyGooglePanels, 1);
assert.ok(artifact.cities.every((city) => city.sustainedProgress.cityAtSustainedGoal === false));

const nextText = `${JSON.stringify(artifact, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV weekly decisions: integrity keep ${artifact.summary.integrityKeep}, ranking hold ${artifact.summary.rankingHold}, protected organic #1 ${artifact.summary.protectedOrganicNumberOneQueries}`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV weekly decisions are stale; run npm run sync:slv-weekly-decisions");
  console.log("PASS SLV weekly decisions: no premature keep/revert, SLC truth correction kept, 18 ranking lanes held for evidence");
}
