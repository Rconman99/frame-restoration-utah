#!/usr/bin/env node
/**
 * Rendered accessibility regression for the customer-facing homepage forms.
 *
 * Placeholder text is not a durable accessible name: this gate renders both
 * the inline hero form and the runtime inspection modal, then requires every
 * non-hidden form control to have an associated label. It also locks the six
 * placeholder-only fields to explicit, screen-reader-only labels and unique
 * IDs so a future form refactor cannot silently remove their names.
 */

import assert from "node:assert/strict";
import { createReadStream, existsSync, statSync } from "node:fs";
import { createServer } from "node:http";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
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

await new Promise((resolveListen, reject) => {
  server.once("error", reject);
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

const expectedSrOnlyIds = {
  "#heroForm": ["heroName", "heroPhone", "heroAddress", "heroZip", "heroEmail", "heroCity"],
  "#frModalForm": [
    "frModalName",
    "frModalPhone",
    "frModalAddress",
    "frModalZip",
    "frModalEmail",
    "frModalCity",
  ],
};

try {
  const page = await browser.newPage();
  await page.route("**/*", async (route) => {
    if (route.request().url().startsWith(origin)) {
      await route.continue();
    } else {
      await route.abort();
    }
  });
  await page.goto(origin, { waitUntil: "domcontentloaded" });

  await page.evaluate(() => {
    const trigger = document.createElement("button");
    trigger.className = "free-inspection-trigger";
    trigger.type = "button";
    document.body.appendChild(trigger);
    trigger.click();
    trigger.remove();
  });
  await page.waitForFunction(() => Boolean(window.FrameRestorationModal));
  await page.locator("#frModalForm").waitFor({ state: "attached" });

  const report = await page.evaluate((formSelectors) => {
    const forms = formSelectors.map((selector) => document.querySelector(selector));
    const allIds = [...document.querySelectorAll("[id]")].map((element) => element.id);
    const controls = forms.flatMap((form) =>
      [...form.querySelectorAll("input:not([type='hidden']), select, textarea")].filter(
        (control) => !control.closest("[aria-hidden='true']"),
      ),
    );
    const unlabeled = controls
      .filter((control) => !control.labels?.length && !control.getAttribute("aria-label") && !control.getAttribute("aria-labelledby"))
      .map((control) => `${control.form.id}[name=${control.name}]`);
    const duplicateIds = allIds.filter((id, index) => allIds.indexOf(id) !== index);
    const labels = Object.fromEntries(
      forms.map((form) => [
        form.id,
        [...form.querySelectorAll("input:not([type='hidden']), select, textarea")]
          .filter((control) => !control.closest("[aria-hidden='true']"))
          .map((control) => ({
            id: control.id,
            name: control.name,
            labelCount: control.labels?.length || 0,
            labelClasses: [...(control.labels || [])].map((label) => label.className),
            placeholder: control.getAttribute("placeholder"),
            required: control.required,
            autocomplete: control.getAttribute("autocomplete"),
          })),
      ]),
    );
    return { duplicateIds, unlabeled, labels };
  }, Object.keys(expectedSrOnlyIds));

  assert.deepEqual(report.duplicateIds, [], "live form controls must use unique IDs");
  assert.deepEqual(report.unlabeled, [], "customer-facing hero/modal controls must have labels");

  for (const [formSelector, ids] of Object.entries(expectedSrOnlyIds)) {
    const formLabels = report.labels[formSelector.slice(1)];
    const byId = new Map(formLabels.map((control) => [control.id, control]));
    for (const id of ids) {
      const control = byId.get(id);
      assert(control, `${formSelector} is missing expected labeled control #${id}`);
      assert.equal(control.labelCount, 1, `${formSelector} #${id} must have one associated label`);
      assert(
        control.labelClasses.some((className) => className.split(/\s+/u).includes("sr-only")),
        `${formSelector} #${id} label must be screen-reader-only`,
      );
    }
  }

  const fieldContracts = {
    "#heroForm": {
      names: ["name", "phone", "address", "zip", "email", "city"],
      fields: {
        name: { placeholder: "Full Name", required: true, autocomplete: "name" },
        phone: { placeholder: "Mobile Phone", required: true, autocomplete: "tel" },
        address: { placeholder: "Street Address (optional)", required: false, autocomplete: "street-address" },
        zip: { placeholder: "ZIP Code", required: true, autocomplete: "postal-code" },
        email: { placeholder: "Email Address (optional)", required: false, autocomplete: "email" },
        city: { placeholder: "City (optional)", required: false, autocomplete: null },
      },
    },
    "#frModalForm": {
      names: ["name", "phone", "address", "zip", "email", "city"],
      fields: {
        name: { placeholder: "Full Name", required: true, autocomplete: "name" },
        phone: { placeholder: "Mobile Phone", required: true, autocomplete: "tel" },
        address: { placeholder: "Street Address (optional)", required: false, autocomplete: "street-address" },
        zip: { placeholder: "ZIP Code", required: true, autocomplete: "postal-code" },
        email: { placeholder: "Email Address (optional)", required: false, autocomplete: "email" },
        city: { placeholder: "City (optional)", required: false, autocomplete: null },
      },
    },
  };
  for (const [formSelector, contract] of Object.entries(fieldContracts)) {
    const formLabels = report.labels[formSelector.slice(1)];
    assert.deepEqual(
      formLabels.filter((control) => contract.names.includes(control.name)).map((control) => control.name),
      contract.names,
      `${formSelector} placeholder field order changed`,
    );
    for (const [name, expected] of Object.entries(contract.fields)) {
      const actual = formLabels.find((control) => control.name === name);
      assert(actual, `${formSelector} is missing ${name}`);
      assert.equal(actual.placeholder, expected.placeholder, `${formSelector} ${name} placeholder changed`);
      assert.equal(actual.required, expected.required, `${formSelector} ${name} required state changed`);
      assert.equal(actual.autocomplete, expected.autocomplete, `${formSelector} ${name} autocomplete changed`);
    }
  }

  await page.close();
  console.log("Form accessibility contract passed: hero and runtime modal controls are labeled with unique IDs.");
} finally {
  await browser.close();
  await new Promise((resolveClose) => server.close(resolveClose));
}
