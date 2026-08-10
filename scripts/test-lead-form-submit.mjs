#!/usr/bin/env node
/**
 * Rendered regression for the two homepage lead forms.
 *
 * A second catch-all submit listener previously caused every click to POST the
 * same lead twice. This test intercepts the live Edge Function URL and asserts
 * that each form emits exactly one request, without sending customer data.
 */

import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const endpointPath = "/functions/v1/handle-lead";
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
  let relative = pathname === "/" ? "index.html" : pathname.replace(/^\/+/, "");
  if (!extname(relative)) relative += ".html";
  const absolute = resolve(root, relative);
  if (absolute !== root && !absolute.startsWith(`${root}${sep}`)) return null;
  return absolute;
}

async function requirePostCount(posts, expected, label) {
  const deadline = Date.now() + 5_000;
  while (posts.length < expected && Date.now() < deadline) {
    await new Promise((resolveWait) => setTimeout(resolveWait, 25));
  }
  assert.equal(
    posts.length,
    expected,
    `${label} emitted ${posts.length} lead POSTs; expected ${expected}`,
  );
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

try {
  for (const fixture of [
    { id: "#heroForm", nativeFallback: true, fields: { name: "Regression Test", phone: "4355550100", zip: "84032" } },
    { id: "#leadForm", nativeFallback: true, fields: { first_name: "Regression Test", phone: "4355550100", zip: "84032" } },
    { id: "#frModalForm", openModal: true, nativeFallback: true, fields: { name: "Regression Test", phone: "4355550100", zip: "84032" } },
  ]) {
    const page = await browser.newPage();
    const posts = [];
    page.on("dialog", (dialog) => dialog.dismiss());
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === endpointPath) {
        posts.push({ method: request.method(), body: request.postDataJSON() });
        await route.fulfill({
          status: 503,
          contentType: "application/json",
          body: JSON.stringify({ success: false }),
        });
        return;
      }
      if (request.url().startsWith(origin)) {
        await route.continue();
        return;
      }
      await route.abort();
    });

    await page.goto(origin, { waitUntil: "domcontentloaded" });
    if (fixture.openModal) {
      await page.evaluate(() => {
        const trigger = document.createElement('button');
        trigger.className = 'free-inspection-trigger';
        document.body.appendChild(trigger);
        trigger.click();
        trigger.remove();
      });
      await page.waitForFunction(() => Boolean(window.FrameRestorationModal));
    }
    const form = page.locator(fixture.id);
    const honeypot = form.locator('input[name="company_website"]');
    assert.equal(await honeypot.count(), 1, `${fixture.id} must contain one honeypot`);
    assert.equal(await honeypot.inputValue(), "", `${fixture.id} honeypot must start blank`);
    assert.equal(await honeypot.getAttribute("tabindex"), "-1", `${fixture.id} honeypot must stay out of tab order`);
    if (fixture.nativeFallback) {
      assert.equal(await form.getAttribute("method"), "post", `${fixture.id} native fallback must POST`);
      assert.equal(
        new URL(await form.getAttribute("action")).pathname,
        endpointPath,
        `${fixture.id} native fallback must target handle-lead`,
      );
    }
    for (const [name, value] of Object.entries(fixture.fields)) {
      await form.locator(`[name="${name}"]`).fill(value);
    }
    await form.locator('button[type="submit"]').click();
    await requirePostCount(posts, 1, `${fixture.id} first submit`);
    assert.equal(posts[0].method, "POST", `${fixture.id} must POST`);
    assert.equal(posts[0].body.source_page, "/", `${fixture.id} must report its source page`);
    assert.equal(posts[0].body.company_website, "", `${fixture.id} must preserve the blank honeypot`);
    assert.equal(posts[0].body.sms_consent, false, `${fixture.id} must preserve optional SMS consent`);
    assert.match(posts[0].body.submission_key, /^[0-9a-f-]{36}$/iu, `${fixture.id} must send an idempotency key`);

    await form.locator('button[type="submit"]').click();
    await requirePostCount(posts, 2, `${fixture.id} retry`);
    assert.equal(
      posts[1].body.submission_key,
      posts[0].body.submission_key,
      `${fixture.id} must retain its idempotency key across an ambiguous retry`,
    );
    await page.close();
  }

  const noScriptContext = await browser.newContext({ javaScriptEnabled: false });
  for (const fixture of [
    { id: "#heroForm", fields: { name: "Fallback Test", phone: "4355550100", zip: "84032" } },
    { id: "#leadForm", fields: { first_name: "Fallback Test", phone: "4355550100", zip: "84032" } },
  ]) {
    const page = await noScriptContext.newPage();
    const posts = [];
    await page.route("**/*", async (route) => {
      const request = route.request();
      const url = new URL(request.url());
      if (url.pathname === endpointPath) {
        posts.push({
          url,
          method: request.method(),
          contentType: request.headers()["content-type"] || "",
          body: request.postData() || "",
        });
        await route.fulfill({ status: 200, contentType: "text/plain", body: "ok" });
        return;
      }
      if (request.url().startsWith(origin)) {
        await route.continue();
        return;
      }
      await route.abort();
    });

    await page.goto(origin, { waitUntil: "domcontentloaded" });
    const form = page.locator(fixture.id);
    const honeypot = form.locator('input[name="company_website"]');
    assert.equal(await honeypot.count(), 1, `${fixture.id} fallback honeypot is missing`);
    assert.equal(await honeypot.inputValue(), "", `${fixture.id} fallback honeypot must start blank`);
    for (const [name, value] of Object.entries(fixture.fields)) {
      await form.locator(`[name="${name}"]`).fill(value);
    }
    await form.locator('button[type="submit"]').click();
    await requirePostCount(posts, 1, `${fixture.id} no-script fallback`);
    assert.equal(posts[0].method, "POST", `${fixture.id} no-script fallback must POST`);
    assert.equal(posts[0].url.search, "", `${fixture.id} must not put lead PII in the URL`);
    assert.match(
      posts[0].contentType,
      /^application\/x-www-form-urlencoded/iu,
      `${fixture.id} fallback encoding changed`,
    );
    const payload = new URLSearchParams(posts[0].body);
    assert.equal(payload.get("source_page"), "/", `${fixture.id} fallback source is missing`);
    assert.equal(payload.get("phone"), "4355550100", `${fixture.id} fallback body lost the phone`);
    assert.equal(payload.get("company_website"), "", `${fixture.id} fallback body lost the honeypot`);
    await page.close();
  }
  await noScriptContext.close();
  console.log(
    "Lead form contract passed: one JSON POST per click, blank honeypots, stable retry keys, and POST-only no-script fallback.",
  );
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
