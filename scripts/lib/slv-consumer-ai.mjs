import assert from "node:assert/strict";

export const CONSUMER_AI_ENGINES = ["chatgpt", "perplexity", "gemini"];

export function isoWeekStart(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  assert.ok(Number.isFinite(date.getTime()), `invalid date: ${value}`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() - (day - 1));
  return date.toISOString().slice(0, 10);
}

export function isoWeekKey(value) {
  const date = new Date(`${String(value).slice(0, 10)}T00:00:00Z`);
  assert.ok(Number.isFinite(date.getTime()), `invalid date: ${value}`);
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil((((date - yearStart) / 86400000) + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function normalizeConsumerAiReading(reading, { city, slug, expectedPanelId, expectedMarket } = {}) {
  assert.ok(reading && typeof reading === "object", "consumer-AI reading must be an object");
  assert.equal(reading.metric, "named-and-owned-domain-cited", "unsupported consumer-AI metric");
  assert.equal(reading.panelId, expectedPanelId, `consumer-AI panel mismatch: ${city || slug}`);
  assert.equal(reading.market, expectedMarket, `consumer-AI market mismatch: ${city || slug}`);
  assert.equal(reading.service, "roofing", `consumer-AI service mismatch: ${city || slug}`);
  assert.match(String(reading.date || ""), /^\d{4}-\d{2}-\d{2}$/, "consumer-AI reading date must be YYYY-MM-DD");
  assert.match(String(reading.sourceArtifact || ""), /^runs\/[A-Za-z0-9._-]+\.json$/, "consumer-AI source artifact must be a relative runs/*.json path");
  const rateKeys = Object.keys(reading.rates || {}).sort();
  assert.deepEqual(rateKeys, [...CONSUMER_AI_ENGINES].sort(), "consumer-AI reading must contain exactly three engines");
  const rates = Object.fromEntries(CONSUMER_AI_ENGINES.map((engine) => {
    const value = Number(reading.rates[engine]);
    assert.ok(Number.isFinite(value) && value >= 0 && value <= 1, `${engine} rate must be between 0 and 1`);
    return [engine, value];
  }));
  return {
    city,
    slug,
    panelId: reading.panelId,
    market: reading.market,
    service: reading.service,
    date: reading.date,
    isoWeek: isoWeekKey(reading.date),
    weekStart: isoWeekStart(reading.date),
    metric: reading.metric,
    rates,
    completeNineRows: true,
    allEnginesNamedAndCited: CONSUMER_AI_ENGINES.every((engine) => rates[engine] === 1),
    sourceArtifact: reading.sourceArtifact || null,
  };
}

export function latestConsumerAiReadingPerWeek(readings = []) {
  const byWeek = new Map();
  for (const reading of readings) {
    const current = byWeek.get(reading.isoWeek);
    if (!current || reading.date >= current.date) byWeek.set(reading.isoWeek, reading);
  }
  return [...byWeek.values()].sort((a, b) => a.date.localeCompare(b.date));
}

export function trailingCompleteConsumerAiStreak(readings = []) {
  let count = 0;
  for (let index = readings.length - 1; index >= 0; index -= 1) {
    if (!readings[index].allEnginesNamedAndCited) break;
    count += 1;
  }
  return count;
}

export function trailingAlignedWeeklyStreak(primary = [], secondary = [], primaryPass = () => true, secondaryPass = () => true) {
  const secondaryByWeek = new Map(secondary.map((panel) => [panel.isoWeek, panel]));
  let count = 0;
  let laterWeekStart = null;
  for (let index = primary.length - 1; index >= 0; index -= 1) {
    const panel = primary[index];
    const counterpart = secondaryByWeek.get(panel.isoWeek);
    if (!counterpart) break;
    if (laterWeekStart) {
      const gap = new Date(`${laterWeekStart}T00:00:00Z`) - new Date(`${panel.weekStart}T00:00:00Z`);
      if (gap !== 7 * 86400000) break;
    }
    if (!primaryPass(panel) || !secondaryPass(counterpart)) break;
    count += 1;
    laterWeekStart = panel.weekStart;
  }
  return count;
}
