#!/usr/bin/env node
/**
 * Live-site crawler for Frame Restoration Utah TX — the fetch-the-real-thing half of
 * the SEO loop (docs/seo/SEO-LOOP.md).
 *
 * WHY: every audit-*.mjs in this directory is a static scan of HTML on disk.
 * None of them can see what production actually serves — real status codes, the
 * redirect chains vercel.json actually produces, a page that went noindex after
 * deploy, or a 500. This crawls the DEPLOYED site and reports issues in the
 * OpenSEO/seo-god hyphenated vocabulary (broken-internal-link, server-error,
 * redirect-chain, noindex-page, thin-content, orphan-page, ...) so snapshots
 * stay comparable with any tooling that speaks that contract.
 *
 * Method (ported from the seo-god skill's audit/measure phases, no Docker):
 *   seeds = sitemap.xml <loc> entries + "/", then BFS over same-host <a href>
 *   links. Only internal URLs are fetched. Redirects are followed manually so
 *   chains and loops are observable. robots.txt Disallow (User-agent: *) is
 *   respected: matching URLs are reported blocked-page and never fetched.
 *
 * Honesty rules (non-negotiable, from the seo-god contract):
 *   - A URL that was not fetched produces no issue and no clean bill of health.
 *   - Issue `urls` are deduped, sorted lexicographically, capped at 50 — sort
 *     BEFORE capping so the same input always yields the same 50 and a diff can
 *     never invent a "new" URL out of truncation. `count` keeps the true total.
 *   - Zero pages fetched is a failed crawl, not an empty site: exit non-zero.
 *
 * Usage:
 *   node scripts/seo-crawl.mjs --site https://www.framerestorationutah.com [--max-pages 500]
 *        [--canonical-host www.framerestorationutah.com] [--out crawl.json] [--timeout 15000]
 *
 * Output: one JSON object (stdout or --out): { site, fetched_at, pages,
 * indexable_pages, by_status, issues:[{type,severity,count,urls,sources?}], notes }.
 * Exit 0 = crawl completed (issues or not). Exit 2 = crawl could not complete.
 */

import fs from "node:fs";
import process from "node:process";

const UA = "FrameRestorationSeoBot/1.0 (ryan@framerestorations.com)";
const URL_CAP_PER_ISSUE = 50;
const THIN_CONTENT_WORDS = 150;
const MAX_REDIRECT_HOPS = 5;
const CONCURRENCY = 6;

function parseArgs(argv) {
  const args = { maxPages: 500, timeout: 15000, canonicalHost: "www.framerestorationutah.com" };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === "--site") args.site = argv[++i];
    else if (a === "--max-pages") args.maxPages = Number(argv[++i]);
    else if (a === "--timeout") args.timeout = Number(argv[++i]);
    else if (a === "--canonical-host") args.canonicalHost = argv[++i];
    else if (a === "--out") args.out = argv[++i];
  }
  return args;
}

/** Dedupe key + fetch form: same-origin path with no hash/query, no trailing slash (except root). */
function normalizePath(pathname) {
  let p = pathname || "/";
  if (p.length > 1 && p.endsWith("/")) p = p.replace(/\/+$/, "") || "/";
  return p;
}

function resolveInternal(href, baseUrl, origin) {
  if (typeof href !== "string" || href === "") return null;
  if (/^(mailto:|tel:|sms:|javascript:|data:|#)/i.test(href)) return null;
  let u;
  try {
    u = new URL(href, baseUrl);
  } catch {
    return null;
  }
  if (u.origin !== origin) return null;
  return normalizePath(u.pathname);
}

function decodeEntities(s) {
  return s
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;|&apos;/g, "'")
    .replace(/&nbsp;/g, " ");
}

function extractHead(html, re) {
  const m = html.match(re);
  return m ? decodeEntities(m[1].replace(/\s+/g, " ").trim()) : null;
}

export function metaContent(html, nameOrProperty) {
  // <meta name="x" content="y"> in either attribute order.
  // The delimiter is captured and back-referenced so an apostrophe inside a
  // double-quoted value ("Frame Restoration Utah's ...") cannot truncate the value —
  // truncation made every such description collapse to a shared prefix and
  // report a phantom duplicate-meta-description.
  const re1 = new RegExp(`<meta\\s[^>]*name=["']${nameOrProperty}["'][^>]*content=(["'])([\\s\\S]*?)\\1`, "i");
  const re2 = new RegExp(`<meta\\s[^>]*content=(["'])([\\s\\S]*?)\\1[^>]*name=["']${nameOrProperty}["']`, "i");
  const m = html.match(re1) || html.match(re2);
  return m ? decodeEntities(m[2].trim()) : null;
}

export function canonicalHref(html) {
  // Same delimiter discipline as metaContent — a truncated href would read as a
  // canonical-mismatch that isn't there.
  const re1 = /<link\s[^>]*rel=["']canonical["'][^>]*href=(["'])([\s\S]*?)\1/i;
  const re2 = /<link\s[^>]*href=(["'])([\s\S]*?)\1[^>]*rel=["']canonical["']/i;
  const m = html.match(re1) || html.match(re2);
  return m ? m[2].trim() : null;
}

function visibleWordCount(html) {
  const text = html
    .replace(/<script\b[\s\S]*?<\/script>/gi, " ")
    .replace(/<style\b[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript\b[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<svg\b[\s\S]*?<\/svg>/gi, " ")
    .replace(/<template\b[\s\S]*?<\/template>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  const words = decodeEntities(text).match(/[A-Za-z0-9][A-Za-z0-9'’-]*/g);
  return words ? words.length : 0;
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /<a\s[^>]*href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html)) !== null) hrefs.push(m[1]);
  return hrefs;
}

/** Minimal robots.txt: Disallow prefixes for User-agent: * only. */
function parseRobots(text) {
  const disallow = [];
  let applies = false;
  for (const raw of text.split(/\r?\n/)) {
    const line = raw.replace(/#.*$/, "").trim();
    if (!line) continue;
    const [key, ...rest] = line.split(":");
    const value = rest.join(":").trim();
    const k = key.trim().toLowerCase();
    if (k === "user-agent") applies = value === "*";
    else if (applies && k === "disallow" && value) disallow.push(value);
  }
  return disallow;
}

async function fetchOnce(url, timeout) {
  return fetch(url, {
    redirect: "manual",
    headers: { "user-agent": UA, accept: "text/html,application/xhtml+xml,*/*" },
    signal: AbortSignal.timeout(timeout),
  });
}

/** Follow redirects by hand so the chain is data, retry a network error once. */
async function fetchWithChain(origin, path, timeout) {
  const chain = [];
  let current = origin + path;
  for (let hop = 0; hop <= MAX_REDIRECT_HOPS; hop += 1) {
    let res;
    try {
      res = await fetchOnce(current, timeout);
    } catch {
      try {
        res = await fetchOnce(current, timeout);
      } catch (err) {
        return { error: String(err?.cause?.code || err?.name || err), chain, finalUrl: current };
      }
    }
    if (res.status >= 300 && res.status < 400) {
      const loc = res.headers.get("location");
      await res.arrayBuffer().catch(() => {});
      if (!loc) return { status: res.status, chain, finalUrl: current, html: null };
      const next = new URL(loc, current);
      chain.push({ from: current, to: next.href, status: res.status });
      if (next.origin !== origin) {
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
    const html = isHtml && res.status === 200 ? await res.text() : (await res.arrayBuffer().catch(() => {}), null);
    return { status: res.status, chain, finalUrl: current, html, isHtml };
  }
  return { status: null, chain, finalUrl: current, loop: true, html: null };
}

export async function crawlSite({ site, maxPages = 500, timeout = 15000, canonicalHost = "www.framerestorationutah.com" }) {
  const origin = new URL(site).origin;
  const notes = [];

  // robots.txt — respected, and blocked sitemap URLs are reported, not fetched.
  let disallow = [];
  try {
    const res = await fetchOnce(`${origin}/robots.txt`, timeout);
    if (res.status === 200) disallow = parseRobots(await res.text());
    else await res.arrayBuffer().catch(() => {});
  } catch {
    notes.push("robots.txt unreachable — crawled without it");
  }
  const isBlocked = (p) => disallow.some((d) => p.startsWith(d));

  // Sitemap seeds.
  const sitemapPaths = [];
  try {
    const res = await fetchOnce(`${origin}/sitemap.xml`, timeout);
    if (res.status === 200) {
      const xml = await res.text();
      for (const m of xml.matchAll(/<loc>\s*([^<\s]+)\s*<\/loc>/g)) {
        try {
          const u = new URL(m[1]);
          // The sitemap names the canonical production host; crawl the same
          // paths on whatever origin we were pointed at (prod or a fixture).
          sitemapPaths.push(normalizePath(u.pathname));
        } catch {
          /* skip malformed loc */
        }
      }
    } else {
      await res.arrayBuffer().catch(() => {});
      notes.push(`sitemap.xml returned ${res.status}`);
    }
  } catch {
    notes.push("sitemap.xml unreachable");
  }

  const queue = [];
  const seen = new Set();
  const enqueue = (p) => {
    if (!seen.has(p) && seen.size + 0 < Infinity) {
      seen.add(p);
      queue.push(p);
    }
  };
  enqueue("/");
  for (const p of sitemapPaths) enqueue(p);

  const pages = new Map(); // path -> record
  const inbound = new Map(); // path -> Set of source paths
  const linkSources = new Map(); // target path -> Set of source paths (for broken links)

  let fetched = 0;
  async function worker() {
    while (queue.length > 0 && fetched < maxPages) {
      const path = queue.shift();
      if (path === undefined) break;
      if (isBlocked(path)) {
        pages.set(path, { path, blocked: true });
        continue;
      }
      fetched += 1;
      const r = await fetchWithChain(origin, path, timeout);
      const rec = { path, status: r.status ?? null, error: r.error || null, chain: r.chain, loop: !!r.loop, externalRedirect: !!r.externalRedirect };

      // A page reached via redirect belongs to its FINAL path. Attributing the
      // HTML to the entry URL would make the alias and the destination look
      // like two pages with identical content — fabricated duplicate-title /
      // canonical-mismatch findings. The entry keeps only its redirect record.
      let contentPath = path;
      if (r.chain.length > 0 && !r.loop && !r.externalRedirect && r.finalUrl) {
        try {
          const finalPath = normalizePath(new URL(r.finalUrl).pathname);
          if (finalPath !== path) {
            rec.redirectsTo = finalPath;
            if (seen.has(finalPath)) {
              contentPath = null; // destination fetched (or queued) under its own identity — discard this copy
            } else {
              seen.add(finalPath); // claim it: we analyze the HTML we already have under the final path
              contentPath = finalPath;
            }
          }
        } catch {
          /* keep entry path */
        }
      }

      if (r.html && contentPath) {
        const html = r.html;
        const page = contentPath === path ? rec : { path: contentPath, status: r.status, error: null, chain: [], loop: false, externalRedirect: false };
        page.title = extractHead(html, /<title[^>]*>([\s\S]*?)<\/title>/i);
        page.metaDescription = metaContent(html, "description");
        const robotsMeta = metaContent(html, "robots") || "";
        page.noindex = /noindex/i.test(robotsMeta);
        page.canonical = canonicalHref(html);
        page.h1Count = (html.match(/<h1\b/gi) || []).length;
        page.words = visibleWordCount(html);
        for (const href of extractHrefs(html)) {
          const target = resolveInternal(href, origin + contentPath, origin);
          if (!target) continue;
          if (!inbound.has(target)) inbound.set(target, new Set());
          inbound.get(target).add(contentPath);
          if (!linkSources.has(target)) linkSources.set(target, new Set());
          if (linkSources.get(target).size < 5) linkSources.get(target).add(contentPath);
          enqueue(target);
        }
        if (contentPath !== path) pages.set(contentPath, page);
      }
      pages.set(path, rec);
    }
  }
  await Promise.all(Array.from({ length: CONCURRENCY }, () => worker()));
  if (queue.length > 0) notes.push(`page cap ${maxPages} reached with ${queue.length} URLs unfetched`);

  const fetchedRecs = [...pages.values()].filter((p) => !p.blocked);
  const okHtml = fetchedRecs.filter((p) => p.status === 200 && p.title !== undefined);
  const indexable = okHtml.filter((p) => !p.noindex);

  if (fetchedRecs.length === 0 || fetchedRecs.every((p) => p.error)) {
    // A crawl that read nothing audits nothing — the seo-god not-an-audit rule.
    return { failed: true, reason: fetchedRecs[0]?.error || "no URLs fetched", notes };
  }

  // ---- Issues, seo-god vocabulary. severity: error | warn | info ----
  const issues = new Map();
  const add = (type, severity, url, source) => {
    if (!issues.has(type)) issues.set(type, { type, severity, urls: new Set(), sources: {} });
    const entry = issues.get(type);
    entry.urls.add(url);
    if (source) {
      if (!entry.sources[url]) entry.sources[url] = [];
      if (entry.sources[url].length < 5 && !entry.sources[url].includes(source)) entry.sources[url].push(source);
    }
  };

  for (const p of fetchedRecs) {
    const full = origin + p.path;
    if (p.error) add("server-error", "error", full);
    else if (p.status >= 500) add("server-error", "error", full);
    else if (p.loop) add("redirect-loop", "error", full);
    else if (p.status === 404 || p.status === 410) {
      const srcs = [...(linkSources.get(p.path) || [])];
      if (srcs.length > 0) for (const s of srcs) add("broken-internal-link", "error", full, s);
      else add("broken-internal-link", "error", full); // sitemap-only 404 is still a broken promise to crawlers
    }
    if (p.chain && p.chain.length >= 2 && !p.loop) add("redirect-chain", "warn", full);
  }

  for (const p of okHtml) {
    const full = origin + p.path;
    if (p.noindex) add("noindex-page", "warn", full);
  }

  for (const p of indexable) {
    const full = origin + p.path;
    if (!p.title) add("missing-title", "warn", full);
    if (!p.metaDescription) add("missing-meta-description", "warn", full);
    if (p.h1Count === 0) add("missing-h1", "warn", full);
    if (p.h1Count > 1) add("multiple-h1", "info", full);
    if (p.words < THIN_CONTENT_WORDS) add("thin-content", "warn", full);
    if (p.canonical) {
      try {
        const c = new URL(p.canonical, origin + p.path);
        const canonicalPathOk = normalizePath(c.pathname) === p.path;
        const canonicalHostOk = c.hostname === canonicalHost;
        if (!canonicalHostOk || !canonicalPathOk) add("canonical-mismatch", "warn", full);
      } catch {
        add("canonical-mismatch", "warn", full);
      }
    }
  }

  // Duplicates among indexable pages.
  for (const [field, type] of [["title", "duplicate-title"], ["metaDescription", "duplicate-meta-description"]]) {
    const byValue = new Map();
    for (const p of indexable) {
      const v = p[field];
      if (!v) continue;
      if (!byValue.has(v)) byValue.set(v, []);
      byValue.get(v).push(p);
    }
    for (const group of byValue.values()) {
      if (group.length > 1) for (const p of group) add(type, field === "title" ? "warn" : "info", origin + p.path);
    }
  }

  // Orphans: in the sitemap, fetched fine, but nothing internal links to them.
  for (const p of indexable) {
    if (p.path === "/" || !sitemapPaths.includes(p.path)) continue;
    if (!(inbound.get(p.path)?.size > 0)) add("orphan-page", "info", origin + p.path);
  }

  for (const p of sitemapPaths) {
    if (isBlocked(p)) add("blocked-page", "warn", origin + p);
  }

  const byStatus = {};
  for (const p of fetchedRecs) {
    const key = p.error ? "error" : String(p.status);
    byStatus[key] = (byStatus[key] || 0) + 1;
  }

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

  return {
    site,
    fetched_at: new Date().toISOString(),
    pages: fetchedRecs.length,
    indexable_pages: indexable.length,
    by_status: byStatus,
    issues: issueList,
    notes,
  };
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.site) {
    console.error("usage: node scripts/seo-crawl.mjs --site https://www.framerestorationutah.com [--max-pages N] [--out file]");
    process.exit(2);
  }
  const result = await crawlSite(args);
  if (result.failed) {
    console.error(`[seo-crawl] crawl could not complete: ${result.reason}`);
    process.exit(2);
  }
  const json = JSON.stringify(result, null, 2);
  if (args.out) fs.writeFileSync(args.out, `${json}\n`);
  else console.log(json);
  const errors = result.issues.filter((i) => i.severity === "error").reduce((n, i) => n + i.count, 0);
  console.error(`[seo-crawl] ${result.pages} pages, ${result.issues.length} issue types, ${errors} error-severity URLs`);
}

const invokedDirectly = process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href;
if (invokedDirectly) {
  main().catch((err) => {
    console.error(`[seo-crawl] ${err.stack || err}`);
    process.exit(2);
  });
}
