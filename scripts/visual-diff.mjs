#!/usr/bin/env node
/**
 * Before/after screenshot check for Utah PRs (report-only for now).
 *
 * Serves two copies of the static site side by side: BEFORE_ROOT (the PR's
 * base, normally main) and AFTER_ROOT (the PR head). Renders the same key pages
 * from both at a desktop and a phone size, screenshots each full page, and
 * diffs the pair pixel by pixel inside Chromium (no image library needed).
 *
 * Both sides render on the same runner in the same browser, so there is no
 * committed baseline to drift and no font or OS mismatch. To keep the result
 * stable it blocks every off-site request (analytics, maps, embeds), freezes the
 * page clock, asks for reduced motion, forces lazy images to load, scrolls so
 * reveal-on-scroll sections show, and masks the live Google reviews carousel
 * (it changes whenever reviews.json syncs, which is not a layout change).
 *
 * A self-test runs first: it renders one page twice (must match) and once with
 * an injected layout shift (must be flagged), so the check can't silently pass
 * everything.
 *
 * Writes OUT_DIR/*.png (before, after, diff), summary.json and summary.md.
 * Exit code: 0 unless the self-test fails or the script itself breaks. With
 * VISUAL_DIFF_STRICT=1 a flagged page also fails the run (a later ratchet).
 */

import assert from "node:assert/strict";
import { createReadStream, existsSync, mkdirSync, statSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { chromium } from "playwright";

const beforeRoot = resolve(process.env.BEFORE_ROOT || "before");
const afterRoot = resolve(process.env.AFTER_ROOT || "after");
const outDir = resolve(process.env.OUT_DIR || "visual-diff-out");
const strict = process.env.VISUAL_DIFF_STRICT === "1";
// A page is flagged when more than this share of its pixels changed, or its
// height moved by more than HEIGHT_TOLERANCE_PX.
const RATIO_THRESHOLD = Number(process.env.VISUAL_DIFF_THRESHOLD || 0.002); // 0.2%
const HEIGHT_TOLERANCE_PX = 4;
// Per-pixel colour distance that counts as a change; absorbs anti-aliasing.
const PIXEL_TOLERANCE = 40;
const MAX_HEIGHT = 15000; // Chromium caps captures near 16384px.
const FROZEN_TIME = new Date("2026-01-15T17:00:00Z");

// The five pages that carry most calls and leads: home, the top city page
// (Salt Lake City is the current SEO focus), the top service page, the contact
// page with the lead form, and a long-lived blog post.
const PAGES = [
  { name: "home", path: "/" },
  { name: "salt-lake-city", path: "/locations/salt-lake-city" },
  { name: "roof-repair", path: "/pages/roof-repair" },
  { name: "contact", path: "/pages/contact" },
  { name: "blog-choose-a-roofer", path: "/blog/utah/how-to-choose-a-roofer-utah" },
];
const VIEWPORTS = [
  { name: "desktop", width: 1440, height: 900, isMobile: false, hasTouch: false },
  { name: "mobile", width: 393, height: 852, isMobile: true, hasTouch: true },
];
// Content that changes without any code change. Painted as a flat box on both sides.
const MASK_SELECTORS = ["#reviews-carousel", "video", "iframe"];

for (const [label, root] of [["BEFORE_ROOT", beforeRoot], ["AFTER_ROOT", afterRoot]]) {
  assert(existsSync(resolve(root, "index.html")), `${label} must contain index.html: ${root}`);
}
mkdirSync(outDir, { recursive: true });

const mimeTypes = {
  ".avif": "image/avif",
  ".css": "text/css; charset=utf-8",
  ".gif": "image/gif",
  ".html": "text/html; charset=utf-8",
  ".ico": "image/x-icon",
  ".jpeg": "image/jpeg",
  ".jpg": "image/jpeg",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".mp4": "video/mp4",
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".ttf": "font/ttf",
  ".webm": "video/webm",
  ".webp": "image/webp",
  ".woff": "font/woff",
  ".woff2": "font/woff2",
};

function startServer(root) {
  const server = createServer((request, response) => {
    const pathname = decodeURIComponent(new URL(request.url || "/", "http://local.test").pathname);
    let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
    if (!extname(relative)) relative += ".html";
    const path = resolve(root, relative);
    const inside = path === root || path.startsWith(`${root}${sep}`);
    if (!inside || !existsSync(path) || !statSync(path).isFile()) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Not found");
      return;
    }
    response.writeHead(200, {
      "content-type": mimeTypes[extname(path)] || "application/octet-stream",
      "cache-control": "no-store",
    });
    createReadStream(path).pipe(response);
  });
  return new Promise((resolveListen, rejectListen) => {
    server.once("error", rejectListen);
    server.listen(0, "127.0.0.1", () => {
      const { port } = server.address();
      resolveListen({ server, origin: `http://127.0.0.1:${port}` });
    });
  });
}

// Name the smallest visible elements inside each changed band (document coordinates).
function probeElements(page, bands) {
  return page.evaluate((bandsIn) => bandsIn.map((band) => {
    const hits = [];
    for (const el of document.querySelectorAll("body *")) {
      const r = el.getBoundingClientRect();
      const top = r.top + window.scrollY;
      const bottom = top + r.height;
      if (!r.width || !r.height || bottom < band.from || top > band.to) continue;
      if (r.height > (band.to - band.from + 1) * 3 + 40) continue;
      const cls = typeof el.className === "string" ? el.className.trim().split(/\s+/).slice(0, 3).join(".") : "";
      const pos = getComputedStyle(el).position;
      hits.push(`${el.tagName.toLowerCase()}${el.id ? `#${el.id}` : ""}${cls ? `.${cls}` : ""}${pos === "fixed" || pos === "sticky" ? `[${pos}]` : ""} @${Math.round(top)}+${Math.round(r.height)}`);
    }
    return { ...band, elements: hits.slice(0, 12) };
  }), bands);
}

async function capture(browser, origin, pagePath, viewport, extraCss = "", probeBands = null) {
  const context = await browser.newContext({
    viewport: { width: viewport.width, height: viewport.height },
    deviceScaleFactor: 1,
    isMobile: viewport.isMobile,
    hasTouch: viewport.hasTouch,
    reducedMotion: "reduce",
    serviceWorkers: "block",
    locale: "en-US",
    timezoneId: "America/Denver",
  });
  const page = await context.newPage();
  try {
    await page.route("**/*", (route) => (
      new URL(route.request().url()).origin === origin ? route.continue() : route.abort()
    ));
    await page.clock.install({ time: FROZEN_TIME });
    // Seeded Math.random so any shuffled content renders the same on both sides.
    await page.addInitScript(() => {
      let seed = 1234567;
      Math.random = () => {
        seed = (seed * 16807) % 2147483647;
        return (seed - 1) / 2147483646;
      };
    });
    const response = await page.goto(`${origin}${pagePath}`, { waitUntil: "load", timeout: 30000 });
    if (!response || response.status() === 404) return { missing: true };
    await page.clock.runFor(1500);
    // The site sets html { scroll-behavior: smooth }, which would leave the page
    // mid-scroll when the shot is taken. Jump instantly instead.
    await page.addStyleTag({ content: "html, body { scroll-behavior: auto !important; }" });
    // Load lazy images and fire reveal-on-scroll observers top to bottom.
    await page.evaluate(() => {
      for (const img of document.querySelectorAll('img[loading="lazy"]')) img.loading = "eager";
    });
    const total = await page.evaluate(() => document.documentElement.scrollHeight);
    for (let y = 0; y < Math.min(total, MAX_HEIGHT); y += viewport.height) {
      await page.evaluate((top) => window.scrollTo({ top, left: 0, behavior: "instant" }), y);
      await page.clock.runFor(200);
      await page.waitForTimeout(50);
    }
    await page.evaluate(() => window.scrollTo({ top: 0, left: 0, behavior: "instant" }));
    await page.waitForFunction(() => window.scrollY === 0, null, { timeout: 5000 });
    // Long enough for count-up stats and fades, shorter than the 6.5s carousel step.
    await page.clock.runFor(4000);
    // The page's own timers are frozen, so the 8s cap runs on the Node side.
    await Promise.race([
      page.evaluate(() => Promise.all([...document.images].map((img) => (img.complete ? null : new Promise((done) => {
        img.addEventListener("load", done, { once: true });
        img.addEventListener("error", done, { once: true });
      }))))),
      new Promise((done) => setTimeout(done, 8000)),
    ]);
    await page.evaluate(() => document.fonts.ready);
    if (extraCss) await page.addStyleTag({ content: extraCss });
    const height = await page.evaluate(() => Math.max(
      document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0,
    ));
    const clipHeight = Math.min(height, MAX_HEIGHT);
    // Like Playwright's toHaveScreenshot: keep shooting until two shots in a
    // row are identical, so late image decodes and quality re-rasters settle.
    const shoot = () => page.screenshot({
      fullPage: true,
      clip: { x: 0, y: 0, width: viewport.width, height: clipHeight },
      animations: "disabled",
      caret: "hide",
      mask: MASK_SELECTORS.map((selector) => page.locator(selector)),
      maskColor: "#d9d9d9",
      timeout: 60000,
    });
    let png = await shoot();
    let previous = null;
    let settled = false;
    for (let attempt = 0; attempt < 6 && !settled; attempt += 1) {
      await page.waitForTimeout(300);
      const next = await shoot();
      settled = next.equals(png);
      previous = png;
      png = next;
    }
    if (!settled) {
      const moving = await diffImages(diffPage, previous, png);
      console.log(`  note: ${pagePath} at ${viewport.name} kept changing between shots (${moving.changed} px, box ${JSON.stringify(moving.box)})`);
      for (const band of await probeElements(page, moving.bands)) {
        console.log(`    rows ${band.from}-${band.to} (${band.pixels} px): ${band.elements.join(" | ")}`);
      }
    }
    const probe = probeBands ? await probeElements(page, probeBands) : null;
    return { png, height, probe };
  } finally {
    await context.close();
  }
}

// Pixel diff inside a blank Chromium page via canvas. Areas present on only one
// side (a page that grew or shrank) count as changed.
async function diffImages(diffPage, beforePng, afterPng) {
  return diffPage.evaluate(async ({ before, after, tolerance }) => {
    const load = (b64) => new Promise((done, fail) => {
      const img = new Image();
      img.onload = () => done(img);
      img.onerror = fail;
      img.src = `data:image/png;base64,${b64}`;
    });
    const [a, b] = await Promise.all([load(before), load(after)]);
    const width = Math.max(a.width, b.width);
    const height = Math.max(a.height, b.height);
    const read = (img) => {
      const canvas = document.createElement("canvas");
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      ctx.fillStyle = "#ff00ff";
      ctx.fillRect(0, 0, width, height);
      ctx.drawImage(img, 0, 0);
      return ctx.getImageData(0, 0, width, height);
    };
    const da = read(a).data;
    const dbImage = read(b);
    const db = dbImage.data;
    const out = new ImageData(width, height);
    const o = out.data;
    let changed = 0;
    const rowCounts = new Uint32Array(height);
    let minX = width, minY = height, maxX = -1, maxY = -1;
    for (let i = 0; i < da.length; i += 4) {
      const delta = Math.max(
        Math.abs(da[i] - db[i]), Math.abs(da[i + 1] - db[i + 1]), Math.abs(da[i + 2] - db[i + 2]),
      );
      if (delta > tolerance) {
        changed += 1;
        const px = (i / 4) % width;
        const py = Math.floor(i / 4 / width);
        rowCounts[py] += 1;
        if (px < minX) minX = px;
        if (px > maxX) maxX = px;
        if (py < minY) minY = py;
        if (py > maxY) maxY = py;
        o[i] = 230; o[i + 1] = 20; o[i + 2] = 60; o[i + 3] = 255;
      } else {
        const luma = 0.299 * db[i] + 0.587 * db[i + 1] + 0.114 * db[i + 2];
        const faded = 170 + luma * 0.33;
        o[i] = faded; o[i + 1] = faded; o[i + 2] = faded; o[i + 3] = 255;
      }
    }
    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    canvas.getContext("2d").putImageData(out, 0, 0);
    const diffPng = canvas.toDataURL("image/png").split(",")[1];
    // Horizontal bands of changed rows (gaps under 20px merged), largest first.
    const bands = [];
    for (let y = 0; y < height; y += 1) {
      if (!rowCounts[y]) continue;
      const last = bands[bands.length - 1];
      if (last && y - last.to <= 20) { last.to = y; last.pixels += rowCounts[y]; } else bands.push({ from: y, to: y, pixels: rowCounts[y] });
    }
    bands.sort((p, q) => q.pixels - p.pixels);
    const box = maxX < 0 ? null : { x: minX, y: minY, width: maxX - minX + 1, height: maxY - minY + 1 };
    return { changed, total: width * height, diffPng, box, bands: bands.slice(0, 6) };
  }, { before: beforePng.toString("base64"), after: afterPng.toString("base64"), tolerance: PIXEL_TOLERANCE });
}

function judge(result, beforeHeight, afterHeight) {
  const ratio = result.total ? result.changed / result.total : 0;
  const heightDelta = afterHeight - beforeHeight;
  const flagged = ratio > RATIO_THRESHOLD || Math.abs(heightDelta) > HEIGHT_TOLERANCE_PX;
  return { ratio, heightDelta, flagged };
}

const pct = (ratio) => `${(ratio * 100).toFixed(ratio < 0.001 && ratio > 0 ? 3 : 2)}%`;

const beforeSite = await startServer(beforeRoot);
const afterSite = await startServer(afterRoot);
const browser = await chromium.launch({
  headless: true,
  ...(process.env.FRAME_UI_CHROMIUM_EXECUTABLE ? { executablePath: process.env.FRAME_UI_CHROMIUM_EXECUTABLE } : {}),
});
const diffContext = await browser.newContext();
const diffPage = await diffContext.newPage();

const rows = [];
let selftest = null;
try {
  // Self-test on the PR's own home page: two clean renders must match, and a
  // 24px layout shift must be flagged.
  {
    const viewport = VIEWPORTS[0];
    const first = await capture(browser, afterSite.origin, "/", viewport);
    const second = await capture(browser, afterSite.origin, "/", viewport);
    const shifted = await capture(browser, afterSite.origin, "/", viewport, "body { padding-top: 24px !important; }");
    assert(!first.missing && !second.missing && !shifted.missing, "self-test: the home page must render");
    const stableDiff = await diffImages(diffPage, first.png, second.png);
    const stable = judge(stableDiff, first.height, second.height);
    const broken = judge(await diffImages(diffPage, first.png, shifted.png), first.height, shifted.height);
    selftest = { stableRatio: stable.ratio, stableFlagged: stable.flagged, shiftRatio: broken.ratio, shiftFlagged: broken.flagged };
    console.log(`self-test: two clean renders differ by ${pct(stable.ratio)}; injected 24px shift differs by ${pct(broken.ratio)}`);
    if (stable.flagged) {
      writeFileSync(resolve(outDir, "selftest-render-1.png"), first.png);
      writeFileSync(resolve(outDir, "selftest-render-2.png"), second.png);
      writeFileSync(resolve(outDir, "selftest-diff.png"), Buffer.from(stableDiff.diffPng, "base64"));
      const probed = await capture(browser, afterSite.origin, "/", viewport, "", stableDiff.bands);
      console.log(`self-test: changed box ${JSON.stringify(stableDiff.box)}; heights ${first.height} vs ${second.height}`);
      for (const band of probed.probe) console.log(`  rows ${band.from}-${band.to} (${band.pixels} px): ${band.elements.join(" | ")}`);
    }
    assert(!stable.flagged, `self-test: two renders of the same page differ by ${pct(stable.ratio)}, so the check would be flaky`);
    assert(broken.flagged, "self-test: an injected 24px layout shift was not flagged");
  }

  for (const target of PAGES) {
    for (const viewport of VIEWPORTS) {
      const id = `${target.name}-${viewport.name}`;
      const before = await capture(browser, beforeSite.origin, target.path, viewport);
      const after = await capture(browser, afterSite.origin, target.path, viewport);
      const row = { id, page: target.path, viewport: viewport.name };
      if (before.missing && after.missing) {
        Object.assign(row, { status: "missing on both", flagged: false });
      } else if (before.missing) {
        writeFileSync(resolve(outDir, `${id}-after.png`), after.png);
        Object.assign(row, { status: "new page", flagged: true, afterHeight: after.height });
      } else if (after.missing) {
        writeFileSync(resolve(outDir, `${id}-before.png`), before.png);
        Object.assign(row, { status: "page removed", flagged: true, beforeHeight: before.height });
      } else {
        const result = await diffImages(diffPage, before.png, after.png);
        const verdict = judge(result, before.height, after.height);
        Object.assign(row, {
          status: verdict.flagged ? "changed" : "no visible change",
          flagged: verdict.flagged,
          ratio: verdict.ratio,
          beforeHeight: before.height,
          afterHeight: after.height,
          where: result.bands.slice(0, 2).map((band) => `${band.from}–${band.to}`).join(", "),
        });
        // Keep files only where something moved, so the artifact stays small.
        if (verdict.flagged || result.changed > 0) {
          writeFileSync(resolve(outDir, `${id}-before.png`), before.png);
          writeFileSync(resolve(outDir, `${id}-after.png`), after.png);
          writeFileSync(resolve(outDir, `${id}-diff.png`), Buffer.from(result.diffPng, "base64"));
        }
      }
      rows.push(row);
      console.log(`${id}: ${row.status}${row.ratio !== undefined ? ` (${pct(row.ratio)} of pixels)` : ""}`);
    }
  }
} finally {
  await browser.close();
  beforeSite.server.close();
  afterSite.server.close();
}

const flagged = rows.filter((row) => row.flagged);
const lines = [
  "<!-- frame-visual-diff -->",
  "## Screenshot check",
  "",
  flagged.length
    ? `**${flagged.length} of ${rows.length}** key page views look different from main. Open the screenshots below to check they're intended.`
    : `No visible change on the ${PAGES.length} key pages (${rows.length} desktop and phone views).`,
  "",
  "| Page | View | Result | Pixels changed | Biggest change (px from top) | Height (main → PR) |",
  "| --- | --- | --- | --- | --- | --- |",
  ...rows.map((row) => `| \`${row.page}\` | ${row.viewport} | ${row.flagged ? "⚠️ " : ""}${row.status} | ${row.ratio === undefined ? "–" : pct(row.ratio)} | ${row.flagged && row.where ? row.where : "–"} | ${row.beforeHeight ?? "–"} → ${row.afterHeight ?? "–"} px |`),
  "",
  `Report only: this check never blocks a merge. A view is flagged when over ${pct(RATIO_THRESHOLD)} of its pixels change or its height moves more than ${HEIGHT_TOLERANCE_PX}px. The reviews carousel, videos and embeds are masked. Self-test: clean re-render ${pct(selftest.stableRatio)}, injected shift ${pct(selftest.shiftRatio)} (flagged).`,
];
writeFileSync(resolve(outDir, "summary.md"), `${lines.join("\n")}\n`);
writeFileSync(resolve(outDir, "summary.json"), `${JSON.stringify({ flagged: flagged.length, selftest, rows }, null, 2)}\n`);
console.log(`${flagged.length} of ${rows.length} views flagged`);
if (strict && flagged.length) process.exit(1);
