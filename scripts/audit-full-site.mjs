#!/usr/bin/env node
/**
 * Full-site audit — crawl/index + on-page + citability (Phases 2/3/5 of the
 * 2026 audit methodology). Companion to the gate scripts (jsonld/links/
 * city-quality/compliance). Deterministic, $0, Node built-ins only.
 *
 * Uses sitemap.xml as the canonical indexable-page set (cleanUrls routing),
 * cross-checked against actual files. Per page: title/meta/canonical/H1/OG,
 * visible word count, image-alt coverage, JSON-LD types, FAQ presence.
 *
 * Usage: node scripts/audit-full-site.mjs [--json]
 */
import fs from 'node:fs';
import path from 'node:path';

const repoRoot = process.cwd();
const asJson = process.argv.includes('--json');
const SCAN_DIRS = ['blog', 'pages', 'locations', 'services', 'in-the-news'];
const ROOT_PAGES = ['index.html', 'about.html'];

// ---- sitemap → indexable URL set ----
function sitemapUrls() {
  const p = path.join(repoRoot, 'sitemap.xml');
  if (!fs.existsSync(p)) return [];
  const xml = fs.readFileSync(p, 'utf8');
  return [...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1].trim());
}
// map a public URL to a local file (cleanUrls: /x → x.html, /x/ or /x → x/index.html, / → index.html)
function urlToFile(u) {
  let p = u.replace(/^https?:\/\/[^/]+/, '').replace(/[?#].*$/, '');
  if (p === '' || p === '/') return 'index.html';
  p = p.replace(/^\/+/, '').replace(/\/+$/, '');
  const cands = [`${p}.html`, `${p}/index.html`, p];
  for (const c of cands) if (fs.existsSync(path.join(repoRoot, c))) return c;
  return null; // sitemap URL with no backing file
}

// ---- gather actual files ----
function walk(dir, out = []) {
  const full = path.join(repoRoot, dir);
  if (!fs.existsSync(full)) return out;
  for (const e of fs.readdirSync(full, { withFileTypes: true })) {
    const rel = path.join(dir, e.name);
    if (e.isDirectory()) walk(rel, out);
    else if (e.name.endsWith('.html')) out.push(rel);
  }
  return out;
}
const fileSet = new Set([...SCAN_DIRS.flatMap((d) => walk(d)), ...ROOT_PAGES.filter((f) => fs.existsSync(path.join(repoRoot, f)))]);

// ---- per-page extractors ----
const text = (h) => h.replace(/<!--[\s\S]*?-->/g, ' ').replace(/<(script|style)\b[\s\S]*?<\/\1>/gi, ' ').replace(/<[^>]+>/g, ' ').replace(/&[a-z#0-9]+;/gi, ' ').replace(/\s+/g, ' ').trim();
const tag = (h, re) => { const m = h.match(re); return m ? m[1].trim() : null; };
// delimiter-aware attribute extraction — a double-quoted value can contain
// apostrophes (e.g. "...isn't just..."), so match the opening quote and read to
// the same quote, not to any quote char.
const attr = (h, re) => { const m = h.match(re); return m ? m[2].trim() : null; };

// rendered length: SERPs show &amp;→& etc. as one glyph, so measure decoded length
const ent = (s) => (s || '').replace(/&amp;/g, '&').replace(/&(mdash|ndash);/g, '—').replace(/&#39;|&apos;|&rsquo;|&lsquo;/g, "'").replace(/&quot;|&ldquo;|&rdquo;/g, '"').replace(/&[a-z]+;/gi, ' ');

function analyze(file) {
  const h = fs.readFileSync(path.join(repoRoot, file), 'utf8');
  const title = tag(h, /<title>([^<]*)<\/title>/i);
  const meta = attr(h, /<meta[^>]+name=["']description["'][^>]+content=(["'])([\s\S]*?)\1/i);
  const canonical = /rel=["']canonical["']/i.test(h);
  const ogImage = /property=["']og:image["']/i.test(h);
  const h1s = (h.match(/<h1\b/gi) || []).length;
  const words = (text(h).match(/[a-z0-9']+/gi) || []).length;
  const imgs = (h.match(/<img\b[^>]*>/gi) || []);
  const imgsNoAlt = imgs.filter((t) => !/\balt=/i.test(t)).length;
  const ldTypes = [...h.matchAll(/"@type"\s*:\s*"([^"]+)"/g)].map((m) => m[1]);
  const hasFAQ = ldTypes.includes('FAQPage');
  return { file, title, titleLen: ent(title).length, meta, metaLen: ent(meta).length,
    canonical, ogImage, h1s, words, imgs: imgs.length, imgsNoAlt,
    ldTypes: [...new Set(ldTypes)], hasFAQ };
}

// ---- run ----
const smUrls = sitemapUrls();
const smFiles = new Set(smUrls.map(urlToFile).filter(Boolean));
const smBroken = smUrls.filter((u) => !urlToFile(u));               // sitemap → no file
const orphans = [...fileSet].filter((f) => !smFiles.has(f) && f !== '404.html'); // file not in sitemap

const pages = [...fileSet].map(analyze);

// aggregate findings
const byTitle = {}, byMeta = {};
for (const p of pages) { if (p.title) (byTitle[p.title] ??= []).push(p.file); if (p.meta) (byMeta[p.meta] ??= []).push(p.file); }
const dupTitles = Object.entries(byTitle).filter(([, v]) => v.length > 1);
const dupMetas = Object.entries(byMeta).filter(([, v]) => v.length > 1);
const f = {
  missingTitle: pages.filter((p) => !p.title).map((p) => p.file),
  titleTooLong: pages.filter((p) => p.titleLen > 65).map((p) => `${p.file} (${p.titleLen})`),
  titleTooShort: pages.filter((p) => p.title && p.titleLen < 30).map((p) => `${p.file} (${p.titleLen})`),
  missingMeta: pages.filter((p) => !p.meta).map((p) => p.file),
  metaBadLen: pages.filter((p) => p.meta && (p.metaLen < 70 || p.metaLen > 165)).map((p) => `${p.file} (${p.metaLen})`),
  missingCanonical: pages.filter((p) => !p.canonical).map((p) => p.file),
  missingOgImage: pages.filter((p) => !p.ogImage).map((p) => p.file),
  noH1: pages.filter((p) => p.h1s === 0).map((p) => p.file),
  multiH1: pages.filter((p) => p.h1s > 1).map((p) => `${p.file} (${p.h1s})`),
  thin: pages.filter((p) => p.words < 500).map((p) => `${p.file} (${p.words}w)`),
  imgsNoAlt: pages.filter((p) => p.imgsNoAlt > 0).map((p) => `${p.file} (${p.imgsNoAlt}/${p.imgs})`),
};

const summary = {
  pagesAnalyzed: pages.length,
  sitemapUrls: smUrls.length,
  crawlIndex: { sitemapBroken: smBroken, orphanFiles: orphans },
  dupTitles: dupTitles.map(([t, v]) => ({ title: t.slice(0, 50), files: v })),
  dupMetas: dupMetas.map(([, v]) => v),
  onPage: Object.fromEntries(Object.entries(f).map(([k, v]) => [k, v.length])),
  findings: f,
  citability: { pagesWithFAQ: pages.filter((p) => p.hasFAQ).length, pagesNoFAQ: pages.filter((p) => !p.hasFAQ).length },
};

if (asJson) { console.log(JSON.stringify(summary, null, 2)); process.exit(0); }

console.log(`\n=== FULL-SITE AUDIT (Phases 2/3/5) — ${pages.length} pages, ${smUrls.length} sitemap URLs ===\n`);
console.log('CRAWL / INDEX:');
console.log(`  sitemap entries with no backing file: ${smBroken.length}`, smBroken.slice(0, 6));
console.log(`  files NOT in sitemap (orphans): ${orphans.length}`, orphans.slice(0, 12));
console.log('\nON-PAGE (counts):');
for (const [k, v] of Object.entries(f)) console.log(`  ${k.padEnd(18)} ${v.length}`);
console.log(`\n  duplicate titles: ${dupTitles.length} groups`);
dupTitles.slice(0, 8).forEach(([t, v]) => console.log(`    "${t.slice(0, 55)}" ×${v.length}`));
console.log(`  duplicate meta descriptions: ${dupMetas.length} groups`);
dupMetas.slice(0, 8).forEach(([, v]) => console.log(`    ×${v.length}: ${v.slice(0, 3).join(', ')}${v.length > 3 ? ' …' : ''}`));
console.log('\nCITABILITY:');
console.log(`  pages with FAQPage schema: ${summary.citability.pagesWithFAQ} / ${pages.length}`);
console.log('');
