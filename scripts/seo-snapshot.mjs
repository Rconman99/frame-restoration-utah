#!/usr/bin/env node
/**
 * Daily SEO snapshot for Frame Restoration Utah — writes
 * data/seo/snapshots/<YYYY-MM-DD>.json in the seo-god snapshot contract shape,
 * from three sources: a live crawl (scripts/seo-crawl.mjs), Google Search
 * Console (scripts/lib/gsc.mjs, optional), and the committed fixed-panel
 * DataForSEO reports under data/rank-tracker/.
 *
 * Contract (ported from the seo-god skill's measure phase — key names are a
 * contract the diff reads; do not rename or drop):
 *   { date, source, site, crawl:{pages, issues}, ranks:[], gsc:{available,
 *     clicks28d, impressions28d, top_queries}, ai_visibility:{measured, ...} }
 * Extra keys this loop adds (documented in docs/seo/SEO-LOOP.md): gsc.by_date,
 * gsc.top_query_pages, gsc.top_pages, gsc.window, gsc.reason, gsc.truncated, crawl.by_status,
 * crawl.indexable_pages, crawl.fetched_at. Consumers must preserve keys they
 * do not recognise.
 *
 * Honesty rules (non-negotiable):
 *   - A failed crawl writes NO snapshot and exits non-zero. A snapshot with
 *     pages:0, issues:[] because the crawl never ran is a fabricated clean
 *     bill of health tomorrow's diff would read as "every issue resolved".
 *   - GSC failure or absence -> gsc.available:false with inert zeros and a
 *     `reason`. available:false means NOT MEASURED, never "zero clicks".
 *   - rank rows distinguish unmeasured from measured-outside-depth. A null
 *     position with measured:true and outsideTop:30 means >30, never unknown.
 *   - Same-day rerun is a read-modify-write: an ai_visibility block with
 *     measured:true is another process's measurement and is PRESERVED.
 *
 * Usage:
 *   node scripts/seo-snapshot.mjs [--site https://www.framerestorationutah.com]
 *        [--max-pages 500] [--date YYYY-MM-DD]
 * Env: GSC_SERVICE_ACCOUNT_JSON (optional), GSC_SITE_URL (optional).
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";
import { crawlSite } from "./seo-crawl.mjs";
import { fetchGscSections } from "./lib/gsc.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_DIR = path.join(root, "data", "seo", "snapshots");
const KEYWORDS_FILE = path.join(root, "data", "seo", "keywords.json");
const RANK_REGISTRY_FILE = path.join(root, "data", "rank-tracker", "panels.json");
const DEFAULT_SITE = "https://www.framerestorationutah.com";

/** Ops timezone (crons + PostHog are Denver). Date = the day the run fired there. */
export function todayInDenver(now = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "America/Denver" }).format(now);
}

function parseArgs(argv) {
  const args = {};
  for (let i = 0; i < argv.length; i += 1) {
    if (argv[i] === "--site") args.site = argv[++i];
    else if (argv[i] === "--max-pages") args.maxPages = Number(argv[++i]);
    else if (argv[i] === "--date") args.date = argv[++i];
    else if (argv[i] === "--canonical-host") args.canonicalHost = argv[++i];
  }
  return args;
}

function readLegacyKeywords(keywordsFile = KEYWORDS_FILE) {
  if (!fs.existsSync(keywordsFile)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(keywordsFile, "utf8"));
    return Array.isArray(parsed.keywords) ? parsed.keywords.filter((k) => typeof k === "string") : [];
  } catch (err) {
    console.error(`[seo-snapshot] data/seo/keywords.json unreadable (${err.message}) — tracking nothing this run`);
    return [];
  }
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function unmeasuredRows(config, panelId, reason) {
  return (config.keywords || []).map(({ keyword }) => ({
    keyword,
    position: null,
    url: "",
    measured: false,
    outsideTop: null,
    panelId,
    city: config.city,
    source: "dataforseo-task-queue",
    reason,
  }));
}

/**
 * Read the complete committed Salt Lake Valley panel without making a provider
 * call. The weekly rank workflow owns these reports; the daily SEO loop only
 * consumes them. Any missing/mismatched panel stays explicit and unmeasured.
 */
export function readTrackedRanks({ rootDir = root } = {}) {
  const registryFile = path.join(rootDir, path.relative(root, RANK_REGISTRY_FILE));
  const keywordsFile = path.join(rootDir, path.relative(root, KEYWORDS_FILE));

  if (!fs.existsSync(registryFile)) {
    const ranks = readLegacyKeywords(keywordsFile).map((keyword) => ({
      keyword,
      position: null,
      url: "",
      measured: false,
      outsideTop: null,
      source: "legacy-keyword-list",
      reason: "rank_registry_missing",
    }));
    return {
      ranks,
      measurement: {
        available: false,
        source: ranks.length ? "legacy-keyword-list" : "not-configured",
        panelsExpected: 0,
        panelsMeasured: 0,
        queriesExpected: ranks.length,
        queriesMeasured: 0,
        reason: ranks.length ? "rank_registry_missing" : "not_configured",
        issues: [],
      },
    };
  }

  let registry;
  try {
    registry = readJson(registryFile);
  } catch (err) {
    return {
      ranks: [],
      measurement: {
        available: false,
        source: "dataforseo-task-queue",
        panelsExpected: 0,
        panelsMeasured: 0,
        queriesExpected: 0,
        queriesMeasured: 0,
        reason: "rank_registry_unreadable",
        issues: [`${path.relative(rootDir, registryFile)}: ${err.message}`],
      },
    };
  }

  const panels = Array.isArray(registry.panels) ? registry.panels.filter((panel) => panel.status === "active") : [];
  const ranks = [];
  const issues = [];
  const observedAt = [];
  let panelsMeasured = 0;
  let queriesExpected = 0;
  let queriesMeasured = 0;

  if (panels.length === 0) issues.push("registry: no_active_panels");

  for (const panel of panels) {
    const configFile = path.resolve(rootDir, panel.configPath || "");
    const configRel = path.relative(rootDir, configFile);
    if (!panel.id || !panel.configPath || configRel.startsWith("..") || path.isAbsolute(configRel)) {
      issues.push(`${panel.id || "unnamed-panel"}: invalid_config_path`);
      continue;
    }
    let config;
    try {
      config = readJson(configFile);
    } catch (err) {
      issues.push(`${panel.id}: config unreadable (${err.message})`);
      continue;
    }

    const keywords = Array.isArray(config.keywords) ? config.keywords : [];
    queriesExpected += keywords.length;
    const validDepth = Number.isInteger(config.depth) && config.depth > 0;
    if (config.panelId !== panel.id || keywords.length === 0 || !validDepth) {
      const reason = config.panelId !== panel.id ? "panel_id_mismatch" : keywords.length === 0 ? "no_keywords" : "invalid_depth";
      issues.push(`${panel.id}: ${reason}`);
      ranks.push(...unmeasuredRows(config, panel.id, reason));
      continue;
    }

    const reportFile = path.join(path.dirname(configFile), "latest.json");
    let report;
    try {
      report = readJson(reportFile);
    } catch (err) {
      const reason = "latest_report_unreadable";
      issues.push(`${panel.id}: ${reason} (${err.message})`);
      ranks.push(...unmeasuredRows(config, panel.id, reason));
      continue;
    }

    if (report.panelId !== panel.id || !Array.isArray(report.results)) {
      const reason = report.panelId !== panel.id ? "latest_panel_id_mismatch" : "latest_results_missing";
      issues.push(`${panel.id}: ${reason}`);
      ranks.push(...unmeasuredRows(config, panel.id, reason));
      continue;
    }

    const byId = new Map(report.results.map((row) => [row.id, row]));
    const validObservedAt = typeof report.observedAt === "string" && Number.isFinite(Date.parse(report.observedAt));
    const complete = keywords.every(({ id, keyword }) => {
      const row = byId.get(id);
      const validOrganicRank = row?.organicRank === null
        || (Number.isInteger(row?.organicRank) && row.organicRank >= 1 && row.organicRank <= config.depth);
      const validRankingUrl = row?.rankingUrl === null || typeof row?.rankingUrl === "string";
      return row && row.keyword === keyword && validOrganicRank && validRankingUrl;
    });
    if (!complete || byId.size !== keywords.length || !validObservedAt) {
      const reason = "latest_report_incomplete";
      issues.push(`${panel.id}: ${reason}`);
      ranks.push(...unmeasuredRows(config, panel.id, reason));
      continue;
    }

    panelsMeasured += 1;
    queriesMeasured += keywords.length;
    observedAt.push(report.observedAt);
    for (const { id, keyword } of keywords) {
      const row = byId.get(id);
      ranks.push({
        keyword,
        position: row.organicRank,
        url: row.rankingUrl || "",
        measured: true,
        outsideTop: row.organicRank === null ? config.depth : null,
        panelId: panel.id,
        city: config.city,
        source: "dataforseo-task-queue",
        observedAt: report.observedAt,
        mapPackRank: row.mapPackRank,
        aiOverviewPresent: row.aiOverviewPresent === true,
        aiOverviewCited: row.aiOverviewCited === true,
      });
    }
  }

  return {
    ranks,
    measurement: {
      available: panels.length > 0 && issues.length === 0 && panelsMeasured === panels.length,
      source: "dataforseo-task-queue",
      registryId: registry.registryId || null,
      panelsExpected: panels.length,
      panelsMeasured,
      queriesExpected,
      queriesMeasured,
      oldestObservedAt: observedAt.length ? [...observedAt].sort()[0] : null,
      newestObservedAt: observedAt.length ? [...observedAt].sort().at(-1) : null,
      reason: issues.length ? (panels.length === 0 ? "no_active_panels" : "incomplete_panel") : null,
      issues,
    },
  };
}

// crawlImpl / gscFetchImpl are seams for tests only; production always uses the
// real crawler and the real fetch. Without them the crawl-to-snapshot path can
// only be exercised against live network, which is why the field-drop bug this
// file's test now covers went unnoticed by two passing unit suites.
export async function buildSnapshot({
  site = DEFAULT_SITE,
  maxPages = 500,
  date,
  canonicalHost,
  env = process.env,
  crawlImpl = crawlSite,
  gscFetchImpl,
  rankReadImpl = readTrackedRanks,
} = {}) {
  const snapDate = date || todayInDenver();

  // ---- Crawl (required — no crawl, no snapshot) ----
  const crawl = await crawlImpl({ site, maxPages, ...(canonicalHost ? { canonicalHost } : {}) });
  if (crawl.failed) {
    return { failed: true, reason: `crawl could not complete: ${crawl.reason}` };
  }

  // ---- GSC (optional — degrades to not-measured, never to zero-filled) ----
  let gsc = { available: false, clicks28d: 0, impressions28d: 0, top_queries: [], top_pages: [], reason: "not_configured" };
  try {
    const sections = await fetchGscSections({ env, ...(gscFetchImpl ? { fetchImpl: gscFetchImpl } : {}) });
    if (sections) {
      // Spread, do not enumerate. This was a hand-maintained field-by-field copy
      // and it silently dropped `queries_stored_impressions` when that field was
      // added — so the readout reported "showing 370 of 1426 queries" and omitted
      // the impression share, which was the whole point of measuring it. Every
      // field fetchGscSections returns is part of the snapshot contract; a new one
      // must carry through by default rather than by being remembered here.
      // `siteUrl` is kept deliberately: it records WHICH Search Console property
      // produced the numbers, which is the provenance check for a four-market loop.
      gsc = { available: true, ...sections };
    }
  } catch (err) {
    gsc = { available: false, clicks28d: 0, impressions28d: 0, top_queries: [], top_pages: [], reason: `api_error: ${err.message}` };
  }

  // ---- Ranks: consume the complete committed weekly matrix, no provider call ----
  const rankState = rankReadImpl();
  const ranks = rankState.ranks;

  const snapshot = {
    date: snapDate,
    source: "frame-seo-loop",
    site,
    crawl: {
      pages: crawl.pages,
      indexable_pages: crawl.indexable_pages,
      fetched_at: crawl.fetched_at,
      by_status: crawl.by_status,
      issues: crawl.issues,
      notes: crawl.notes,
    },
    ranks,
    rank_measurement: rankState.measurement,
    gsc,
    ai_visibility: { measured: false, prompts_ok: 0, cited: 0, competitors: {} },
  };

  return { snapshot };
}

export function writeSnapshot(snapshot, dir = SNAP_DIR) {
  fs.mkdirSync(dir, { recursive: true });
  const file = path.join(dir, `${snapshot.date}.json`);

  // Same-day rerun: read-modify-write. Preserve keys we do not recognise, and
  // preserve a measured ai_visibility block — that is another process's
  // measurement, and clobbering it back to defaults is the same lie as
  // zero-filling our own.
  let existing = null;
  if (fs.existsSync(file)) {
    try {
      existing = JSON.parse(fs.readFileSync(file, "utf8"));
    } catch {
      existing = null; // unparseable same-day file: our full write repairs it
    }
  }
  const merged = { ...(existing || {}), ...snapshot };
  if (existing?.ai_visibility?.measured === true) merged.ai_visibility = existing.ai_visibility;

  fs.writeFileSync(file, `${JSON.stringify(merged, null, 2)}\n`);
  return file;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  const result = await buildSnapshot(args);
  if (result.failed) {
    console.error(`[seo-snapshot] NO snapshot written — ${result.reason}`);
    process.exit(2);
  }
  const file = writeSnapshot(result.snapshot);
  const s = result.snapshot;
  const errors = s.crawl.issues.filter((i) => i.severity === "error").reduce((n, i) => n + i.count, 0);
  console.log(
    `[seo-snapshot] wrote ${path.relative(root, file)} — ${s.crawl.pages} pages, ${errors} error-severity URLs, ` +
      `GSC ${s.gsc.available ? `${s.gsc.clicks28d} clicks / ${s.gsc.impressions28d} impressions (28d)` : `not measured (${s.gsc.reason})`}, ` +
      `${s.rank_measurement?.queriesMeasured || 0}/${s.rank_measurement?.queriesExpected || s.ranks.length} rank queries measured`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[seo-snapshot] ${err.stack || err}`);
    process.exit(2);
  });
}
