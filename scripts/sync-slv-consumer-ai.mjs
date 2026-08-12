#!/usr/bin/env node

import assert from "node:assert/strict";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { CONSUMER_AI_ENGINES, latestConsumerAiReadingPerWeek, normalizeConsumerAiReading, trailingCompleteConsumerAiStreak } from "./lib/slv-consumer-ai.mjs";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const write = process.argv.includes("--write");
const check = process.argv.includes("--check") || !write;
assert.notEqual(write && process.argv.includes("--check"), true, "use either --write or --check");

const outputPath = "data/rank-tracker/SLV-CONSUMER-AI-LATEST.json";
const importRoot = "data/rank-tracker/consumer-ai-imports";
const portfolioPath = "data/rank-tracker/SLV-18-CITY-GOAL-PORTFOLIO-2026-08-12.json";
const suiteReceiptPath = "data/rank-tracker/evidence/SLV-CONSUMER-AI-SUITE-2026-08-12.json";
const read = (file) => JSON.parse(fs.readFileSync(path.join(root, file), "utf8"));
const sha256 = (file) => crypto.createHash("sha256").update(fs.readFileSync(path.join(root, file))).digest("hex");
const portfolio = read(portfolioPath);
const suiteReceipt = read(suiteReceiptPath);
const suiteBySlug = new Map(suiteReceipt.panels.map((panel) => [panel.citySlug, panel]));

const cities = portfolio.cityGoals.map((goal) => {
  const suitePanel = suiteBySlug.get(goal.slug);
  assert.ok(suitePanel, `missing consumer-AI suite panel: ${goal.slug}`);
  assert.equal(suitePanel.city, goal.city);
  const directory = path.join(root, importRoot, goal.slug);
  const sources = fs.existsSync(directory)
    ? fs.readdirSync(directory).filter((file) => /^\d{4}-\d{2}-\d{2}\.json$/.test(file)).sort().map((file) => `${importRoot}/${goal.slug}/${file}`)
    : [];
  const readings = sources.map((source) => ({
    source,
    sha256: sha256(source),
    reading: normalizeConsumerAiReading(read(source), {
      city: goal.city,
      slug: goal.slug,
      expectedPanelId: suitePanel.panelId,
      expectedMarket: `utah-${goal.slug}`,
    }),
  }));
  const weekly = latestConsumerAiReadingPerWeek(readings.map((item) => item.reading));
  const latest = weekly.at(-1) || null;
  const completeStreak = trailingCompleteConsumerAiStreak(weekly);
  const state = latest
    ? "measured-complete-nine-row-panels"
    : suitePanel.scheduled
      ? "configured-scheduled-unmeasured-invalid-provider-credential"
      : "configured-manual-unmeasured-invalid-provider-credential";
  return {
    city: goal.city,
    slug: goal.slug,
    panelId: suitePanel.panelId,
    scheduled: suitePanel.scheduled,
    identityEvidence: suitePanel.identityEvidence,
    state,
    rawCompleteReadings: readings.length,
    comparableWeeklyPanels: weekly.length,
    latest: latest ? {
      date: latest.date,
      isoWeek: latest.isoWeek,
      rates: latest.rates,
      allEnginesNamedAndCited: latest.allEnginesNamedAndCited,
    } : null,
    weeklyPanels: weekly.map((panel) => ({
      date: panel.date,
      isoWeek: panel.isoWeek,
      weekStart: panel.weekStart,
      rates: panel.rates,
      allEnginesNamedAndCited: panel.allEnginesNamedAndCited,
    })),
    consecutiveAllEngineCompletePanels: completeStreak,
    sustainedFourWeekTarget: completeStreak >= 4,
    sources: readings.map(({ source, sha256: hash }) => ({ file: source, sha256: hash })),
  };
});

const artifact = {
  schemaVersion: 1,
  ledgerId: "frame-utah-slv-consumer-ai-measurement-v1",
  market: "utah-salt-lake-valley",
  status: cities.some((city) => city.latest) ? "measured-partial-city-coverage" : "configured-unmeasured-invalid-provider-credential",
  publicMutationPerformed: false,
  policy: {
    engines: CONSUMER_AI_ENGINES,
    promptsPerEngine: 3,
    completeRowsPerCityPanel: 9,
    targetRatePerEngine: 1,
    requiredConsecutiveWeeklyPanels: 4,
    missingData: "A failed provider call, missing import, incomplete nine-row panel, wrong panel ID, extra engine, or invalid rate fails closed and is never converted to zero visibility.",
    privacy: "Only normalized per-engine rates, panel/date provenance, and source hashes are stored here; answers, prompts, raw provider payloads, credentials, and reviewer/customer identities are not imported.",
  },
  sources: {
    portfolio: { file: portfolioPath, role: "city-order-and-slug join; hash omitted to avoid a generated-artifact dependency cycle" },
    suiteReceipt: { file: suiteReceiptPath, sha256: sha256(suiteReceiptPath) },
  },
  summary: {
    cities: cities.length,
    configuredPanels: cities.length,
    scheduledPanels: cities.filter((city) => city.scheduled).length,
    citiesWithCompleteReading: cities.filter((city) => city.latest).length,
    comparableWeeklyPanels: cities.reduce((sum, city) => sum + city.comparableWeeklyPanels, 0),
    citiesAtFourWeekConsumerAiTarget: cities.filter((city) => city.sustainedFourWeekTarget).length,
  },
  nextAction: "Replace BRIGHT_DATA_KEY with a valid Bright Data user API key. The released tracker will commit complete Salt Lake City and Millcreek readings; Utah's daily read-only importer will copy only normalized rates into matching dated city paths and refresh the goal ledgers.",
  cities,
};

assert.equal(artifact.summary.cities, 18);
assert.equal(artifact.summary.configuredPanels, 18);
assert.equal(artifact.summary.scheduledPanels, 2);
assert.equal(suiteBySlug.size, 18);
assert.ok(cities.every((city) => city.sources.every((source) => source.file.endsWith(".json"))));
assert.ok(cities.every((city) => !city.latest || Object.keys(city.latest.rates).sort().join(",") === [...CONSUMER_AI_ENGINES].sort().join(",")));

const nextText = `${JSON.stringify(artifact, null, 2)}\n`;
const fullOutputPath = path.join(root, outputPath);
if (write) {
  fs.writeFileSync(fullOutputPath, nextText);
  console.log(`SYNC SLV consumer AI: ${artifact.summary.citiesWithCompleteReading}/18 cities measured, ${artifact.summary.citiesAtFourWeekConsumerAiTarget} at four-week target`);
} else if (check) {
  assert.ok(fs.existsSync(fullOutputPath), `missing ${outputPath}`);
  assert.equal(fs.readFileSync(fullOutputPath, "utf8"), nextText, "SLV consumer-AI ledger is stale; run npm run sync:slv-consumer-ai");
  console.log(`PASS SLV consumer AI: ${artifact.summary.citiesWithCompleteReading}/18 measured, missing/failed panels remain unmeasured`);
}
