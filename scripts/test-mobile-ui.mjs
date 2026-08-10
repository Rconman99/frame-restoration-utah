#!/usr/bin/env node
/**
 * Rendered responsive UI gate for the shared Utah navigation and contact dock.
 *
 * Serves the static site locally, renders representative customer routes at
 * narrow and tall phone sizes, plus compact and full desktop widths. It verifies
 * that the dock is compact and non-stacking and that the fixed header retains
 * reliable, non-wrapping call, inspection, and menu targets at every breakpoint.
 */

import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const defaultRoot = resolve(fileURLToPath(new URL("..", import.meta.url)));
const root = resolve(process.env.FRAME_UI_SITE_ROOT || defaultRoot);
assert(
  existsSync(resolve(root, "index.html")),
  `FRAME_UI_SITE_ROOT must contain index.html: ${root}`,
);
const routes = [
  "/",
  "/locations/sandy",
  "/pages/roof-repair",
  "/blog/utah/how-to-choose-a-roofer-utah",
  "/blog/ogden/wind-damage-roof-repair",
  "/blog/alpine/roof-replacement-alpine-utah",
];
const viewports = [
  { width: 360, height: 740 },
  { width: 393, height: 852 },
  { width: 430, height: 932 },
];
const headerViewports = [
  { width: 320, height: 568, mode: "collapsed" },
  { width: 1024, height: 768, mode: "collapsed" },
  { width: 1280, height: 800, mode: "compact" },
  { width: 1440, height: 900, mode: "full" },
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
const configuredChrome = process.env.FRAME_UI_CHROMIUM_EXECUTABLE;
const browser = await chromium.launch({
  headless: true,
  ...(configuredChrome
    ? { executablePath: configuredChrome }
    : (existsSync(systemChrome) ? { executablePath: systemChrome } : {})),
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

  for (const viewport of headerViewports) {
    const page = await browser.newPage({ viewport });
    const pageErrors = [];
    page.on("pageerror", (error) => pageErrors.push(error.message));
    await page.goto(origin, { waitUntil: "domcontentloaded" });

    const header = await page.evaluate(() => {
      const links = document.querySelector(".nav-links");
      const phone = document.querySelector(".nav-phone");
      const cta = document.querySelector(".nav-cta");
      const menu = document.querySelector("#menuBtn");
      const mobileCall = document.querySelector(".nav-call-mobile");
      const hitTarget = (element) => {
        const rect = element.getBoundingClientRect();
        const hit = document.elementFromPoint(
          rect.left + rect.width / 2,
          rect.top + rect.height / 2,
        );
        return hit?.closest("a,button") === element;
      };
      const dimensions = (element) => {
        const rect = element.getBoundingClientRect();
        return {
          width: rect.width,
          height: rect.height,
          centerHitsTarget: hitTarget(element),
        };
      };
      const nav = document.querySelector("nav");
      return {
        linksDisplay: getComputedStyle(links).display,
        phone: dimensions(phone),
        phoneWhiteSpace: getComputedStyle(phone).whiteSpace,
        cta: dimensions(cta),
        menu: dimensions(menu),
        menuDisplay: getComputedStyle(menu).display,
        mobileCall: dimensions(mobileCall),
        mobileCallDisplay: getComputedStyle(mobileCall).display,
        navOverflow: nav.scrollWidth - nav.clientWidth,
      };
    });

    assert(header.navOverflow <= 1, `header overflows at ${viewport.width}px`);
    if (viewport.mode === "collapsed") {
      assert.equal(header.linksDisplay, "none", "tablet header must collapse crowded links");
      assert.equal(header.menuDisplay, "flex", "tablet header must expose the menu control");
      assert.equal(header.mobileCallDisplay, "flex", "tablet header must expose the call control");
      assert(
        header.menu.width >= 44 && header.menu.height >= 44 && header.menu.centerHitsTarget,
        "tablet menu control must be a reliable 44px target",
      );
      assert(
        header.mobileCall.width >= 44
          && header.mobileCall.height >= 44
          && header.mobileCall.centerHitsTarget,
        "tablet call control must be a reliable 44px target",
      );

      await page.locator("#menuBtn").click();
      const openMenu = await page.evaluate(() => {
        const nav = document.querySelector("nav").getBoundingClientRect();
        const linksElement = document.querySelector(".nav-links");
        const links = linksElement.getBoundingClientRect();
        return {
          expanded: document.querySelector("#menuBtn").getAttribute("aria-expanded"),
          top: links.top,
          bottom: links.bottom,
          navBottom: nav.bottom,
          width: links.width,
          clientHeight: linksElement.clientHeight,
          scrollHeight: linksElement.scrollHeight,
          overflowY: getComputedStyle(linksElement).overflowY,
        };
      });
      assert.equal(openMenu.expanded, "true", "tablet menu must report its expanded state");
      assert(
        openMenu.top + 1 >= openMenu.navBottom,
        "expanded tablet menu must begin below the fixed header",
      );
      assert(openMenu.width <= viewport.width + 1, "expanded tablet menu must fit the viewport");
      assert(
        openMenu.bottom <= viewport.height + 1,
        "expanded navigation must remain bounded by the viewport",
      );
      assert.equal(openMenu.overflowY, "auto", "expanded navigation must be independently scrollable");

      const lastActionVisible = await page.evaluate(() => {
        const links = document.querySelector(".nav-links");
        links.scrollTop = links.scrollHeight;
        const lastAction = links.querySelector("li:last-child a").getBoundingClientRect();
        return lastAction.bottom <= window.innerHeight + 1;
      });
      assert(lastActionVisible, "every expanded-menu action must remain reachable");
    } else {
      assert.equal(header.linksDisplay, "flex", "desktop header must retain its visible links");
      assert.equal(header.phoneWhiteSpace, "nowrap", "desktop phone number must stay on one line");
      assert(
        header.phone.width >= 44
          && header.phone.height >= 44
          && header.phone.centerHitsTarget,
        `desktop phone control must be a reliable 44px target at ${viewport.width}px`,
      );
      assert(
        header.cta.width >= 44 && header.cta.height >= 44 && header.cta.centerHitsTarget,
        `desktop inspection CTA must be a reliable 44px target at ${viewport.width}px`,
      );
    }
    assert.deepEqual(pageErrors, [], `desktop header emitted browser errors: ${pageErrors.join("; ")}`);
    checks += 1;
    await page.close();
  }

  // Regression for the landscape keyboard-focus defect caught in production:
  // the homepage video could receive focus while its only visible slice sat
  // behind the fixed contact dock. Recreate that geometry directly, focus the
  // escaped control, wait for focus settlement, and require a hittable slice.
  {
    const viewport = { width: 740, height: 360 };
    const page = await browser.newPage({ viewport });
    await page.goto(origin, { waitUntil: "load" });
    await page.addStyleTag({
      content: `
        html { scroll-behavior: auto !important; }
        .sticky-call {
          opacity: 1 !important;
          pointer-events: auto !important;
          transform: none !important;
          visibility: visible !important;
        }
      `,
    });
    await page.evaluate(() => {
      const video = document.querySelector("#video-showcase video");
      const dock = document.querySelector(".sticky-call");
      if (!(video instanceof HTMLVideoElement) || !(dock instanceof HTMLElement)) {
        throw new Error("homepage video or fixed contact dock is missing");
      }
      document.querySelector("#menuBtn")?.focus({ preventScroll: true });
      const videoRect = video.getBoundingClientRect();
      const dockRect = dock.getBoundingClientRect();
      window.scrollBy(0, videoRect.top - dockRect.top - 2);
      dock.setAttribute("data-scroll-state", "visible");
      dock.setAttribute("aria-hidden", "false");
      video.focus({ preventScroll: true });
    });
    await page.evaluate(() => new Promise((resolveFrame) => {
      let previousScrollY = window.scrollY;
      let stableFrames = 0;
      const sample = () => {
        const currentScrollY = window.scrollY;
        stableFrames = Math.abs(currentScrollY - previousScrollY) < 0.5
          ? stableFrames + 1
          : 0;
        previousScrollY = currentScrollY;
        if (stableFrames >= 3) {
          resolveFrame();
          return;
        }
        requestAnimationFrame(sample);
      };
      requestAnimationFrame(sample);
    }));

    const result = await page.evaluate(() => {
      const element = document.activeElement;
      if (!element?.matches("#video-showcase video")) return null;
      const rects = [...element.getClientRects()].filter((rect) => (
        rect.width > 0
        && rect.height > 0
        && rect.right > 0
        && rect.bottom > 0
        && rect.left < innerWidth
        && rect.top < innerHeight
      ));
      const fractions = [0.1, 0.3, 0.5, 0.7, 0.9];
      const points = rects.flatMap((rect) => {
        const left = Math.max(0, rect.left);
        const top = Math.max(0, rect.top);
        const right = Math.min(innerWidth, rect.right);
        const bottom = Math.min(innerHeight, rect.bottom);
        if (right <= left || bottom <= top) return [];
        return fractions.flatMap((xFraction) => fractions.map((yFraction) => [
          left + (right - left) * xFraction,
          top + (bottom - top) * yFraction,
        ]));
      });
      return {
        exposed: points.some(([x, y]) => {
          const top = document.elementFromPoint(x, y);
          return top && (top === element || element.contains(top));
        }),
        label: element.getAttribute("aria-label") || "homepage video",
      };
    });
    assert(result, "landscape focus regression did not focus #video-showcase video");
    assert(result.exposed, `landscape keyboard focus fully obscured: ${result.label}`);
    checks += 1;
    await page.close();
  }
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}

console.log(`PASS rendered responsive UI: ${checks} route/viewport combinations`);
