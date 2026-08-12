#!/usr/bin/env node

import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import process from "node:process";
import { parseArgs } from "node:util";
import { fileURLToPath } from "node:url";
import { normalizeConsumerAiReading } from "./lib/slv-consumer-ai.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const suitePath = "data/rank-tracker/evidence/SLV-CONSUMER-AI-SUITE-2026-08-12.json";
const suite = JSON.parse(fs.readFileSync(path.join(root, suitePath), "utf8"));

async function readSource(source) {
  if (/^https:\/\//i.test(source)) {
    const response = await fetch(source, {
      headers: { accept: "application/vnd.github.raw+json" },
      signal: AbortSignal.timeout(15_000),
    });
    if (response.status === 404) return null;
    if (!response.ok) throw new Error(`consumer-AI source HTTP ${response.status}`);
    return response.text();
  }
  if (!fs.existsSync(source)) return null;
  return fs.readFileSync(source, "utf8");
}

async function main() {
  const { values } = parseArgs({
    options: {
      city: { type: "string" },
      source: { type: "string" },
      "allow-missing": { type: "boolean", default: false },
      check: { type: "boolean", default: false },
    },
    strict: true,
  });
  assert.ok(values.city, "--city is required");
  const panel = suite.panels.find((candidate) => candidate.citySlug === values.city);
  assert.ok(panel, `unknown consumer-AI city: ${values.city}`);
  const source = values.source || `https://raw.githubusercontent.com/Rconman99/geo-aeo-tracker/main/data/fixed-panels/${panel.panelId}/readings.json`;
  const text = await readSource(source);
  if (text == null) {
    if (values["allow-missing"]) {
      console.log(`UNMEASURED ${panel.city}: no committed complete consumer-AI readings artifact`);
      return;
    }
    throw new Error(`consumer-AI readings not found: ${source}`);
  }
  const raw = JSON.parse(text);
  const reading = normalizeConsumerAiReading(raw, {
    city: panel.city,
    slug: panel.citySlug,
    expectedPanelId: panel.panelId,
    expectedMarket: `utah-${panel.citySlug}`,
  });
  const output = path.join(root, "data/rank-tracker/consumer-ai-imports", panel.citySlug, `${reading.date}.json`);
  const portableReading = {
    market: reading.market,
    service: reading.service,
    date: reading.date,
    rates: reading.rates,
    metric: reading.metric,
    panelId: reading.panelId,
    sourceArtifact: reading.sourceArtifact,
  };
  const contents = `${JSON.stringify(portableReading, null, 2)}\n`;
  if (values.check) {
    assert.ok(fs.existsSync(output), `missing imported consumer-AI reading: ${path.relative(root, output)}`);
    assert.equal(fs.readFileSync(output, "utf8"), contents, `stale imported consumer-AI reading: ${path.relative(root, output)}`);
    console.log(`PASS consumer-AI import: ${panel.city} ${reading.date}`);
    return;
  }
  fs.mkdirSync(path.dirname(output), { recursive: true });
  fs.writeFileSync(output, contents);
  console.log(`IMPORT consumer AI: ${panel.city} ${reading.date} -> ${path.relative(root, output)}`);
}

main().catch((error) => {
  console.error(`FAIL consumer-AI import: ${error instanceof Error ? error.message : String(error)}`);
  process.exitCode = 2;
});
