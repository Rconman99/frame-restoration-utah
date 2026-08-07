#!/usr/bin/env node
/**
 * Daily SEO snapshot for Frame Restoration Utah TX — writes
 * data/seo/snapshots/<YYYY-MM-DD>.json in the seo-god snapshot contract shape,
 * from two sources: a live crawl (scripts/seo-crawl.mjs) and Google Search
 * Console (scripts/lib/gsc.mjs, optional).
 *
 * Contract (ported from the seo-god skill's measure phase — key names are a
 * contract the diff reads; do not rename or drop):
 *   { date, source, site, crawl:{pages, issues}, ranks:[], gsc:{available,
 *     clicks28d, impressions28d, top_queries}, ai_visibility:{measured, ...} }
 * Extra keys this loop adds (documented in docs/seo/SEO-LOOP.md): gsc.by_date,
 * gsc.top_query_pages, gsc.window, gsc.reason, gsc.truncated, crawl.by_status,
 * crawl.indexable_pages, crawl.fetched_at. Consumers must preserve keys they
 * do not recognise.
 *
 * Honesty rules (non-negotiable):
 *   - A failed crawl writes NO snapshot and exits non-zero. A snapshot with
 *     pages:0, issues:[] because the crawl never ran is a fabricated clean
 *     bill of health tomorrow's diff would read as "every issue resolved".
 *   - GSC failure or absence -> gsc.available:false with inert zeros and a
 *     `reason`. available:false means NOT MEASURED, never "zero clicks".
 *   - ranks positions are null until a real rank source exists — null means
 *     not measured, and the diff reports it in those words.
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

function readKeywords() {
  if (!fs.existsSync(KEYWORDS_FILE)) return [];
  try {
    const parsed = JSON.parse(fs.readFileSync(KEYWORDS_FILE, "utf8"));
    return Array.isArray(parsed.keywords) ? parsed.keywords.filter((k) => typeof k === "string") : [];
  } catch (err) {
    console.error(`[seo-snapshot] data/seo/keywords.json unreadable (${err.message}) — tracking nothing this run`);
    return [];
  }
}

export async function buildSnapshot({ site = DEFAULT_SITE, maxPages = 500, date, canonicalHost, env = process.env } = {}) {
  const snapDate = date || todayInDenver();

  // ---- Crawl (required — no crawl, no snapshot) ----
  const crawl = await crawlSite({ site, maxPages, ...(canonicalHost ? { canonicalHost } : {}) });
  if (crawl.failed) {
    return { failed: true, reason: `crawl could not complete: ${crawl.reason}` };
  }

  // ---- GSC (optional — degrades to not-measured, never to zero-filled) ----
  let gsc = { available: false, clicks28d: 0, impressions28d: 0, top_queries: [], reason: "not_configured" };
  try {
    const sections = await fetchGscSections({ env });
    if (sections) {
      gsc = {
        available: true,
        clicks28d: sections.clicks28d,
        impressions28d: sections.impressions28d,
        top_queries: sections.top_queries,
        by_date: sections.by_date,
        top_query_pages: sections.top_query_pages,
        window: sections.window,
        truncated: sections.truncated,
      };
    }
  } catch (err) {
    gsc = { available: false, clicks28d: 0, impressions28d: 0, top_queries: [], reason: `api_error: ${err.message}` };
  }

  // ---- Ranks: tracked keywords with no measured position -> null, honestly ----
  const ranks = readKeywords().map((keyword) => ({ keyword, position: null, url: "" }));

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
      `${s.ranks.length} tracked keywords (positions not measured)`,
  );
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[seo-snapshot] ${err.stack || err}`);
    process.exit(2);
  });
}
