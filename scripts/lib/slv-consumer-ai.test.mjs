import test from "node:test";
import assert from "node:assert/strict";
import { latestConsumerAiReadingPerWeek, normalizeConsumerAiReading, trailingAlignedWeeklyStreak, trailingCompleteConsumerAiStreak } from "./slv-consumer-ai.mjs";

const base = {
  market: "utah-salt-lake-city",
  service: "roofing",
  date: "2026-08-17",
  rates: { chatgpt: 1, perplexity: 1, gemini: 1 },
  metric: "named-and-owned-domain-cited",
  panelId: "frame-utah-salt-lake-city-consumer-ai-v1",
  sourceArtifact: "runs/x.json",
};
const options = {
  city: "Salt Lake City",
  slug: "salt-lake-city",
  expectedPanelId: base.panelId,
  expectedMarket: base.market,
};

test("a complete three-engine reading normalizes to a comparable weekly panel", () => {
  const reading = normalizeConsumerAiReading(base, options);
  assert.equal(reading.isoWeek, "2026-W34");
  assert.equal(reading.allEnginesNamedAndCited, true);
});

test("missing, extra, invalid, or wrong-panel rates fail closed", () => {
  assert.throws(() => normalizeConsumerAiReading({ ...base, rates: { chatgpt: 1, perplexity: 1 } }, options), /exactly three engines/);
  assert.throws(() => normalizeConsumerAiReading({ ...base, rates: { ...base.rates, copilot: 1 } }, options), /exactly three engines/);
  assert.throws(() => normalizeConsumerAiReading({ ...base, rates: { ...base.rates, gemini: -1 } }, options), /between 0 and 1/);
  assert.throws(() => normalizeConsumerAiReading({ ...base, panelId: "wrong" }, options), /panel mismatch/);
  assert.throws(() => normalizeConsumerAiReading({ ...base, market: "utah-millcreek" }, options), /market mismatch/);
  assert.throws(() => normalizeConsumerAiReading({ ...base, sourceArtifact: "https:\/\/example.com\/raw.json" }, options), /relative runs/);
});

test("same-week reruns collapse to the latest complete panel", () => {
  const readings = [
    normalizeConsumerAiReading(base, options),
    normalizeConsumerAiReading({ ...base, date: "2026-08-18", rates: { chatgpt: 0, perplexity: 1, gemini: 1 } }, options),
  ];
  const weekly = latestConsumerAiReadingPerWeek(readings);
  assert.equal(weekly.length, 1);
  assert.equal(weekly[0].date, "2026-08-18");
  assert.equal(weekly[0].allEnginesNamedAndCited, false);
});

test("the completion streak stops at the first sub-1.0 engine panel", () => {
  const weeks = [
    normalizeConsumerAiReading({ ...base, date: "2026-08-03" }, options),
    normalizeConsumerAiReading({ ...base, date: "2026-08-10", rates: { chatgpt: 1, perplexity: 0.67, gemini: 1 } }, options),
    normalizeConsumerAiReading({ ...base, date: "2026-08-17" }, options),
    normalizeConsumerAiReading({ ...base, date: "2026-08-24" }, options),
  ];
  assert.equal(trailingCompleteConsumerAiStreak(weeks), 2);
});

test("aligned completion requires the same consecutive ISO weeks", () => {
  const consumer = ["2026-08-03", "2026-08-10", "2026-08-17", "2026-08-24"].map((date) =>
    normalizeConsumerAiReading({ ...base, date }, options),
  );
  const google = consumer.map(({ isoWeek, weekStart }) => ({ isoWeek, weekStart, complete: true }));
  assert.equal(trailingAlignedWeeklyStreak(google, consumer, (panel) => panel.complete, (panel) => panel.allEnginesNamedAndCited), 4);
  assert.equal(trailingAlignedWeeklyStreak(google, consumer.slice(1), (panel) => panel.complete, (panel) => panel.allEnginesNamedAndCited), 3);
  const gap = [google[0], google[1], google[3]];
  assert.equal(trailingAlignedWeeklyStreak(gap, consumer, (panel) => panel.complete, (panel) => panel.allEnginesNamedAndCited), 1);
});
