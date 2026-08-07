#!/usr/bin/env node
/**
 * Regression-first SEO diff for Frame Restoration Utah — compares today's
 * snapshot (data/seo/snapshots/<date>.json, written by seo-snapshot.mjs)
 * against the newest previous one and writes a dated readout to
 * data/seo/readouts/<date>.md.
 *
 * The review order is FIXED, ported from the seo-god skill's measure phase,
 * and it never changes: 1. regressions (rank drops, new error-severity crawl
 * issues, GSC clicks down >=20% week over week), 2. quick wins (positions
 * 4-15 — page one's lower half, where a title/content fix moves the needle),
 * 3. new queries (the earliest signal a fix or page worked). A quick win is
 * worth nothing on a site that broke yesterday.
 *
 * Honesty rules (non-negotiable):
 *   - "Not measured" stays "not measured", in those words — never 0, never a
 *     percentage computed against a zero placeholder, never dropped from the
 *     readout to save lines.
 *   - null positions are unmeasured, not regressions and not improvements.
 *   - First snapshot -> absolutes only; no delta against zero.
 *   - Quick-win rows report ONLY the fields their source has (GSC rows carry
 *     impressions; tracker rows never do).
 *
 * Extra over seo-god: an "experiment candidates" section pre-shaped for the
 * frame-seo-experiment.v1 protocol (data/seo-experiments/) — page-one queries
 * whose measured CTR sits under the positional expectation. Candidates are
 * REPORT-ONLY: creating the experiment record + making the edit stays a human
 * decision behind the compliance gate.
 *
 * Deadman: when the previous snapshot is older than --deadman-hours (default
 * 48), the readout OPENS with a missed-run warning, and in GitHub Actions the
 * run emits a ::warning:: annotation. A scheduler that silently stopped is
 * exactly the failure this surfaces.
 *
 * Usage: node scripts/seo-diff.mjs [--date YYYY-MM-DD] [--deadman-hours 48] [--no-write]
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { todayInDenver } from "./seo-snapshot.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_DIR = path.join(root, "data", "seo", "snapshots");
const READOUT_DIR = path.join(root, "data", "seo", "readouts");

const RANK_DROP_THRESHOLD = 3;
const WOW_DROP_RATIO = 0.2;
const QUICK_WIN_MIN_POS = 4;
const QUICK_WIN_MAX_POS = 15;
const CANDIDATE_MIN_IMPRESSIONS = 30;
const SILENT_PAGE_MIN_IMPRESSIONS = 50;
const SILENT_PAGE_MAX_ROWS = 10;

/** Positional CTR expectation — same scale the Allen experiment used (0.025 @ pos 8.9). */
export function expectedCtr(position) {
  if (position <= 5) return 0.05;
  if (position <= 10) return 0.025;
  return 0.015;
}

function parseArgs(argv) {
  const args = { deadmanHours: 48, write: true };
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--date") args.date = argv[++i];
    else if (argv[i] === "--deadman-hours") args.deadmanHours = Number(argv[++i]);
    else if (argv[i] === "--no-write") args.write = false;
  }
  return args;
}

export function findSnapshots(date, dir = SNAP_DIR) {
  if (!fs.existsSync(dir)) return { today: null, previous: null };
  const files = fs
    .readdirSync(dir)
    .filter((f) => /^\d{4}-\d{2}-\d{2}\.json$/.test(f))
    .sort();
  const todayFile = files.find((f) => f === `${date}.json`);
  const prevFile = [...files].reverse().find((f) => f < `${date}.json`);
  const read = (f) => (f ? JSON.parse(fs.readFileSync(path.join(dir, f), "utf8")) : null);
  return { today: read(todayFile), previous: read(prevFile) };
}

/** New error-severity issues: type absent before, or an entry listing a URL the previous entry did not. */
function newErrorIssues(today, previous) {
  const out = [];
  const prevByType = new Map((previous.crawl?.issues || []).map((i) => [i.type, i]));
  for (const issue of today.crawl?.issues || []) {
    if (issue.severity !== "error") continue;
    const prev = prevByType.get(issue.type);
    const prevUrls = new Set(prev?.urls || []);
    const fresh = issue.urls.filter((u) => !prevUrls.has(u));
    if (!prev || fresh.length > 0) {
      out.push({ type: issue.type, urls: fresh.length > 0 ? fresh : issue.urls, count: issue.count, sources: issue.sources });
    }
  }
  return out;
}

function rankDrops(today, previous) {
  const measured = (today.ranks || []).some((r) => r.position !== null) || (previous.ranks || []).some((r) => r.position !== null);
  if (!measured) return { measured: false, drops: [] };
  const prevByKw = new Map((previous.ranks || []).map((r) => [r.keyword, r]));
  const drops = [];
  let unmeasured = 0;
  for (const r of today.ranks || []) {
    const p = prevByKw.get(r.keyword);
    if (r.position === null || !p || p.position === null) {
      unmeasured += 1;
      continue;
    }
    if (r.position - p.position >= RANK_DROP_THRESHOLD) {
      drops.push({ keyword: r.keyword, from: p.position, to: r.position, url: r.url });
    }
  }
  return { measured: true, drops, unmeasured };
}

/** Week-over-week clicks from per-date rows (exact); falls back to clicks28d across snapshots. */
function gscWeekOverWeek(today, previous) {
  if (today.gsc?.available && Array.isArray(today.gsc.by_date) && today.gsc.by_date.length >= 14) {
    const rows = [...today.gsc.by_date].sort((a, b) => a.date.localeCompare(b.date));
    const recent = rows.slice(-7).reduce((n, r) => n + r.clicks, 0);
    const prior = rows.slice(-14, -7).reduce((n, r) => n + r.clicks, 0);
    const dropped = prior > 0 && (prior - recent) / prior >= WOW_DROP_RATIO;
    return { measured: true, method: "per-date rows", recent, prior, dropped };
  }
  if (today.gsc?.available && previous?.gsc?.available) {
    const recent = today.gsc.clicks28d;
    const prior = previous.gsc.clicks28d;
    const dropped = prior > 0 && (prior - recent) / prior >= WOW_DROP_RATIO;
    return { measured: true, method: "28d totals across snapshots", recent, prior, dropped };
  }
  return { measured: false };
}

function quickWins(today) {
  if (today.gsc?.available) {
    const rows = (today.gsc.top_queries || [])
      .filter((q) => q.position >= QUICK_WIN_MIN_POS && q.position <= QUICK_WIN_MAX_POS)
      .sort((a, b) => b.impressions - a.impressions)
      .slice(0, 10)
      .map((q) => ({ ...q, page: today.gsc.top_query_pages?.[q.query] || null }));
    return { source: "gsc", rows };
  }
  const tracked = (today.ranks || []).filter(
    (r) => r.position !== null && r.position >= QUICK_WIN_MIN_POS && r.position <= QUICK_WIN_MAX_POS,
  );
  if (tracked.length > 0) {
    // Tracker rows carry keyword/position/url and NO impressions — never invent that field.
    return { source: "tracker", rows: tracked.sort((a, b) => a.position - b.position).slice(0, 10) };
  }
  return { source: "not-measured", rows: [] };
}

function newQueries(today, previous) {
  if (!today.gsc?.available || !previous?.gsc?.available) return { measured: false, rows: [] };
  const prevSet = new Set((previous.gsc.top_queries || []).map((q) => q.query));
  const rows = (today.gsc.top_queries || [])
    .filter((q) => !prevSet.has(q.query))
    .sort((a, b) => b.impressions - a.impressions)
    .slice(0, 10);
  return { measured: true, rows, caveat: queryCoverageCaveat(today.gsc) };
}

/**
 * How much of the query set is actually visible in this snapshot.
 *
 * Older snapshots carry `truncated` but no counts, so fall back to the plain
 * sentence rather than inventing numbers. `queries_seen` is itself capped by the
 * fetch rowLimit, so when the fetch maxed out the true total is unknown and the
 * caveat must say "at least".
 */
export function queryCoverageCaveat(gsc) {
  if (!gsc?.truncated) return null;
  const seen = gsc.queries_seen;
  const stored = gsc.queries_stored;
  if (!Number.isFinite(seen) || !Number.isFinite(stored) || seen <= stored) {
    return "arrivals outside the stored query set are not visible";
  }
  const atLeast = seen >= 5000 ? "at least " : "";
  // The row count understates the blindness. What matters is how much of the
  // site's impressions those rows account for: Utah stored 200 rows covering
  // 2.5% of its impressions, which reads very differently from "200 of 1000".
  const imp = gsc.queries_stored_impressions;
  const share =
    Number.isFinite(imp) && gsc.impressions28d > 0 ? ` (${((imp / gsc.impressions28d) * 100).toFixed(1)}% of impressions)` : "";
  return `showing ${stored} of ${atLeast}${seen} queries${share} — arrivals outside that set are not visible`;
}

/**
 * Pages that earn impressions and no clicks at all.
 *
 * This is the one question a query-dimension pull cannot answer. Summing
 * query rows by page does not substitute: the query pull is capped at the top
 * 200 by clicks, so a page whose every query is a zero-click long-tail row is
 * exactly the page most likely to be missing from it. Hence the page dimension.
 *
 * Report-only, and deliberately NOT an experiment candidate: zero clicks across
 * a whole page is usually a ranking or local-entity problem, not a snippet
 * problem, and a title rewrite aimed at it would be a guess. The loop's job here
 * is to name the page and stop.
 */
export function silentPages(today) {
  if (!today.gsc?.available) return { measured: false, rows: [], total: 0 };
  const pages = today.gsc.top_pages;
  // Snapshots written before the page dimension existed have no top_pages key at
  // all. That is not "zero silent pages" — it is not measured, and it says so.
  if (!Array.isArray(pages)) return { measured: false, rows: [], total: 0, reason: "page dimension not in this snapshot" };
  const all = pages
    .filter((p) => p.clicks === 0 && p.impressions >= SILENT_PAGE_MIN_IMPRESSIONS)
    .sort((a, b) => b.impressions - a.impressions);
  return { measured: true, rows: all.slice(0, SILENT_PAGE_MAX_ROWS), total: all.length };
}

/** Normalize a URL for comparison — trailing slash and scheme noise only. */
function samePage(a, b) {
  if (!a || !b) return false;
  const norm = (u) => String(u).replace(/^https?:\/\//, "").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/**
 * Is this query/page already under a running experiment?
 *
 * Matching on EITHER query or page, not both: an experiment rewrites a page's
 * title/description, which moves every query that page ranks for — so a sibling
 * query on the same page is equally contaminated and equally un-actionable.
 */
function activeExperimentFor(query, page, experiments) {
  return (experiments || []).find(
    (e) => (e.query && e.query.toLowerCase() === String(query).toLowerCase()) || samePage(e.page, page),
  ) || null;
}

/**
 * Page-one queries whose measured CTR sits under the positional expectation — experiment fodder.
 *
 * Candidates whose page is already under a RUNNING experiment are moved to
 * `suppressed` rather than dropped. Recommending a title/meta rewrite on a page
 * mid-experiment would destroy the measurement it is halfway through producing,
 * and the compliance gate's audit-seo-experiments surfaceContract would reject
 * the edit anyway. Reporting the suppression follows the same no-silent-caps
 * rule as the issue-URL cap: a bounded readout must say what it bounded.
 */
function experimentCandidates(today, experiments = []) {
  if (!today.gsc?.available) return { rows: [], suppressed: [] };
  const scored = (today.gsc.top_queries || [])
    .filter((q) => q.position >= QUICK_WIN_MIN_POS && q.position <= QUICK_WIN_MAX_POS && q.impressions >= CANDIDATE_MIN_IMPRESSIONS)
    .map((q) => ({ ...q, ctr: q.impressions > 0 ? q.clicks / q.impressions : 0, expectedCtr: expectedCtr(q.position) }))
    .filter((q) => q.ctr < q.expectedCtr)
    .sort((a, b) => b.impressions - a.impressions)
    .map((q) => ({ ...q, page: today.gsc.top_query_pages?.[q.query] || null }));

  const rows = [];
  const suppressed = [];
  for (const q of scored) {
    const exp = activeExperimentFor(q.query, q.page, experiments);
    if (exp) suppressed.push({ ...q, experimentId: exp.id, earliestEvaluationAt: exp.earliestEvaluationAt || null });
    else if (rows.length < 5) rows.push(q);
  }
  return { rows, suppressed };
}

/**
 * Running experiments from data/seo-experiments/*.json.
 *
 * Kept out of computeDiff so the diff stays pure and testable; the caller reads
 * the directory and passes the result in. A malformed file is skipped rather
 * than crashing the run — a bad experiment record must not cost us the day's
 * measurement.
 */
export function readRunningExperiments(dir) {
  let names = [];
  try {
    names = fs.readdirSync(dir).filter((n) => n.endsWith(".json"));
  } catch {
    return []; // no experiments directory in this market — fine
  }
  const out = [];
  for (const name of names) {
    try {
      const e = JSON.parse(fs.readFileSync(path.join(dir, name), "utf8"));
      if (e?.status !== "running") continue;
      out.push({
        id: e.id || name,
        query: e.query || null,
        page: e.page || null,
        earliestEvaluationAt: e.measurement?.earliestEvaluationAt || null,
      });
    } catch {
      console.error(`[seo-diff] skipping unreadable experiment ${name}`);
    }
  }
  return out;
}

export function computeDiff(today, previous, { experiments = [] } = {}) {
  const cand = experimentCandidates(today, experiments);
  if (!previous) {
    return {
      first: true,
      today,
      quickWins: quickWins(today),
      silentPages: silentPages(today),
      candidates: cand.rows,
      candidatesSuppressed: cand.suppressed,
    };
  }
  return {
    first: false,
    today,
    previous,
    silentPages: silentPages(today),
    regressions: {
      rankDrops: rankDrops(today, previous),
      newErrorIssues: newErrorIssues(today, previous),
      gscWoW: gscWeekOverWeek(today, previous),
    },
    quickWins: quickWins(today),
    newQueries: newQueries(today, previous),
    candidates: cand.rows,
    candidatesSuppressed: cand.suppressed,
  };
}

function gscLine(s) {
  if (!s.gsc?.available) return `GSC: not measured (${s.gsc?.reason || "unavailable"})`;
  const w = s.gsc.window ? ` (${s.gsc.window.startDate} → ${s.gsc.window.endDate}; window ends ~3 days back)` : " (28 days)";
  // Coverage rides on the totals line, not just the new-queries section — that
  // section needs two snapshots, and a first run with 2.5% query coverage must
  // not read as a complete picture.
  const cov = queryCoverageCaveat(s.gsc);
  return `GSC: ${s.gsc.clicks28d} clicks / ${s.gsc.impressions28d} impressions${w}${cov ? `\nQuery coverage: ${cov}.` : ""}`;
}

export function renderReadout(diff, { deadman = null, now = new Date() } = {}) {
  const s = diff.today;
  const time = new Intl.DateTimeFormat("en-GB", { timeZone: "America/Denver", hour: "2-digit", minute: "2-digit" }).format(now);
  const lines = [`## ${s.date} ${time} — seo loop`, ""];

  // The deadman warning is the FIRST line after the heading, never softened or postponed.
  if (deadman) lines.push(`**A scheduled run appears to have been missed** (previous snapshot: ${deadman.previousDate}, ~${deadman.gapHours}h ago).`, "");

  const errors = (s.crawl?.issues || []).filter((i) => i.severity === "error");
  const errUrls = errors.reduce((n, i) => n + i.count, 0);
  lines.push(`Crawl: ${s.crawl.pages} pages (${s.crawl.indexable_pages ?? "?"} indexable) · ${errors.length} error issue types / ${errUrls} URLs · fetched ${s.crawl.fetched_at || "n/a"}`);

  if (diff.first) {
    lines.push("First snapshot — no previous run to compare against. Absolutes only:");
    for (const i of (s.crawl?.issues || []).slice(0, 8)) {
      lines.push(`- ${i.type} (${i.severity}): ${i.count} URL${i.count === 1 ? "" : "s"}${i.urls_truncated ? " (list capped at 50)" : ""}`);
    }
    lines.push(gscLine(s));
  } else {
    const { rankDrops: rd, newErrorIssues: nei, gscWoW } = diff.regressions;
    lines.push(`Diff vs ${diff.previous.date}:`);
    lines.push("", "### Regressions");
    if (nei.length === 0) lines.push("- No new error-severity crawl issues.");
    for (const i of nei) {
      const shown = i.urls.slice(0, 3).join(", ");
      lines.push(`- NEW ${i.type}: ${i.urls.length} URL${i.urls.length === 1 ? "" : "s"} — ${shown}${i.urls.length > 3 ? ", …" : ""}`);
    }
    if (!rd.measured) lines.push("- Rank movement: not measured — no rank tracker configured");
    else if (rd.drops.length === 0) lines.push(`- Rank drops: none (${rd.unmeasured} keyword${rd.unmeasured === 1 ? "" : "s"} unmeasured)`);
    else for (const d of rd.drops) lines.push(`- Rank drop: "${d.keyword}" ${d.from} → ${d.to}`);
    if (!gscWoW.measured) lines.push("- GSC clicks week-over-week: not measured");
    else lines.push(`- GSC clicks WoW (${gscWoW.method}): ${gscWoW.prior} → ${gscWoW.recent}${gscWoW.dropped ? " — **DOWN ≥20%**" : " (no ≥20% drop)"}`);

    lines.push("", "### Quick wins (positions 4–15)");
    if (diff.quickWins.source === "not-measured") lines.push("- Not measured — needs Search Console or a rank tracker.");
    else if (diff.quickWins.rows.length === 0) lines.push("- Nothing in the 4–15 band this window.");
    else if (diff.quickWins.source === "gsc") {
      for (const q of diff.quickWins.rows.slice(0, 5)) {
        lines.push(`- "${q.query}" pos ${q.position}, ${q.impressions} impr, ${q.clicks} clicks${q.page ? ` → ${q.page}` : ""}`);
      }
    } else {
      for (const q of diff.quickWins.rows.slice(0, 5)) lines.push(`- "${q.keyword}" pos ${q.position}${q.url ? ` → ${q.url}` : ""}`);
    }

    lines.push("", "### New queries");
    if (!diff.newQueries.measured) lines.push("- Not measured — needs Search Console on both snapshots.");
    else if (diff.newQueries.rows.length === 0) lines.push("- None in the top 200.");
    else {
      for (const q of diff.newQueries.rows.slice(0, 5)) lines.push(`- "${q.query}" pos ${q.position}, ${q.impressions} impr, ${q.clicks} clicks`);
      if (diff.newQueries.caveat) lines.push(`- Caveat: ${diff.newQueries.caveat}`);
    }
    lines.push("", gscLine(s));
  }

  // Pages measured as earning impressions and zero clicks. Rendered for the
  // first snapshot too — it is an absolute, not a delta.
  const sp = diff.silentPages;
  if (sp) {
    lines.push("", `### Pages earning impressions but zero clicks (≥${SILENT_PAGE_MIN_IMPRESSIONS} impr)`);
    if (!sp.measured) {
      lines.push(`- Not measured${sp.reason ? ` — ${sp.reason}` : " — needs Search Console"}.`);
    } else if (sp.rows.length === 0) {
      lines.push("- None.");
    } else {
      for (const p of sp.rows) {
        lines.push(`- ${p.page} — ${p.impressions} impr, 0 clicks, avg position ${p.position}`);
      }
      if (sp.total > sp.rows.length) lines.push(`- …and ${sp.total - sp.rows.length} more (list capped at ${SILENT_PAGE_MAX_ROWS}).`);
      lines.push("- Zero clicks across a whole page points at ranking or local-entity signals, not the snippet. Diagnose before editing.");
    }
  }

  // Say what was withheld and why. A silently shortened list reads as "nothing
  // else qualified", which is a different and false claim.
  if (diff.candidatesSuppressed?.length > 0) {
    lines.push("", "### Held back — already under a running experiment (do NOT edit these pages)");
    for (const c of diff.candidatesSuppressed) {
      lines.push(
        `- "${c.query}" pos ${c.position}, ${c.impressions} impr — experiment \`${c.experimentId}\`` +
          (c.earliestEvaluationAt ? `, earliest evaluation ${String(c.earliestEvaluationAt).slice(0, 10)}` : "") +
          ". Rewriting the page now destroys the measurement in flight.",
      );
    }
  }
  if (diff.candidates.length > 0) {
    lines.push("", "### Experiment candidates (frame-seo-experiment.v1 — human decision, behind the compliance gate)");
    for (const c of diff.candidates) {
      lines.push(
        `- "${c.query}" pos ${c.position}, ${c.impressions} impr, ctr ${(c.ctr * 100).toFixed(1)}% < expected ${(c.expectedCtr * 100).toFixed(1)}%${c.page ? ` — page ${c.page}` : ""} (reason: page_one_low_ctr)`,
      );
    }
  }

  if (s.ai_visibility?.measured) {
    lines.push("", `AI visibility: ${s.ai_visibility.cited} of ${s.ai_visibility.prompts_ok} prompts cited (search-results presence proxy — not proof of assistant citation)`);
  } else {
    lines.push("", "AI visibility: not measured");
  }
  if ((s.ranks || []).length === 0) lines.push("Tracked keywords: none — add data/seo/keywords.json to track a list");
  return `${lines.join("\n")}\n`;
}

export function checkDeadman(todayDate, previous, deadmanHours) {
  if (!previous) return null;
  const gapHours = Math.round((Date.parse(todayDate) - Date.parse(previous.date)) / 3600000);
  return gapHours > deadmanHours ? { previousDate: previous.date, gapHours } : null;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const date = args.date || todayInDenver();
  const { today, previous } = findSnapshots(date);
  if (!today) {
    console.error(`[seo-diff] no snapshot for ${date} — run scripts/seo-snapshot.mjs first`);
    process.exit(2);
  }
  const deadman = checkDeadman(date, previous, args.deadmanHours);
  if (deadman && process.env.GITHUB_ACTIONS === "true") {
    console.log(`::warning::SEO loop missed a run — previous snapshot ${deadman.previousDate} (~${deadman.gapHours}h ago)`);
  }
  const experiments = readRunningExperiments(path.join(root, "data", "seo-experiments"));
  const diff = computeDiff(today, previous, { experiments });
  const readout = renderReadout(diff, { deadman });

  if (args.write) {
    fs.mkdirSync(READOUT_DIR, { recursive: true });
    const file = path.join(READOUT_DIR, `${date}.md`);
    // Append, never overwrite — a second run on the same day adds a section.
    const existing = fs.existsSync(file) ? `${fs.readFileSync(file, "utf8").replace(/\n+$/, "\n")}\n` : "";
    fs.writeFileSync(file, existing + readout);
    console.error(`[seo-diff] wrote ${path.relative(root, file)}`);
  }
  console.log(readout);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[seo-diff] ${err.stack || err}`);
    process.exit(2);
  });
}
