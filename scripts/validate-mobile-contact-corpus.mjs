#!/usr/bin/env node
/** Freeze the mobile Call + Text contract across every indexed Utah route. */

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const urls = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map((match) => match[1]);
const failures = [];

function localPage(value) {
  const pathname = new URL(value).pathname.replace(/^\/+|\/+$/gu, "");
  const candidates = pathname
    ? [`${pathname}.html`, `${pathname}/index.html`, pathname]
    : ["index.html"];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
}

for (const url of urls) {
  const rel = localPage(url);
  if (!rel) {
    failures.push(`${url}: no local page`);
    continue;
  }
  const html = fs.readFileSync(path.join(root, rel), "utf8");
  const dockOpenings = [...html.matchAll(/<div\b[^>]*class=["']([^"']*)["'][^>]*>/giu)]
    .filter((match) => match[1].split(/\s+/u).includes("sticky-call"));
  const dockTail = dockOpenings.length === 1 ? html.slice(dockOpenings[0].index) : "";
  const canonicalDock = dockTail.match(/^<div\b[^>]*>[\s\S]*?<div\b[^>]*class=["']sticky-call-actions["'][^>]*>([\s\S]*?)<\/div>\s*<\/div>/iu);
  const problems = [];

  if (dockOpenings.length !== 1) problems.push(`expected 1 sticky dock, found ${dockOpenings.length}`);
  if (!canonicalDock) {
    problems.push("missing canonical dual-action dock markup");
  } else {
    const actions = canonicalDock[1];
    if ((actions.match(/href=["']tel:\+14352928802["']/giu) || []).length !== 1) problems.push("dock must contain one public Call link");
    if ((actions.match(/href=["']sms:\+14352928802["']/giu) || []).length !== 1) problems.push("dock must contain one public Text link");
    if ((actions.match(/data-cta=["']mobile-call["']/giu) || []).length !== 1) problems.push("dock Call tracking is missing or duplicated");
    if ((actions.match(/data-cta=["']mobile-sms["']/giu) || []).length !== 1) problems.push("dock Text tracking is missing or duplicated");
  }
  if (!/<link\b[^>]*href=["']\/global\.css(?:\?[^"']*)?["']/iu.test(html)) problems.push("missing global.css");
  if (!/<script\b[^>]*src=["']\/global-modal\.js(?:\?[^"']*)?["']/iu.test(html)) problems.push("missing global-modal.js");
  if (problems.length) failures.push(`${rel}: ${problems.join("; ")}`);
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}

assert(urls.length > 100, "sitemap corpus unexpectedly small");
console.log(`PASS mobile contact corpus: ${urls.length}/${urls.length} indexed routes have one Call + Text dock`);
