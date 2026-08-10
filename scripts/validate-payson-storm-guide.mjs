#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(
  repoRoot,
  "blog/payson/storm-damage-roof-repair-payson.html",
);
const html = await readFile(pagePath, "utf8");

const normalize = (value) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&rsquo;/g, "'")
    .replace(/\s+/g, " ")
    .trim();

const ldJsonBlocks = [
  ...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ),
].map((match) => JSON.parse(match[1]));

const faqNode = ldJsonBlocks
  .flatMap((block) => block["@graph"] ?? [block])
  .find((node) => node["@type"] === "FAQPage");

assert.ok(faqNode, "FAQPage schema must be present");

const schemaFaqs = faqNode.mainEntity.map((item) => ({
  question: normalize(item.name),
  answer: normalize(item.acceptedAnswer.text),
}));

const visibleFaqs = [
  ...html.matchAll(
    /<details><summary>([\s\S]*?)<\/summary><p>([\s\S]*?)<\/p><\/details>/gi,
  ),
].map((match) => ({
  question: normalize(match[1]),
  answer: normalize(match[2]),
}));

assert.equal(visibleFaqs.length, 4, "The guide must expose exactly four FAQs");
assert.deepEqual(
  visibleFaqs,
  schemaFaqs,
  "Visible FAQ copy and FAQPage schema must match exactly",
);

const howToNode = ldJsonBlocks
  .flatMap((block) => block["@graph"] ?? [block])
  .find((node) => node["@type"] === "HowTo");

// Google retired HowTo rich results; the schema was removed site-wide and must
// stay out, while the visible step-by-step guidance stays for readers and AI answers.
assert.equal(
  howToNode,
  undefined,
  "Deprecated HowTo schema must stay removed",
);

const visibleHowToMatch = html.match(
  /<ol class="howto-steps">([\s\S]*?)<\/ol>/i,
);
assert.ok(visibleHowToMatch, "Visible step-by-step guidance must remain present");
const visibleSteps = [
  ...visibleHowToMatch[1].matchAll(
    /<li><h3>([\s\S]*?)<\/h3><p>([\s\S]*?)<\/p><\/li>/gi,
  ),
].map((match) => ({
  name: normalize(match[1]),
  text: normalize(match[2]),
}));
assert.ok(
  visibleSteps.length >= 3,
  "Visible step-by-step guidance must not be emptied",
);

const bannedClaims = [
  /most utah homeowners insurance policies cover/i,
  /support proper claim approval/i,
  /satisfies insurance requirements/i,
  /ensure full scope approval/i,
  /\bguarantees?\b/i,
  /full legal protection/i,
  /what it costs/i,
  /every repair is backed/i,
  /long-term protection against installation defects/i,
];

for (const pattern of bannedClaims) {
  assert.doesNotMatch(html, pattern, `Unsafe or unsupported claim found: ${pattern}`);
}

const requiredLanguage = [
  "The carrier determines coverage.",
  "we do not adjust claims",
  "DOPL Licensee Lookup and Verification System",
  "IRC Chapter 9",
  "10-year workmanship warranty for covered installation work; written terms apply.",
];

for (const phrase of requiredLanguage) {
  assert.ok(html.includes(phrase), `Required policy language missing: ${phrase}`);
}

const requiredSources = [
  "https://www.weather.gov/safety/thunderstorm",
  "https://insurance.utah.gov/consumers/home-insurance/home-claims-info/",
  "https://secure.utah.gov/llv/search/index.html",
  "https://codes.iccsafe.org/content/IRC2024V2.0/chapter-9-roof-assemblies",
];

for (const source of requiredSources) {
  assert.ok(html.includes(source), `Required primary source missing: ${source}`);
}

const numericEvidence = ["58 mph", "1 inch"];
for (const fact of numericEvidence) {
  assert.ok(
    html.includes(`<strong>${fact}</strong>`),
    `Required sourced numeric fact missing: ${fact}`,
  );
}
assert.match(
  html,
  /"dateModified": "2026-07-25"/,
  "Structured data dateModified must reflect this review",
);

const featuredImageMatch = html.match(
  /<figure class="blog-featured-image"[\s\S]*?<img\b[^>]*src="([^"]+)"/i,
);
assert.ok(featuredImageMatch, "Featured image must be present");
assert.ok(
  featuredImageMatch[1].startsWith("/"),
  "Featured image must use a repository-local path",
);
await access(path.join(repoRoot, featuredImageMatch[1].slice(1)));

console.log(
  `Payson storm guide contract PASS (${visibleFaqs.length} FAQ pairs, ${visibleSteps.length} visible steps, ${requiredSources.length} primary sources, ${numericEvidence.length} sourced numeric facts, featured image present)`,
);
