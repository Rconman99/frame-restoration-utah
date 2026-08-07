#!/usr/bin/env node
/**
 * Merge an AI-visibility measurement into a daily SEO snapshot
 * (data/seo/snapshots/<date>.json) without breaking the contract.
 *
 * WHY a script: the measurement itself runs in an ATTENDED Claude session
 * (WebSearch over the locked prompts in data/aeo/topic-portfolio-baseline.json
 * — procedure in docs/seo/SEO-LOOP.md), not in CI. This helper is the only
 * sanctioned writer of the ai_visibility block, and it enforces the honesty
 * rules so a session can't accidentally write a lie:
 *
 *   - prompts_ok of ZERO is refused. Every search failing is a non-measurement;
 *     {measured:true, prompts_ok:0} would read downstream as "asked, never
 *     cited", which is a different (and false) claim.
 *   - cited can never exceed prompts_ok.
 *   - The rest of the snapshot is read-modify-write: every other key survives.
 *   - What this records is SEARCH-RESULTS PRESENCE on locked prompts — a
 *     retrieval proxy, not proof an assistant cited the domain. Readouts must
 *     use those words (the diff already does).
 *
 * Usage:
 *   node scripts/seo-merge-ai-visibility.mjs --date 2026-08-06 \
 *     --prompts-ok 15 --cited 3 --competitors '{"yelp.com":6,"angi.com":4}'
 */

import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { fileURLToPath } from "node:url";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const SNAP_DIR = path.join(root, "data", "seo", "snapshots");

function fail(msg) {
  console.error(`[seo-merge-ai-visibility] ${msg}`);
  process.exit(2);
}

const args = {};
const argv = process.argv.slice(2);
for (let i = 0; i < argv.length; i += 1) {
  if (argv[i] === "--date") args.date = argv[++i];
  else if (argv[i] === "--prompts-ok") args.promptsOk = Number(argv[++i]);
  else if (argv[i] === "--cited") args.cited = Number(argv[++i]);
  else if (argv[i] === "--competitors") args.competitors = argv[++i];
}

if (!args.date || !/^\d{4}-\d{2}-\d{2}$/.test(args.date)) fail("--date YYYY-MM-DD is required");
if (!Number.isInteger(args.promptsOk) || args.promptsOk < 0) fail("--prompts-ok must be a non-negative integer");
if (!Number.isInteger(args.cited) || args.cited < 0) fail("--cited must be a non-negative integer");
if (args.promptsOk === 0) {
  fail("prompts_ok of 0 is not a measurement — every search failed, so nothing was measured. Not writing measured:true over that.");
}
if (args.cited > args.promptsOk) fail(`cited (${args.cited}) cannot exceed prompts_ok (${args.promptsOk})`);

let competitors = {};
if (args.competitors) {
  try {
    competitors = JSON.parse(args.competitors);
  } catch (err) {
    fail(`--competitors is not valid JSON: ${err.message}`);
  }
  if (typeof competitors !== "object" || Array.isArray(competitors)) fail("--competitors must be a JSON object of host -> prompt count");
}

const file = path.join(SNAP_DIR, `${args.date}.json`);
if (!fs.existsSync(file)) fail(`no snapshot at data/seo/snapshots/${args.date}.json — run seo-snapshot.mjs first`);

const snapshot = JSON.parse(fs.readFileSync(file, "utf8"));
snapshot.ai_visibility = { measured: true, prompts_ok: args.promptsOk, cited: args.cited, competitors };
fs.writeFileSync(file, `${JSON.stringify(snapshot, null, 2)}\n`);
console.log(`[seo-merge-ai-visibility] wrote ai_visibility (${args.cited}/${args.promptsOk} prompts cited) into ${path.relative(root, file)}`);
