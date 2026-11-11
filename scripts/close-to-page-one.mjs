#!/usr/bin/env node
/**
 * Weekly close-to-page-one queue.
 *
 * Pulls the lagged 28-day Search Console query+page report, keeps queries
 * whose average position is between 5 and 15, groups them by ranking page,
 * and writes the top 3 eligible pages as needs-review page-refresh tasks.
 *
 * GSC_SERVICE_ACCOUNT_JSON unset -> exit 0 with a skip notice. This does not
 * print the secret. An API or auth failure exits 1. Nothing here publishes.
 *
 *   node scripts/close-to-page-one.mjs
 *   node scripts/close-to-page-one.mjs --rows fixture.json --path-map map.json --edited-at dates.json --no-write
 *   node scripts/close-to-page-one.mjs --print-queue
 */

import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { fetchQueryPageRows } from "./lib/gsc.mjs";
import { buildQueue, renderQueueMarkdown, urlToRepoPath } from "./lib/close-to-page-one.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEFAULT_OUT = path.join(root, "data", "seo", "topic-queue");

function parseArgs(argv) {
  const args = { write: true, printQueue: false, root };
  for (let i = 0; i < argv.length; i += 1) {
    const flag = argv[i];
    if (flag === "--no-write") args.write = false;
    else if (flag === "--print-queue") args.printQueue = true;
    else if (flag === "--rows") args.rows = argv[++i];
    else if (flag === "--edited-at") args.editedAt = argv[++i];
    else if (flag === "--path-map") args.pathMap = argv[++i];
    else if (flag === "--now") args.now = argv[++i];
    else if (flag === "--out") args.out = argv[++i];
    else throw new Error(`unknown argument ${flag}`);
  }
  return args;
}

export function redactSecrets(message) {
  return String(message || "Search Console request failed")
    .replace(/-----BEGIN [^-]+-----[\s\S]*?-----END [^-]+-----/g, "[redacted key]")
    .replace(/"private_key"\s*:\s*"[^"]*"/g, '"private_key":"[redacted]"')
    .replace(/private_key[\s:=]+[^\s,}"']+/gi, "private_key=[redacted]");
}

function readJson(file) {
  return JSON.parse(fs.readFileSync(file, "utf8"));
}

function gitLastEdited(repoPath) {
  try {
    const stamp = execFileSync("git", ["log", "-1", "--format=%cI", "--", repoPath], {
      cwd: root,
      encoding: "utf8",
    }).trim();
    return stamp || null;
  } catch {
    return null;
  }
}

function setOutput(key, value) {
  if (!process.env.GITHUB_OUTPUT) return;
  fs.appendFileSync(process.env.GITHUB_OUTPUT, `${key}=${value}\n`);
}

function printQueue() {
  const file = path.join(DEFAULT_OUT, "close-to-page-one.json");
  if (!fs.existsSync(file)) {
    console.log("No close-to-page-one queue on this branch. Nothing to draft or publish.");
    return;
  }
  const queue = readJson(file);
  console.log(renderQueueMarkdown(queue));
  console.log("These tasks stay needs-review. This step does not draft a post and does not publish.");
}

function resolvers(args) {
  const pathMap = args.pathMap ? readJson(args.pathMap) : null;
  const editedMap = args.editedAt ? readJson(args.editedAt) : null;
  const pathForPage = (page) => {
    if (pathMap) return pathMap[page] || null;
    return urlToRepoPath(page, (rel) => fs.existsSync(path.join(root, rel)));
  };
  const editedAtByPath = (repoPath) => {
    if (editedMap) return Object.prototype.hasOwnProperty.call(editedMap, repoPath) ? editedMap[repoPath] : null;
    return gitLastEdited(repoPath);
  };
  return { pathForPage, editedAtByPath };
}

async function measuredRows(args) {
  if (args.rows) {
    const payload = readJson(args.rows);
    if (Array.isArray(payload)) return { rows: payload, window: null, siteUrl: null, truncated: false };
    return {
      rows: payload.rows || [],
      window: payload.window || null,
      siteUrl: payload.siteUrl || null,
      truncated: Boolean(payload.truncated),
    };
  }
  if (!process.env.GSC_SERVICE_ACCOUNT_JSON || !process.env.GSC_SERVICE_ACCOUNT_JSON.trim()) {
    const message = [
      "SKIP close-to-page-one: GSC_SERVICE_ACCOUNT_JSON is not configured.",
      "The daily SEO loop uses the same secret. Add the Search Console service-account JSON as the Actions secret GSC_SERVICE_ACCOUNT_JSON.",
      "Optional repository variable GSC_SITE_URL overrides the property (default https://www.framerestorationutah.com/).",
      "The secret value is not printed. No query list was invented.",
    ].join(" ");
    console.log(message);
    if (process.env.GITHUB_ACTIONS) console.log(`::notice title=Search Console not configured::${message}`);
    setOutput("skipped", "true");
    setOutput("wrote", "false");
    return null;
  }
  try {
    const pulled = await fetchQueryPageRows({ now: args.now ? new Date(args.now) : new Date() });
    if (!pulled) {
      console.log("SKIP close-to-page-one: GSC_SERVICE_ACCOUNT_JSON is not configured.");
      setOutput("skipped", "true");
      setOutput("wrote", "false");
      return null;
    }
    return pulled;
  } catch (error) {
    console.error(`::error::Search Console request failed: ${redactSecrets(error.message)}`);
    process.exit(1);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (args.printQueue) {
    printQueue();
    return;
  }
  const measured = await measuredRows(args);
  if (!measured) return;
  const now = args.now ? new Date(args.now) : new Date();
  if (Number.isNaN(now.getTime())) throw new Error("--now is not a valid date");
  const { pathForPage, editedAtByPath } = resolvers(args);
  const report = buildQueue({
    rows: measured.rows,
    window: measured.window,
    siteUrl: measured.siteUrl,
    truncated: measured.truncated,
    now,
    pathForPage,
    editedAtByPath,
  });
  const markdown = renderQueueMarkdown(report);
  if (!args.write) {
    process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
    setOutput("skipped", "false");
    setOutput("wrote", "false");
    return;
  }
  const outDir = args.out || DEFAULT_OUT;
  fs.mkdirSync(outDir, { recursive: true });
  fs.writeFileSync(path.join(outDir, "close-to-page-one.json"), `${JSON.stringify(report, null, 2)}\n`);
  fs.writeFileSync(path.join(outDir, "close-to-page-one.md"), markdown);
  console.log(markdown);
  console.log(`Wrote ${path.join(outDir, "close-to-page-one.json")} (${report.tasks.length} page-refresh task(s), needs-review, not published).`);
  setOutput("skipped", "false");
  setOutput("wrote", "true");
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  main().catch((error) => {
    console.error(`::error::${redactSecrets(error.message)}`);
    process.exit(1);
  });
}
