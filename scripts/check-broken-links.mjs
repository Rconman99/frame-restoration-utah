#!/usr/bin/env node
/**
 * Live broken-link check for Frame Restoration Utah — the fetch-the-real-thing
 * half of the broken-link loop (static half: scripts/audit-links.mjs; Mac
 * entrypoint: scripts/broken-link-cron.sh; runbook: docs/seo/BROKEN-LINK-LOOP.md).
 *
 * Takes a public URL list (the live sitemap by default, or a file, or --url),
 * fetches each listed page on THIS market's host, and checks every link those
 * pages carry. Reports 404/410, 5xx, redirect loops/chains, network errors and
 * off-origin redirects, with the pages that carry each bad link.
 *
 * Market isolation (hard rule, not a preference):
 *   - `--site` must be this market's canonical host (data/route-factory/
 *     business.json canonical_host, or its bare apex) or a loopback fixture for
 *     tests. Anything else is refused with exit 2 before a single request.
 *   - A listed URL on another host is never fetched; it is reported under
 *     `seeds.off_market`.
 *   - A link to another host is never fetched either. External hosts are
 *     counted (so a cross-market link is visible) but no request leaves the
 *     market origin. A redirect that leaves the origin is recorded and not
 *     followed.
 *
 * Honesty rules (same contract as scripts/seo-crawl.mjs):
 *   - A URL that was not fetched produces neither an issue nor a clean bill.
 *   - Zero pages fetched is a failed run (exit 2), never "0 broken links".
 *
 * --dry-run is READ-ONLY: it fetches and prints the results but never writes a
 * report and never exits non-zero for findings (only for a run that could not
 * complete). Use it to eyeball a URL list before wiring the job.
 *
 * Usage:
 *   node scripts/check-broken-links.mjs --dry-run                        # live sitemap, read-only
 *   node scripts/check-broken-links.mjs --urls data/some-list.txt --dry-run
 *   node scripts/check-broken-links.mjs --url https://www.framerestorationutah.com/pages/roof-repair --dry-run
 *   node scripts/check-broken-links.mjs --sitemap sitemap.xml --out report.json --strict
 *
 * Options:
 *   --site <origin>      default https://<canonical_host>; must be a market host or loopback
 *   --urls <file>        newline-delimited URLs/paths, or a sitemap.xml (<loc>)
 *   --url <url>          one URL or path (repeatable)
 *   --sitemap [file]     seed from a sitemap file, or (no value) fetch <site>/sitemap.xml
 *                        [default when no --urls/--url is given]
 *   --max-pages <n>      cap on listed pages fetched (default 500)
 *   --max-links <n>      cap on distinct link targets fetched (default 3000)
 *   --timeout <ms>       per request (default 15000)
 *   --concurrency <n>    parallel requests (default 6)
 *   --out <file>         write the JSON report here (ignored under --dry-run)
 *   --strict             exit 1 when any broken link is found (ignored under --dry-run)
 *   --dry-run            read-only: fetch + print, write nothing, exit 0 on findings
 *   --quiet              summary only (no per-link lines)
 *
 * Exit: 0 ran (and clean, or not --strict) · 1 --strict with broken links ·
 *       2 could not run (bad args, off-market site, nothing fetched)
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = path.resolve(process.env.FRAME_UTAH_REPO || path.join(SCRIPT_DIR, ".."));
const BUSINESS_JSON = path.join(REPO_ROOT, "data", "route-factory", "business.json");

export const MARKET_NAME = "Frame Restoration Utah";
// Fallback only; the canonical host is read from business.json when present.
const FALLBACK_HOST = "www.framerestorationutah.com";
// Retired brand domain: it 301s to the canonical host. A link to it is not
// broken, but it is a redirect hop on every click and a stale-brand signal.
const LEGACY_HOSTS = new Set(["frameroofingutah.com", "www.frameroofingutah.com"]);
const FIXTURE_HOSTS = new Set(["localhost", "127.0.0.1", "[::1]"]);

const UA = "FrameRestorationUtah-LinkCheck/1.0 (+https://www.framerestorationutah.com)";
const SKIP_SCHEME = /^(mailto:|tel:|sms:|javascript:|data:|blob:|#)/i;
const MAX_REDIRECT_HOPS = 5;
const URL_CAP_PER_ISSUE = 50;

export function marketHosts() {
  let canonical = FALLBACK_HOST;
  try {
    const cfg = JSON.parse(fs.readFileSync(BUSINESS_JSON, "utf8"));
    if (typeof cfg.canonical_host === "string" && cfg.canonical_host) canonical = cfg.canonical_host;
  } catch {
    /* business.json absent (fixture checkout) — fall back */
  }
  const apex = canonical.replace(/^www\./, "");
  return { canonical, hosts: new Set([canonical, apex, `www.${apex}`]) };
}

/** Throws unless `site` is this market's host or a loopback test fixture. */
export function assertMarketSite(site) {
  let u;
  try {
    u = new URL(site);
  } catch {
    throw new Error(`--site is not a URL: ${site}`);
  }
  const { hosts } = marketHosts();
  if (hosts.has(u.hostname) || FIXTURE_HOSTS.has(u.hostname)) return u.origin;
  throw new Error(
    `refusing to check ${u.hostname}: not a ${MARKET_NAME} host (${[...hosts].join(", ")}). ` +
      "This loop never crawls another market's site.",
  );
}

export function parseArgs(argv) {
  const args = {
    site: null,
    urls: null,
    url: [],
    sitemap: undefined,
    maxPages: 500,
    maxLinks: 3000,
    timeout: 15000,
    concurrency: 6,
    out: null,
    strict: false,
    dryRun: false,
    quiet: false,
  };
  const num = (flag, v) => {
    const n = Number(v);
    if (!Number.isFinite(n) || n <= 0) throw new Error(`${flag} needs a positive number, got ${v}`);
    return n;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--site") args.site = argv[++i];
    else if (a === "--urls") args.urls = argv[++i];
    else if (a === "--url") args.url.push(argv[++i]);
    else if (a === "--sitemap") {
      const next = argv[i + 1];
      if (next && !next.startsWith("--")) {
        args.sitemap = next;
        i += 1;
      } else args.sitemap = true; // fetch <site>/sitemap.xml
    } else if (a === "--max-pages") args.maxPages = num(a, argv[++i]);
    else if (a === "--max-links") args.maxLinks = num(a, argv[++i]);
    else if (a === "--timeout") args.timeout = num(a, argv[++i]);
    else if (a === "--concurrency") args.concurrency = num(a, argv[++i]);
    else if (a === "--out") args.out = argv[++i];
    else if (a === "--strict") args.strict = true;
    else if (a === "--dry-run") args.dryRun = true;
    else if (a === "--quiet") args.quiet = true;
    else if (a === "--help" || a === "-h") args.help = true;
    else throw new Error(`unknown argument: ${a}`);
  }
  for (const k of ["site", "urls", "out"]) {
    if (args[k] === undefined) throw new Error(`--${k} needs a value`);
  }
  if (args.url.some((u) => u === undefined)) throw new Error("--url needs a value");
  if (args.sitemap === undefined && !args.urls && args.url.length === 0) args.sitemap = true;
  return args;
}

/** Dedupe key + fetch form: path with no hash/query, no trailing slash (except root). */
export function normalizePath(pathname) {
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "") || "/";
  return p;
}

/**
 * Classify one seed entry (a URL list line) against the site origin.
 * Market-host URLs are re-homed onto `origin` so a production sitemap can be
 * replayed against a fixture; anything on another host is off-market.
 */
export function classifySeed(raw, origin, hosts) {
  const s = String(raw || "").trim();
  if (!s || s.startsWith("#")) return null;
  if (s.startsWith("/")) return { kind: "seed", path: normalizePath(s.split("#")[0].split("?")[0]) };
  let u;
  try {
    u = new URL(s);
  } catch {
    return { kind: "invalid", raw: s };
  }
  const siteHost = new URL(origin).hostname;
  if (u.origin === origin || hosts.has(u.hostname) || (FIXTURE_HOSTS.has(siteHost) && hosts.has(u.hostname))) {
    return { kind: "seed", path: normalizePath(u.pathname) };
  }
  return { kind: "off_market", raw: s, host: u.hostname };
}

export function parseUrlList(text) {
  if (/<loc>/i.test(text)) return [...text.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/gi)].map((m) => m[1]);
  return text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
}

function decodeEntities(s) {
  return s.replace(/&amp;/g, "&").replace(/&#39;|&apos;/g, "'").replace(/&quot;/g, '"');
}

/** Every href on the page (anchors, link rel, iframes, images, scripts via src too). */
export function extractLinks(html) {
  const out = [];
  const re = /<(a|link|iframe|img|script|source)\s[^>]*?(?:href|src)=(["'])([^"']+)\2/gi;
  let m;
  while ((m = re.exec(html)) !== null) out.push(decodeEntities(m[3]).trim());
  return out;
}

/**
 * Classify one link target found on a page.
 *   internal     → will be fetched (same origin as the page)
 *   legacy       → retired brand host, not fetched, warned
 *   external     → any other host, never fetched, counted per host
 *   skip         → mailto/tel/sms/anchors/etc.
 */
export function classifyLink(href, pageUrl, origin, hosts) {
  if (!href || SKIP_SCHEME.test(href)) return { kind: "skip" };
  let u;
  try {
    u = new URL(href, pageUrl);
  } catch {
    return { kind: "invalid", href };
  }
  if (!/^https?:$/.test(u.protocol)) return { kind: "skip" };
  const siteHost = new URL(origin).hostname;
  if (u.origin === origin) return { kind: "internal", path: normalizePath(u.pathname) };
  // A production-host absolute link inside a fixture replay is still internal.
  if (FIXTURE_HOSTS.has(siteHost) && hosts.has(u.hostname)) return { kind: "internal", path: normalizePath(u.pathname) };
  if (hosts.has(u.hostname)) return { kind: "internal", path: normalizePath(u.pathname) };
  if (LEGACY_HOSTS.has(u.hostname)) return { kind: "legacy", href: u.href, host: u.hostname };
  return { kind: "external", href: u.href, host: u.hostname };
}

async function fetchOnce(url, timeout, fetchImpl) {
  return fetchImpl(url, {
    redirect: "manual",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(timeout),
  });
}

/**
 * GET with manual redirect following, same-origin only. Returns
 * { status, chain, finalUrl, html?, error?, loop?, externalRedirect? }.
 * The body is read only for same-origin HTML 200s when `wantBody` is true.
 */
async function fetchWithChain(origin, p, { timeout, wantBody, fetchImpl }) {
  const chain = [];
  let current = origin + p;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    let res;
    try {
      res = await fetchOnce(current, timeout, fetchImpl);
    } catch {
      try {
        res = await fetchOnce(current, timeout, fetchImpl); // one retry on a network error
      } catch (err) {
        return { status: null, error: String(err?.cause?.code || err?.name || err), chain, finalUrl: current };
      }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.arrayBuffer().catch(() => {});
      if (!loc) return { status: res.status, chain, finalUrl: current, html: null };
      const next = new URL(loc, current);
      chain.push({ from: current, to: next.href, status: res.status });
      if (next.origin !== origin) {
        // Never follow a redirect off the market origin.
        return { status: res.status, chain, finalUrl: next.href, externalRedirect: true, html: null };
      }
      if (chain.some((c, i) => i < chain.length - 1 && c.from === next.href)) {
        return { status: res.status, chain, finalUrl: next.href, loop: true, html: null };
      }
      current = next.origin + normalizePath(next.pathname);
      continue;
    }
    const type = res.headers.get("content-type") || "";
    const isHtml = type.includes("text/html");
    let html = null;
    if (wantBody && isHtml && res.status === 200) html = await res.text();
    else await res.arrayBuffer().catch(() => {});
    return { status: res.status, chain, finalUrl: current, html, isHtml };
  }
  return { status: null, chain, finalUrl: current, loop: true, html: null };
}

function verdict(r) {
  if (r.error) return { ok: false, type: "network-error", severity: "error" };
  if (r.loop) return { ok: false, type: "redirect-loop", severity: "error" };
  if (r.externalRedirect) return { ok: true, type: "external-redirect", severity: "info" };
  if (r.status === 404 || r.status === 410) return { ok: false, type: "broken-link", severity: "error" };
  if (r.status >= 500) return { ok: false, type: "server-error", severity: "error" };
  if (r.status >= 400) return { ok: false, type: "client-error", severity: "warn" };
  if (r.chain.length >= 2) return { ok: true, type: "redirect-chain", severity: "warn" };
  return { ok: true, type: null, severity: null };
}

/**
 * Core routine. `seeds` is a raw URL list (strings). Returns the report object;
 * `report.failed` is set when nothing could be fetched.
 */
export async function checkLinks({
  site,
  seeds,
  maxPages = 500,
  maxLinks = 3000,
  timeout = 15000,
  concurrency = 6,
  fetchImpl = globalThis.fetch,
  onProgress = () => {},
}) {
  const origin = assertMarketSite(site);
  const { canonical, hosts } = marketHosts();
  const notes = [];

  // ---- seeds ----
  const seedPaths = [];
  const seenSeed = new Set();
  const offMarket = [];
  const invalid = [];
  for (const raw of seeds) {
    const c = classifySeed(raw, origin, hosts);
    if (!c) continue;
    if (c.kind === "seed") {
      if (!seenSeed.has(c.path)) {
        seenSeed.add(c.path);
        seedPaths.push(c.path);
      }
    } else if (c.kind === "off_market") offMarket.push(c.raw);
    else invalid.push(c.raw);
  }
  if (seedPaths.length > maxPages) {
    notes.push(`page cap ${maxPages} reached: ${seedPaths.length - maxPages} listed URLs not fetched`);
    seedPaths.length = maxPages;
  }
  if (offMarket.length) notes.push(`${offMarket.length} listed URL(s) on another host were NOT fetched`);

  // ---- fetch seeds, collect links ----
  const pages = new Map(); // path -> { path, status, chain, error, links }
  const targets = new Map(); // internal target path -> Set(source paths)
  const external = new Map(); // host -> { count, sample: Set(href) }
  const legacy = new Map(); // href -> Set(source)
  const invalidHrefs = [];

  const seedQueue = [...seedPaths];
  let done = 0;
  async function seedWorker() {
    while (seedQueue.length > 0) {
      const p = seedQueue.shift();
      if (p === undefined) break;
      const r = await fetchWithChain(origin, p, { timeout, wantBody: true, fetchImpl });
      const rec = { path: p, status: r.status, error: r.error || null, chain: r.chain, loop: !!r.loop, externalRedirect: !!r.externalRedirect, links: 0 };
      if (r.html) {
        const pageUrl = origin + p;
        for (const href of extractLinks(r.html)) {
          const c = classifyLink(href, pageUrl, origin, hosts);
          if (c.kind === "skip") continue;
          rec.links += 1;
          if (c.kind === "internal") {
            if (!targets.has(c.path)) targets.set(c.path, new Set());
            targets.get(c.path).add(p);
          } else if (c.kind === "external") {
            if (!external.has(c.host)) external.set(c.host, { count: 0, sample: new Set() });
            const e = external.get(c.host);
            e.count += 1;
            if (e.sample.size < 3) e.sample.add(c.href);
          } else if (c.kind === "legacy") {
            if (!legacy.has(c.href)) legacy.set(c.href, new Set());
            legacy.get(c.href).add(p);
          } else if (c.kind === "invalid") invalidHrefs.push({ href: c.href, source: p });
        }
      }
      pages.set(p, rec);
      done += 1;
      onProgress({ phase: "pages", done, total: seedPaths.length });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, seedWorker));

  const fetchedPages = [...pages.values()];
  if (fetchedPages.length === 0 || fetchedPages.every((p) => p.error)) {
    return { failed: true, reason: fetchedPages[0]?.error || "no URLs fetched", notes, site: origin };
  }

  // ---- fetch link targets (same origin only). A target that is also a seed
  // is already known; reuse its result instead of fetching twice. ----
  const results = new Map(); // path -> fetch result
  for (const p of fetchedPages) results.set(p.path, p);
  const toFetch = [...targets.keys()].filter((t) => !results.has(t)).sort();
  if (toFetch.length > maxLinks) {
    notes.push(`link cap ${maxLinks} reached: ${toFetch.length - maxLinks} link targets not fetched`);
    toFetch.length = maxLinks;
  }
  let linksDone = 0;
  async function linkWorker() {
    while (toFetch.length > 0) {
      const t = toFetch.shift();
      if (t === undefined) break;
      const r = await fetchWithChain(origin, t, { timeout, wantBody: false, fetchImpl });
      results.set(t, { path: t, status: r.status, error: r.error || null, chain: r.chain, loop: !!r.loop, externalRedirect: !!r.externalRedirect });
      linksDone += 1;
      onProgress({ phase: "links", done: linksDone, total: targets.size });
    }
  }
  await Promise.all(Array.from({ length: Math.max(1, concurrency) }, linkWorker));

  // ---- issues ----
  const issues = new Map();
  const add = (type, severity, url, source) => {
    if (!issues.has(type)) issues.set(type, { type, severity, urls: new Set(), sources: {} });
    const e = issues.get(type);
    e.urls.add(url);
    if (source) {
      if (!e.sources[url]) e.sources[url] = [];
      if (e.sources[url].length < 5 && !e.sources[url].includes(source)) e.sources[url].push(source);
    }
  };
  const broken = [];
  for (const p of fetchedPages) {
    const v = verdict(p);
    if (!v.ok) {
      add(`listed-page-${v.type}`, "error", origin + p.path);
      broken.push({ url: origin + p.path, status: p.status, type: v.type, error: p.error, sources: ["(listed URL)"] });
    } else if (v.type) add(`listed-page-${v.type}`, v.severity, origin + p.path);
  }
  for (const [t, sources] of targets) {
    const r = results.get(t);
    if (!r) continue; // over the link cap: not fetched, no verdict
    if (seenSeed.has(t)) continue; // judged above as a listed page
    const v = verdict(r);
    const url = origin + t;
    if (!v.ok) {
      for (const s of sources) add(v.type, v.severity, url, origin + s);
      broken.push({ url, status: r.status, type: v.type, error: r.error, sources: [...sources].sort().map((s) => origin + s) });
    } else if (v.type) {
      for (const s of sources) add(v.type, v.severity, url, origin + s);
    }
  }
  for (const [href, sources] of legacy) for (const s of sources) add("legacy-host-link", "warn", href, origin + s);
  for (const { href, source } of invalidHrefs) add("invalid-href", "warn", href, origin + source);

  const issueList = [...issues.values()]
    .map((e) => {
      const urls = [...e.urls].sort();
      const capped = urls.slice(0, URL_CAP_PER_ISSUE);
      const out = { type: e.type, severity: e.severity, count: urls.length, urls: capped };
      const sources = Object.fromEntries(Object.entries(e.sources).filter(([u]) => capped.includes(u)));
      if (Object.keys(sources).length > 0) out.sources = sources;
      if (urls.length > URL_CAP_PER_ISSUE) out.urls_truncated = true;
      return out;
    })
    .sort((a, b) => {
      const rank = { error: 0, warn: 1, info: 2 };
      return rank[a.severity] - rank[b.severity] || b.count - a.count || a.type.localeCompare(b.type);
    });

  const byStatus = {};
  for (const r of results.values()) {
    const key = r.error ? "error" : String(r.status);
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

  broken.sort((a, b) => a.url.localeCompare(b.url));
  return {
    market: MARKET_NAME,
    canonical_host: canonical,
    site: origin,
    fetched_at: new Date().toISOString(),
    seeds: { listed: seeds.length, fetched: fetchedPages.length, off_market: offMarket.sort(), invalid: invalid.sort() },
    links: {
      internal_targets: targets.size,
      internal_fetched: results.size - fetchedPages.length,
      external_not_fetched: [...external.values()].reduce((n, e) => n + e.count, 0),
      external_hosts: Object.fromEntries([...external.entries()].sort((a, b) => b[1].count - a[1].count).map(([h, e]) => [h, { count: e.count, sample: [...e.sample] }])),
      legacy_host_links: legacy.size,
    },
    by_status: byStatus,
    broken,
    issues: issueList,
    notes,
  };
}

function printReport(report, { quiet }) {
  const log = (s = "") => console.log(s);
  log(`\n=== live link check — ${report.market} — ${report.site} ===`);
  log(`listed URLs ${report.seeds.listed} · fetched ${report.seeds.fetched} · off-market skipped ${report.seeds.off_market.length}`);
  log(`internal link targets ${report.links.internal_targets} (fetched ${report.links.internal_fetched}) · external links ${report.links.external_not_fetched} on ${Object.keys(report.links.external_hosts).length} host(s), not fetched`);
  log(`status mix: ${Object.entries(report.by_status).map(([k, v]) => `${k}×${v}`).join("  ") || "—"}`);
  for (const n of report.notes) log(`  note: ${n}`);
  if (report.seeds.off_market.length && !quiet) {
    log("\noff-market listed URLs (never fetched):");
    for (const u of report.seeds.off_market.slice(0, 20)) log(`  ✗ ${u}`);
  }
  if (report.broken.length === 0) log("\n✓ no broken links");
  else {
    log(`\n🚨 ${report.broken.length} broken link target(s):`);
    if (!quiet) {
      for (const b of report.broken) {
        log(`  ${String(b.status ?? b.error ?? "?").padStart(4)}  ${b.url}`);
        for (const s of b.sources.slice(0, 5)) log(`          ← ${s}`);
        if (b.sources.length > 5) log(`          ← … ${b.sources.length - 5} more`);
      }
    }
  }
  const warns = report.issues.filter((i) => i.severity !== "error");
  if (warns.length) {
    log("\nwarnings:");
    for (const i of warns) log(`  ${i.type} ×${i.count}${quiet ? "" : `: ${i.urls.slice(0, 3).join(", ")}${i.count > 3 ? ", …" : ""}`}`);
  }
  const hosts = Object.entries(report.links.external_hosts);
  if (hosts.length && !quiet) {
    log("\nexternal hosts linked (not fetched — review for anything that is not this market):");
    for (const [h, e] of hosts.slice(0, 25)) log(`  ${String(e.count).padStart(4)}× ${h}`);
    if (hosts.length > 25) log(`  … ${hosts.length - 25} more host(s)`);
  }
  log();
}

async function loadSeeds(args, origin) {
  if (args.url.length) return args.url;
  if (args.urls) return parseUrlList(fs.readFileSync(path.resolve(args.urls), "utf8"));
  if (typeof args.sitemap === "string") return parseUrlList(fs.readFileSync(path.resolve(args.sitemap), "utf8"));
  const res = await fetch(`${origin}/sitemap.xml`, { headers: { "user-agent": UA }, signal: AbortSignal.timeout(args.timeout) });
  if (res.status !== 200) throw new Error(`${origin}/sitemap.xml returned ${res.status}`);
  return parseUrlList(await res.text());
}

async function main() {
  let args;
  try {
    args = parseArgs(process.argv.slice(2));
  } catch (err) {
    console.error(`[check-broken-links] ${err.message}`);
    process.exit(2);
  }
  if (args.help) {
    console.log(fs.readFileSync(fileURLToPath(import.meta.url), "utf8").split("*/")[0]);
    process.exit(0);
  }
  const site = args.site || `https://${marketHosts().canonical}`;
  let origin;
  try {
    origin = assertMarketSite(site);
  } catch (err) {
    console.error(`[check-broken-links] ${err.message}`);
    process.exit(2);
  }
  if (args.dryRun) console.error(`[check-broken-links] DRY RUN — read-only, no report written, findings do not fail the run`);
  let seeds;
  try {
    seeds = await loadSeeds(args, origin);
  } catch (err) {
    console.error(`[check-broken-links] could not load URL list: ${err.message}`);
    process.exit(2);
  }
  const started = Date.now();
  const report = await checkLinks({
    site: origin,
    seeds,
    maxPages: args.maxPages,
    maxLinks: args.maxLinks,
    timeout: args.timeout,
    concurrency: args.concurrency,
    onProgress: args.quiet ? () => {} : ({ phase, done, total }) => {
      if (done === total || done % 25 === 0) process.stderr.write(`[check-broken-links] ${phase} ${done}/${total}\r`);
    },
  });
  if (report.failed) {
    console.error(`[check-broken-links] run could not complete: ${report.reason}`);
    process.exit(2);
  }
  report.mode = args.dryRun ? "dry-run" : "report";
  report.duration_ms = Date.now() - started;
  printReport(report, { quiet: args.quiet });
  if (args.out && !args.dryRun) {
    fs.mkdirSync(path.dirname(path.resolve(args.out)), { recursive: true });
    fs.writeFileSync(path.resolve(args.out), `${JSON.stringify(report, null, 2)}\n`);
    console.error(`[check-broken-links] report written to ${args.out}`);
  } else if (args.out && args.dryRun) {
    console.error(`[check-broken-links] dry run: --out ${args.out} NOT written`);
  }
  const brokenCount = report.broken.length;
  console.error(`[check-broken-links] ${report.seeds.fetched} pages, ${report.links.internal_targets} internal targets, ${brokenCount} broken (${Math.round(report.duration_ms / 1000)}s)`);
  if (args.strict && !args.dryRun && brokenCount > 0) process.exit(1);
  process.exit(0);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${path.resolve(process.argv[1])}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[check-broken-links] ${err.stack || err}`);
    process.exit(2);
  });
}
