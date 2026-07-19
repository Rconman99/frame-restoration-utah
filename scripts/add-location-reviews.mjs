#!/usr/bin/env node
/**
 * One-shot: inject a REAL individual <Review> into the primary RoofingContractor
 * JSON-LD node of the top-10 traffic location pages (step 3 of the Gen-AI report
 * handoff). Real data only — every reviewer is taken from data/reviews-full.json
 * (the google-reviews-sync pool) and assigned to exactly one city. No
 * AggregateRating (audit-review-integrity.mjs would block it). Mirrors the proven
 * millcreek/sandy pattern: review is appended right after `parentOrganization`,
 * as the node's last property.
 *
 * Idempotent: skips a page that already has a <Review> or any aggregateRating.
 */
import fs from 'node:fs';
import path from 'node:path';

const repo = process.cwd();
const pool = JSON.parse(fs.readFileSync(path.join(repo, 'data/reviews-full.json'), 'utf8')).reviews;

// city slug -> real reviewer (distinct per page; varied text/length)
const MAP = {
  'salt-lake-city': 'Arikka Von',
  'west-valley-city': 'LeeAndra Jones',
  'west-jordan': 'Marie Conroe',
  'provo': 'Sam Thornton',
  'orem': 'Harold Wilson',
  'ogden': 'Thomas Hansen',
  'lehi': 'Preston Fairbourn',
  'layton': 'Emily Madsen',
  'park-city': 'Michael Henderson',
  'heber-city': 'Stephen Tolpinrud',
};

// Match the parentOrganization object (single-level, no nested braces) and keep
// its leading indentation so the inserted review aligns as a sibling property.
const PARENT_RE = /^([ \t]*)"parentOrganization":\s*\{[^{}]*"url":\s*"https:\/\/www\.framerestorationutah\.com"\s*\}/m;

let changed = 0;
for (const [slug, author] of Object.entries(MAP)) {
  const file = path.join(repo, 'locations', `${slug}.html`);
  let html = fs.readFileSync(file, 'utf8');

  if (/"@type":\s*"Review"/.test(html) || /"review"\s*:/.test(html)) { console.log(`skip ${slug}: already has a review`); continue; }
  if (/aggregateRating/i.test(html)) { console.log(`ABORT ${slug}: has aggregateRating (clone risk) — not touching`); continue; }

  const r = pool.find((x) => x.author === author);
  if (!r) { console.log(`ABORT ${slug}: "${author}" not in real review pool`); continue; }

  const m = html.match(PARENT_RE);
  if (!m) { console.log(`ABORT ${slug}: parentOrganization anchor not found`); continue; }
  const indent = m[1];
  const i = indent + '  ';

  const review =
    `,\n${indent}"review": {\n` +
    `${i}"@type": "Review",\n` +
    `${i}"reviewRating": {"@type": "Rating", "ratingValue": ${JSON.stringify(String(r.rating))}, "bestRating": "5"},\n` +
    `${i}"author": {"@type": "Person", "name": ${JSON.stringify(r.author)}},\n` +
    `${i}"datePublished": ${JSON.stringify(r.date)},\n` +
    `${i}"reviewBody": ${JSON.stringify(r.text)}\n` +
    `${indent}}`;

  html = html.replace(PARENT_RE, (full) => full + review);
  fs.writeFileSync(file, html);
  console.log(`✓ ${slug}: + Review by ${author} (${r.rating}★, ${r.date})`);
  changed++;
}
console.log(`\n${changed} page(s) updated.`);
