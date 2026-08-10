#!/usr/bin/env node
/**
 * Check or repair FAQ schema-to-visible-page parity across sitemap routes.
 *
 * --check (default) fails when a FAQPage question is absent from visible
 * question markup. --write copies only already-published schema Q/A text into
 * a visible details section; it does not generate or alter claims.
 */

import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const write = process.argv.includes("--write");
const stop = new Set("a an the do does did you your i my me we our is are was were be been will would can could should of to in on at for with from about and or but if how what when where which who why that this these those it its as by".split(" "));

function decode(value) {
  return value
    .replace(/&amp;/gu, "&").replace(/&lt;/gu, "<").replace(/&gt;/gu, ">")
    .replace(/&quot;/gu, '"').replace(/&nbsp;/gu, " ")
    .replace(/&#0?39;|&rsquo;|&lsquo;|&apos;|[’‘]/gu, "'")
    .replace(/&#8211;|&ndash;|&#8212;|&mdash;|[–—]/gu, "-")
    .replace(/&#x([0-9a-f]+);/giu, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/gu, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function normalize(value) {
  return decode(value).replace(/\s+/gu, " ").trim();
}

function tokens(value) {
  return normalize(value).toLowerCase().replace(/[^a-z0-9 ]/gu, " ").split(/\s+/gu)
    .filter((word) => word.length > 1 && !stop.has(word));
}

function rendered(question, candidates) {
  const questionTokens = tokens(question);
  if (!questionTokens.length) return true;
  return candidates.some((candidate) => {
    const candidateTokens = new Set(tokens(candidate));
    return questionTokens.filter((word) => candidateTokens.has(word)).length / questionTokens.length >= 0.6;
  });
}

function visibleQuestions(html) {
  const withoutScripts = html.replace(/<script[\s\S]*?<\/script>/giu, " ");
  const candidates = [];
  const patterns = [
    /<h[2-6][^>]*>([\s\S]*?)<\/h[2-6]>/giu,
    /<summary[^>]*>([\s\S]*?)<\/summary>/giu,
    /<dt[^>]*>([\s\S]*?)<\/dt>/giu,
    /<[^>]*class=["'][^"']*faq[-_](?:q|question)[^"']*["'][^>]*>([\s\S]*?)<\/[a-z0-9]+>/giu,
  ];
  for (const pattern of patterns) {
    for (const match of withoutScripts.matchAll(pattern)) {
      const text = normalize(match[1].replace(/<[^>]+>/gu, " "));
      if (text) candidates.push(text);
    }
  }
  return candidates;
}

function walk(value, visitor) {
  if (Array.isArray(value)) {
    for (const item of value) walk(item, visitor);
  } else if (value && typeof value === "object") {
    visitor(value);
    for (const child of Object.values(value)) walk(child, visitor);
  }
}

function faqPairs(html) {
  const pairs = [];
  for (const match of html.matchAll(/<script[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/giu)) {
    let data;
    try { data = JSON.parse(match[1]); } catch { continue; }
    walk(data, (node) => {
      const types = Array.isArray(node["@type"]) ? node["@type"] : [node["@type"]];
      if (!types.includes("FAQPage") || !Array.isArray(node.mainEntity)) return;
      for (const question of node.mainEntity) {
        const name = String(question?.name || "").trim();
        const answer = String(question?.acceptedAnswer?.text || "").trim();
        if (name && answer) pairs.push({ question: name, answer });
      }
    });
  }
  return pairs;
}

function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function localPage(urlValue) {
  const clean = new URL(urlValue).pathname.replace(/^\/+|\/+$/gu, "");
  const candidates = clean ? [`${clean}.html`, `${clean}/index.html`, clean] : ["index.html"];
  return candidates.find((candidate) => fs.existsSync(path.join(root, candidate)));
}

const sitemap = fs.readFileSync(path.join(root, "sitemap.xml"), "utf8");
const pages = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/gu)].map((match) => localPage(match[1])).filter(Boolean);
const failures = [];
let updated = 0;

for (const rel of new Set(pages)) {
  const absolute = path.join(root, rel);
  let html = fs.readFileSync(absolute, "utf8");
  const pairs = faqPairs(html);
  if (!pairs.length) continue;
  const questions = visibleQuestions(html);
  const missing = pairs.filter((pair) => !rendered(pair.question, questions));
  if (!missing.length) continue;
  if (!write) {
    failures.push(`${rel}: ${missing.length}/${pairs.length} FAQ schema question(s) are not visible`);
    continue;
  }

  const heading = questions.length ? "Additional Frequently Asked Questions" : "Frequently Asked Questions";
  const items = missing.map(({ question, answer }) =>
    `    <details class="faq-item"><summary class="faq-q">${escapeHtml(question)}</summary><p class="faq-a">${escapeHtml(answer)}</p></details>`
  ).join("\n");
  const section = `\n<section class="faq-section faq-schema-parity" aria-label="${heading}">\n  <div class="section-inner">\n    <h2>${heading}</h2>\n${items}\n  </div>\n</section>\n`;
  const marker = html.lastIndexOf("</main>") >= 0 ? "</main>" : "<footer";
  const index = html.lastIndexOf(marker);
  if (index < 0) {
    failures.push(`${rel}: cannot place visible FAQ section (no </main> or <footer>)`);
    continue;
  }
  html = html.slice(0, index) + section + html.slice(index);
  fs.writeFileSync(absolute, html);
  updated += 1;
}

if (failures.length) {
  for (const failure of failures) console.error(`::error::${failure}`);
  process.exit(1);
}

if (write) console.log(`FAQ visibility repair complete: ${updated} page(s) updated from existing schema`);
else console.log(`PASS FAQ schema visibility: ${pages.length} sitemap routes checked`);
