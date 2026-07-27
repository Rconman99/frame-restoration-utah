#!/usr/bin/env node

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const pagePath = resolve(root, "blog/park-city/storm-damage-roof-repair-park-city.html");
const manifestPath = resolve(root, "data/blog-published/storm-damage-roof-repair-park-city.json");
const businessPath = resolve(root, "data/route-factory/business.json");
const generatorPath = resolve(root, "scripts/generate-blog-post.py");

const page = readFileSync(pagePath, "utf8");
const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
const business = JSON.parse(readFileSync(businessPath, "utf8"));
const generator = readFileSync(generatorPath, "utf8");

const jsonLdBlocks = [...page.matchAll(
  /<script\b[^>]*type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi,
)].map((match) => JSON.parse(match[1]));
const graph = jsonLdBlocks.flatMap((block) => block["@graph"] || [block]);

const organizationId = "https://www.framerestorationutah.com/#organization";
const authorId = "https://www.framerestorationutah.com/pages/about#landon-yokers";
const posting = graph.find((node) => node?.["@type"] === "BlogPosting");
const organization = graph.find((node) => node?.["@id"] === organizationId);

assert.ok(posting, "Park City page must expose BlogPosting schema");
assert.equal(posting.author?.["@id"], authorId, "author must use the canonical person @id");
assert.equal(posting.author?.worksFor?.["@id"], organizationId, "author must workFor the canonical organization");
assert.equal(posting.publisher?.["@id"], organizationId, "publisher must reference the canonical organization");

assert.ok(organization, "Park City page must embed the canonical organization node");
assert.equal(organization.name, business.brand);
assert.equal(organization.legalName, business.legal_entity);
assert.equal(organization.telephone, business.public_phone_e164);
assert.deepEqual(organization.sameAs, business.entity_links.sameAs);
assert.equal(organization.hasMap, business.entity_links.hasMap);
assert.equal(organization.address?.streetAddress, business.public_address.street);
assert.equal(organization.address?.addressLocality, business.public_address.locality);
assert.equal(organization.address?.addressRegion, business.public_address.region);
assert.equal(organization.address?.postalCode, business.public_address.postal_code);

assert.match(
  page,
  /class="article-byline"[^>]*>Written and reviewed by <a href="\/pages\/about">Landon Yokers<\/a>, Owner of <a href="\/">Frame Restoration Utah<\/a>/,
  "the schema author and publisher must also be visible in the article",
);
assert.match(
  page,
  /<a href="\/pages\/storm-damage">Frame Restoration Utah’s storm-damage team<\/a>/,
  "the cited editorial page must directly identify and link the related service entity",
);
assert.match(
  page,
  /<h2>How to Verify a Park City Roofer Before Authorizing Work<\/h2>[\s\S]*?Utah DOPL[\s\S]*?business identity in writing/,
  "the cited page must provide a visible independent-verification checklist",
);
assert.ok(
  manifest.sections.some((block) => block.type === "h2" && block.text === "How to Verify a Park City Roofer Before Authorizing Work"),
  "the verification checklist must remain in the source manifest",
);
assert.ok(
  manifest.sections.some((block) => block.type === "blockquote"
    && block.source_url === "https://commerce.utah.gov/dcp/education/home-improvement/"),
  "the official consumer-protection quotation must remain in the source manifest",
);
assert.match(page, /<blockquote><p>“Contractors in Utah are required to obtain a license and liability insurance\.”<\/p>/);
assert.match(
  page,
  /<a href="tel:\+14352928802" class="nav-call-mobile"[^>]*aria-label="Call Frame Restoration Utah at 435-292-8802"/,
  "the mobile header must expose a directly hittable call target",
);
assert.doesNotMatch(page, /images\/projects\/cities\/heber-valley-drone-poster\.webp/);
assert.match(page, /images\/projects\/heber-valley-drone-poster\.webp/);
assert.match(page, /<time datetime="2026-07-26">Last updated: July 26, 2026<\/time>/);
assert.doesNotMatch(page, /Frame Roofing Utah/, "the live page must use one canonical brand");
assert.doesNotMatch(JSON.stringify(manifest), /Frame Roofing Utah/, "the source manifest must use one canonical brand");

assert.match(generator, /organization_schema_json/);
assert.match(generator, /class="article-byline"/);
assert.match(generator, /class="nav-call-mobile"/);
assert.match(generator, /nav \{\{ height:76px; \}\}/);
assert.match(generator, /"publisher": \{\{"@id": "\{ORGANIZATION_ID\}"\}\}/);

console.log("Park City entity uplift validation passed");
