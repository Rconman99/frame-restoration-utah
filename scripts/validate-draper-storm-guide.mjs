#!/usr/bin/env node

import assert from "node:assert/strict";
import { access, readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import path from "node:path";

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const pagePath = path.join(repoRoot, "locations/draper/storm-damage.html");
const html = await readFile(pagePath, "utf8");

const normalize = (value) =>
  value
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&ndash;/g, "-")
    .replace(/\s+/g, " ")
    .trim();

const ldJsonBlocks = [
  ...html.matchAll(
    /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
  ),
].map((match) => JSON.parse(match[1]));

const faqNode = ldJsonBlocks.find((node) => node["@type"] === "FAQPage");
assert.ok(faqNode, "FAQPage schema must be present");

const schemaFaqs = faqNode.mainEntity.map((item) => ({
  question: normalize(item.name),
  answer: normalize(item.acceptedAnswer.text),
}));

const visibleFaqs = [
  ...html.matchAll(/<details\b[^>]*>([\s\S]*?)<\/details>/gi),
].map((detailsMatch) => {
  const summaryMatch = detailsMatch[1].match(
    /<summary\b[^>]*>([\s\S]*?)<\/summary>/i,
  );
  const answerMatch = detailsMatch[1].match(
    /<div\b[^>]*>([\s\S]*?)<\/div>/i,
  );
  assert.ok(summaryMatch && answerMatch, "Every visible FAQ needs a question and answer");
  return {
    question: normalize(summaryMatch[1].replace(/<span\b[^>]*>[\s\S]*?<\/span>/gi, "")),
    answer: normalize(answerMatch[1]),
  };
});

assert.equal(visibleFaqs.length, 4, "The page must expose exactly four FAQs");
assert.deepEqual(
  visibleFaqs,
  schemaFaqs,
  "Visible FAQs and FAQPage schema must match exactly",
);

const bannedClaims = [
  /\$450[^<]*\$3,800/i,
  /hail season runs/i,
  /underbuilt for gap-wind/i,
  /production builders often installed to minimum code/i,
  /fastening schedules rated for the point/i,
  /true mountain-spec materials/i,
  /strongest sustained winds in draper/i,
  /roofs up there age faster/i,
  /we routinely find/i,
  /targeted repairs, not replacements/i,
  /10-year workmanship warranty\.<\/p>/i,
  /on a draper utah home/i,
  /point of the mountain wind response/i,
  /corner canyon (?:down)?slope(?: gusts)?/i,
  /gap-wind/i,
  /gap winds did/i,
  /many draper homes are newer/i,
];

for (const pattern of bannedClaims) {
  assert.doesNotMatch(html, pattern, `Unsupported claim found: ${pattern}`);
}

const requiredLanguage = [
  "The carrier determines coverage.",
  "we do not adjust claims",
  "weather report establishes context, not a repair scope",
  "10-year workmanship warranty for covered installation work; written terms apply.",
  "property-specific inspections",
];

for (const phrase of requiredLanguage) {
  assert.ok(
    html.toLowerCase().includes(phrase.toLowerCase()),
    `Required policy language missing: ${phrase}`,
  );
}

const requiredSources = [
  "https://www.weather.gov/safety/thunderstorm",
  "https://www.draperutah.gov/business-development/building-and-renovating/building-permits/",
  "https://codes.iccsafe.org/content/IRC2024V2.0/chapter-9-roof-assemblies",
  "https://secure.utah.gov/llv/search/index.html",
  "https://insurance.utah.gov/consumers/home-insurance/home-claims-info/",
];

for (const source of requiredSources) {
  assert.ok(html.includes(source), `Required primary source missing: ${source}`);
}

const expectedDescription =
  "Storm damage roof repair in Draper, UT. Property-specific inspections, 24/7 temporary protection, condition documentation, and written repair scopes. Call 435-292-8802.";
for (const selectorPattern of [
  /<meta name="description" content="([^"]+)"/i,
  /<meta property="og:description" content="([^"]+)"/i,
  /<meta name="twitter:description" content="([^"]+)"/i,
]) {
  const match = html.match(selectorPattern);
  assert.equal(
    match?.[1],
    expectedDescription,
    "Meta and social descriptions must share the approved claim posture",
  );
}

const serviceNode = ldJsonBlocks.find((node) => node["@type"] === "Service");
assert.ok(serviceNode, "Service schema must be present");
assert.equal(
  serviceNode.description,
  "Storm damage roof repair in Draper, Utah with property-specific inspections, 24/7 temporary protection, roof-condition documentation, and written repair scopes.",
  "Service schema description must use the approved property-specific posture",
);

for (const fact of ["58 mph", "1 inch"]) {
  assert.ok(
    html.includes(`<strong>${fact}</strong>`),
    `Required sourced numeric fact missing: ${fact}`,
  );
}

assert.match(
  html,
  /"dateModified": "2026-07-25"/,
  "Service schema dateModified must reflect this review",
);
assert.match(
  html,
  /<time datetime="2026-07-25">Last updated: July 25, 2026<\/time>/,
  "Visible update date must match structured data",
);

const heroImageMatch = html.match(
  /<div class="page-hero-img"><img\b[^>]*src="([^"]+)"/i,
);
assert.ok(heroImageMatch, "Hero image must be present");
assert.ok(heroImageMatch[1].startsWith("/"), "Hero image must use a local path");
await access(path.join(repoRoot, heroImageMatch[1].slice(1)));

console.log(
  `Draper storm guide contract PASS (${visibleFaqs.length} FAQ pairs, ${requiredSources.length} primary sources, 2 sourced numeric facts, hero image present)`,
);
