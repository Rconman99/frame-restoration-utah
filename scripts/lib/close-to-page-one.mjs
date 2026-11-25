/**
 * Close-to-page-one selection for the Utah SEO/blog loop.
 *
 * Input is measured Search Console query+page rows only. This module does not
 * estimate search volume, positions, clicks, or impressions. A row missing any
 * of those fields is rejected, not filled with zero.
 *
 * Position band is inclusive: 5 <= average position <= 15.
 * Pages are ranked by the sum of those qualifying query-row impressions.
 * That sum is not a page-total and not a keyword-volume estimate.
 */

export const POSITION_MIN = 5;
export const POSITION_MAX = 15;
export const TOP_PAGE_COUNT = 3;
export const RECENT_EDIT_DAYS = 60;
export const DAY_MS = 86400000;
export const SITE_HOSTS = new Set(["www.framerestorationutah.com", "framerestorationutah.com"]);

export function normalizePageUrl(page) {
  let url;
  try {
    url = new URL(String(page));
  } catch {
    return null;
  }
  const host = url.hostname.toLowerCase();
  if (!SITE_HOSTS.has(host)) return null;
  url.hash = "";
  url.search = "";
  let pathname = url.pathname;
  if (pathname.length > 1 && pathname.endsWith("/")) pathname = pathname.slice(0, -1);
  return `https://www.framerestorationutah.com${pathname}`;
}

export function urlToRepoPath(pageUrl, exists) {
  const normalized = normalizePageUrl(pageUrl);
  if (!normalized) return null;
  const pathname = new URL(normalized).pathname;
  const rel = pathname === "/" ? "" : pathname.replace(/^\//, "");
  const candidates = rel ? [`${rel}.html`, `${rel}/index.html`, rel] : ["index.html"];
  for (const candidate of candidates) {
    if (exists(candidate)) return candidate;
  }
  return null;
}

export function isEditedWithinDays(editedAtIso, now, days = RECENT_EDIT_DAYS) {
  const edited = Date.parse(editedAtIso);
  if (!Number.isFinite(edited)) return false;
  const age = now.getTime() - edited;
  if (age < 0) return true;
  return age < days * DAY_MS;
}

function roundPosition(position) {
  return Math.round(position * 10) / 10;
}

/**
 * Accept one measured row or reject it with a bucket. Outside the position
 * band is a reject, not a failure of the pull.
 */
export function acceptRow(raw) {
  if (!raw || typeof raw !== "object") return { ok: false, bucket: "incomplete" };
  const query = typeof raw.query === "string" ? raw.query.trim() : "";
  if (!query) return { ok: false, bucket: "incomplete" };
  if (raw.page && !normalizePageUrl(raw.page)) return { ok: false, bucket: "unmappedHost" };
  const page = normalizePageUrl(raw.page);
  if (!page) return { ok: false, bucket: "incomplete" };
  const { clicks, impressions, position } = raw;
  if (![clicks, impressions, position].every(Number.isFinite)) return { ok: false, bucket: "incomplete" };
  if (clicks < 0 || impressions <= 0 || clicks > impressions || position <= 0) return { ok: false, bucket: "invalid" };
  if (position < POSITION_MIN || position > POSITION_MAX) return { ok: false, bucket: "outsideBand" };
  return {
    ok: true,
    row: { query, page, clicks, impressions, position: roundPosition(position) },
  };
}

export function groupByPage(rows) {
  const map = new Map();
  for (const row of rows) {
    const group = map.get(row.page) || {
      page: row.page,
      queries: [],
      qualifyingImpressions: 0,
      qualifyingClicks: 0,
    };
    group.queries.push(row);
    group.qualifyingImpressions += row.impressions;
    group.qualifyingClicks += row.clicks;
    map.set(row.page, group);
  }
  for (const group of map.values()) {
    group.queries.sort((a, b) => b.impressions - a.impressions || a.query.localeCompare(b.query));
  }
  return [...map.values()].sort(
    (a, b) => b.qualifyingImpressions - a.qualifyingImpressions || b.qualifyingClicks - a.qualifyingClicks || a.page.localeCompare(b.page),
  );
}

export function rankingPagesForQuery(rows, query) {
  const key = String(query || "").trim().toLowerCase();
  const byPage = new Map();
  for (const row of rows) {
    if (row.query.trim().toLowerCase() !== key) continue;
    const prev = byPage.get(row.page);
    if (!prev || row.impressions > prev.impressions) byPage.set(row.page, row);
  }
  return [...byPage.values()].sort((a, b) => b.impressions - a.impressions || a.page.localeCompare(b.page));
}

/**
 * A new post is allowed only when no measured row ranks for the query.
 * Otherwise the task is a refresh of the page with the most impressions.
 */
export function classifyTopic(query, rows) {
  const ranking = rankingPagesForQuery(rows, query);
  if (ranking.length) {
    return {
      kind: "page-refresh",
      query: ranking[0].query,
      newTopicBlocked: true,
      reason: "existing-page-already-ranks",
      page: ranking[0].page,
      rankingPages: ranking.map((row) => ({
        page: row.page,
        clicks: row.clicks,
        impressions: row.impressions,
        position: row.position,
      })),
      draftable: false,
      status: "needs-review",
    };
  }
  const text = String(query || "").trim();
  return {
    kind: "candidate-topic",
    query: text,
    keyword: text,
    newTopicBlocked: false,
    reason: "no-ranking-page-in-measured-rows",
    page: null,
    rankingPages: [],
    draftable: false,
    status: "needs-review",
    autoPublish: false,
  };
}

export function selectPages(groups, { now, pathForPage, editedAtByPath, top = TOP_PAGE_COUNT, days = RECENT_EDIT_DAYS }) {
  const skipped = [];
  const eligible = [];
  for (const group of groups) {
    const repoPath = pathForPage(group.page);
    if (!repoPath) {
      skipped.push({ page: group.page, repoPath: null, reason: "no-repo-file", qualifyingImpressions: group.qualifyingImpressions });
      continue;
    }
    const editedAt = editedAtByPath(repoPath);
    const parsed = editedAt ? Date.parse(editedAt) : NaN;
    if (editedAt && Number.isFinite(parsed) && isEditedWithinDays(editedAt, now, days)) {
      skipped.push({
        page: group.page,
        repoPath,
        editedAt,
        reason: "edited-within-60-days",
        qualifyingImpressions: group.qualifyingImpressions,
      });
      continue;
    }
    eligible.push({
      ...group,
      repoPath,
      lastEditedAt: Number.isFinite(parsed) ? editedAt : null,
      recency: !editedAt ? "not-in-git-history" : Number.isFinite(parsed) ? "eligible" : "unreadable-git-date",
    });
  }
  return { selected: eligible.slice(0, top), skipped, eligibleCount: eligible.length };
}

function pageChanges(group) {
  return group.queries.map((query) => ({
    action: "add-or-revise-section",
    heading: query.query,
    measured: { clicks: query.clicks, impressions: query.impressions, position: query.position },
    instruction:
      `On ${group.page}, add or revise a section whose heading is the exact query "${query.query}" ` +
      `and answer that query in the first paragraph of the section. ` +
      `Measured on this page: position ${query.position}, ${query.impressions} impressions, ${query.clicks} clicks. ` +
      `Do not add a new post for this query.`,
  }));
}

export function buildQueue({
  rows,
  window,
  siteUrl,
  truncated = false,
  now,
  pathForPage,
  editedAtByPath,
  top = TOP_PAGE_COUNT,
}) {
  const accepted = [];
  const rejected = { outsideBand: 0, incomplete: 0, invalid: 0, unmappedHost: 0 };
  for (const raw of rows || []) {
    const result = acceptRow(raw);
    if (!result.ok) {
      rejected[result.bucket] = (rejected[result.bucket] || 0) + 1;
      continue;
    }
    accepted.push(result.row);
  }

  const groups = groupByPage(accepted);
  const { selected, skipped, eligibleCount } = selectPages(groups, { now, pathForPage, editedAtByPath, top });

  const tasks = selected.map((group) => ({
    kind: "page-refresh",
    status: "needs-review",
    draftable: false,
    autoPublish: false,
    publicMutationAuthorized: false,
    page: group.page,
    repoPath: group.repoPath,
    lastEditedAt: group.lastEditedAt,
    recency: group.recency,
    qualifyingImpressions: group.qualifyingImpressions,
    qualifyingClicks: group.qualifyingClicks,
    impressionsAre: "sum of measured query rows at positions 5-15 on this page, not a page total and not a search-volume estimate",
    queries: group.queries,
    changes: pageChanges(group),
  }));

  const seenQueries = new Map();
  for (const row of accepted) {
    const key = row.query.toLowerCase();
    if (!seenQueries.has(key)) seenQueries.set(key, row.query);
  }
  const cannibalization = [];
  const candidateTopics = [];
  for (const query of seenQueries.values()) {
    const decision = classifyTopic(query, accepted);
    if (decision.newTopicBlocked && decision.rankingPages.length > 1) {
      cannibalization.push({
        query: decision.query,
        decision: "page-refresh",
        newTopicBlocked: true,
        improvePage: decision.page,
        rankingPages: decision.rankingPages,
        instruction: "An existing page already ranks for this query. Improve that page. Do not write a new post.",
      });
    }
    if (!decision.newTopicBlocked) candidateTopics.push(decision);
  }
  cannibalization.sort((a, b) => a.query.localeCompare(b.query));
  candidateTopics.sort((a, b) => a.query.localeCompare(b.query));

  return {
    artifact: "frame-utah-close-to-page-one",
    version: 1,
    generatedAt: now.toISOString(),
    source: "google-search-console",
    siteUrl: siteUrl || null,
    window: window || null,
    positionBand: { min: POSITION_MIN, max: POSITION_MAX, inclusive: true },
    truncated: Boolean(truncated),
    truncationNote: truncated
      ? "The Search Analytics query+page pull hit its row cap. Positions outside the returned rows were not measured and are not estimated."
      : "Every returned query+page row was considered. Search Console still omits some rare queries; those omissions are not estimated.",
    rowCounts: { fetched: (rows || []).length, accepted: accepted.length, rejected },
    pagesConsidered: groups.length,
    eligiblePages: eligibleCount,
    publicMutationAuthorized: false,
    autoPublish: false,
    approval: "needs-review",
    tasks,
    skippedPages: skipped,
    cannibalization,
    candidateTopics,
    note: "Publishing stays off. Page-refresh tasks edit the ranking page. A candidate topic is recorded only when no measured page ranks for that query.",
  };
}

export function renderQueueMarkdown(report) {
  const window = report.window
    ? `${report.window.startDate} → ${report.window.endDate}`
    : "not measured";
  const lines = [
    "# Close to page one",
    "",
    `Search Console window: ${window}. Position band: ${report.positionBand.min}–${report.positionBand.max}, inclusive.`,
    "",
    report.truncationNote,
    "",
    "These are review tasks. Nothing in this report publishes a page.",
    "",
    "## Page refreshes",
    "",
  ];
  if (!report.tasks.length) {
    lines.push("No eligible page in the measured band.", "");
  }
  for (const task of report.tasks) {
    lines.push(`### ${task.page}`, "");
    lines.push(`- File: \`${task.repoPath}\``);
    lines.push(`- Last git edit: ${task.lastEditedAt || task.recency}`);
    lines.push(`- Qualifying impressions (sum of these rows): ${task.qualifyingImpressions}`);
    lines.push(`- Qualifying clicks (sum of these rows): ${task.qualifyingClicks}`);
    lines.push(`- Status: ${task.status}. Not a new post.`, "");
    lines.push("| Query | Clicks | Impressions | Position |");
    lines.push("| --- | ---: | ---: | ---: |");
    for (const query of task.queries) {
      lines.push(`| ${query.query.replace(/\|/g, "\\|")} | ${query.clicks} | ${query.impressions} | ${query.position} |`);
    }
    lines.push("");
    for (const change of task.changes) lines.push(`- ${change.instruction}`);
    lines.push("");
  }
  lines.push("## Skipped", "");
  if (!report.skippedPages.length) lines.push("None.", "");
  for (const skip of report.skippedPages) {
    lines.push(`- ${skip.page} — ${skip.reason}${skip.editedAt ? ` (${skip.editedAt})` : ""}`);
  }
  lines.push("", "## Cannibalization", "");
  if (!report.cannibalization.length) {
    lines.push("No measured query in this band ranked on more than one page.", "");
  }
  for (const item of report.cannibalization) {
    const pages = item.rankingPages.map((row) => `${row.page} (${row.impressions} impressions, position ${row.position})`).join("; ");
    lines.push(`- "${item.query}" already ranks on ${pages}. Improve ${item.improvePage}. Do not write a new post.`);
  }
  lines.push("", "## Candidate topics", "");
  if (!report.candidateTopics.length) {
    lines.push("None. Every measured query in this band already has a ranking page.", "");
  }
  for (const topic of report.candidateTopics) {
    lines.push(`- ${topic.query} — ${topic.reason}. Status ${topic.status}. Draftable: ${topic.draftable}.`);
  }
  lines.push("");
  return lines.join("\n");
}
