#!/usr/bin/env node
/**
 * Rendered mobile UI gate for the shared Utah contact dock.
 *
 * Serves the static site locally, renders representative customer routes at
 * narrow and tall phone sizes, and verifies that the dock is compact, reserves
 * its real height, hides during downward reading, returns on upward intent,
 * and never stacks with the retired mobile exit overlay.
 */

import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const routes = ["/", "/locations/sandy", "/pages/roof-repair", "/blog/utah/how-to-choose-a-roofer-utah"];
const viewports = [
  { width: 360, height: 740 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const mimeTypes = {
  ".css": "text/css; charset=utf-8",
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".woff2": "font/woff2",
};

function resolveRequestPath(rawUrl) {
  const pathname = decodeURIComponent(new URL(rawUrl, "http://local.test").pathname);
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/u, "");
  if (!extname(relative)) relative += ".html";
  const absolute = resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

const server = createServer((request, response) => {
  const path = resolveRequestPath(request.url || "/");
  if (!path || !existsSync(path) || !statSync(path).isFile()) {
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

await new Promise((resolveListen, rejectListen) => {
  server.once("error", rejectListen);
  server.listen(0, "127.0.0.1", resolveListen);
});

const address = server.address();
assert(address && typeof address === "object");
const origin = `http://127.0.0.1:${address.port}`;
const systemChrome = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const browser = await chromium.launch({
  headless: true,
  ...(existsSync(systemChrome) ? { executablePath: systemChrome } : {}),
});
let checks = 0;

try {
  for (const viewport of viewports) {
    for (const route of routes) {
      const page = await browser.newPage({ viewport });
      const pageErrors = [];
      page.on("pageerror", (error) => pageErrors.push(error.message));
      await page.goto(`${origin}${route}`, { waitUntil: "domcontentloaded" });
      await page.waitForFunction(
        () => document.querySelector(".sticky-call")?.getAttribute("data-scroll-state") === "visible",
        null,
        { timeout: 8_000 },
      );

      const initial = await page.evaluate(() => {
        const bar = document.querySelector(".sticky-call");
        const buttons = [...document.querySelectorAll(".sticky-call-actions .sticky-call-btn")];
        const rect = bar.getBoundingClientRect();
        return {
          barHeight: rect.height,
          barRatio: rect.height / window.innerHeight,
          bodyPaddingBottom: Number.parseFloat(getComputedStyle(document.body).paddingBottom),
          buttonHeights: buttons.map((button) => button.getBoundingClientRect().height),
          exitOverlayCount: document.querySelectorAll(".fr-exit-intent").length,
          horizontalOverflow: document.documentElement.scrollWidth - document.documentElement.clientWidth,
          maxScroll: document.documentElement.scrollHeight - window.innerHeight,
        };
      });

      assert(initial.maxScroll > 1_000, `${route} must be long enough to exercise reading behavior`);
      assert(initial.barHeight > 0 && initial.barHeight <= 72, `${route} dock is ${initial.barHeight}px tall`);
      assert(initial.barRatio <= 0.1, `${route} dock consumes ${(initial.barRatio * 100).toFixed(1)}% of viewport`);
      assert(initial.bodyPaddingBottom + 1 >= initial.barHeight, `${route} final content reserve is too small`);
      assert.deepEqual(initial.buttonHeights.length, 2, `${route} must retain Call and Text actions`);
      assert(initial.buttonHeights.every((height) => height >= 44), `${route} has a sub-44px touch target`);
      assert.equal(initial.exitOverlayCount, 0, `${route} must not create a second fixed conversion overlay`);
      assert(initial.horizontalOverflow <= 1, `${route} has horizontal mobile overflow`);

      if (route === "/") {
        const evidence = await page.evaluate(() => {
          const grid = document.querySelector(".qa-evidence-grid");
          const items = [...document.querySelectorAll(".qa-evidence-item")];
          const links = [...document.querySelectorAll(".qa-evidence-item a")];
          const firstLinkStyle = links[0] ? getComputedStyle(links[0]) : null;
          return {
            gridColumns: grid ? getComputedStyle(grid).gridTemplateColumns : "",
            items: items.length,
            links: links.length,
            externalLinksSafe: links.every(
              (link) => link.target === "_blank" && link.relList.contains("noopener"),
            ),
            linkColor: firstLinkStyle?.color || "",
            linkDecorationColor: firstLinkStyle?.textDecorationColor || "",
            linkDecorationLine: firstLinkStyle?.textDecorationLine || "",
          };
        });
        assert.equal(evidence.items, 8, "homepage must render all eight evidence cards");
        assert(evidence.links >= 8, "homepage evidence sources must remain linked");
        assert.equal(evidence.externalLinksSafe, true, "evidence links must open safely");
        assert.equal(
          evidence.gridColumns.split(" ").length,
          1,
          `homepage evidence grid must be one column at ${viewport.width}px`,
        );
        assert.equal(evidence.linkColor, "rgb(11, 64, 96)", "evidence links must use Frame navy");
        assert.equal(
          evidence.linkDecorationColor,
          "rgb(225, 185, 105)",
          "evidence links must use the Frame gold underline",
        );
        assert(
          evidence.linkDecorationLine.includes("underline"),
          "evidence links must remain visibly identifiable",
        );
      }

      await page.evaluate(() => window.scrollTo(0, Math.min(1_600, document.documentElement.scrollHeight / 2)));
      await page.waitForFunction(
        () => document.querySelector(".sticky-call")?.getAttribute("data-scroll-state") === "hidden",
        null,
        { timeout: 2_000 },
      );
      const hidden = await page.evaluate(() => {
        const bar = document.querySelector(".sticky-call");
        return {
          ariaHidden: bar.getAttribute("aria-hidden"),
          visibility: getComputedStyle(bar).visibility,
        };
      });
      assert.equal(hidden.ariaHidden, "true", `${route} hidden dock must leave the accessibility tree`);
      assert.equal(hidden.visibility, "hidden", `${route} dock still covers content while reading down`);

      await page.evaluate(() => window.scrollBy(0, -240));
      await page.waitForFunction(
        () => document.querySelector(".sticky-call")?.getAttribute("data-scroll-state") === "visible",
        null,
        { timeout: 2_000 },
      );
      const restored = await page.evaluate(() => ({
        ariaHidden: document.querySelector(".sticky-call").getAttribute("aria-hidden"),
        exitOverlayCount: document.querySelectorAll(".fr-exit-intent").length,
      }));
      assert.equal(restored.ariaHidden, "false", `${route} dock did not return on upward intent`);
      assert.equal(restored.exitOverlayCount, 0, `${route} created an exit overlay after scroll reversal`);
      assert.deepEqual(pageErrors, [], `${route} emitted browser errors: ${pageErrors.join("; ")}`);

      checks += 1;
      await page.close();
    }
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(`PASS rendered mobile UI: ${checks} route/viewport combinations`);
