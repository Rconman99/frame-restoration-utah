#!/usr/bin/env node
/**
 * Chrome UX Report (CrUX) origin check — real-visitor Core Web Vitals, p75.
 *
 * Reports origin-level p75 LCP, INP and CLS for www.framerestorationutah.com
 * (phone and all devices) from the CrUX API, rated against Google's thresholds.
 * Warning-only: always exits 0. Skips cleanly when CRUX_API_KEY is not set,
 * when the API is unreachable, or when Google has too little traffic data.
 *
 * Usage:  CRUX_API_KEY=… node scripts/check-crux.mjs [--origin https://…]
 * The key is read from the environment only and never printed.
 */
import fs from 'node:fs';

const i = process.argv.indexOf('--origin');
const origin = i > 0 ? process.argv[i + 1] : 'https://www.framerestorationutah.com';
const key = process.env.CRUX_API_KEY;
const gha = !!process.env.GITHUB_ACTIONS;
const warn = (m) => console.log(gha ? `::warning title=CrUX::${m}` : `WARN: ${m}`);
const summary = (md) => { if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, md + '\n'); };

const METRICS = {
  largest_contentful_paint: { label: 'LCP', good: 2500, poor: 4000, fmt: (v) => `${(v / 1000).toFixed(2)} s` },
  interaction_to_next_paint: { label: 'INP', good: 200, poor: 500, fmt: (v) => `${v} ms` },
  cumulative_layout_shift: { label: 'CLS', good: 0.1, poor: 0.25, fmt: (v) => Number(v).toFixed(2) },
};
export const rate = (m, v) => (v <= METRICS[m].good ? 'good' : v <= METRICS[m].poor ? 'needs improvement' : 'poor');

async function query(formFactor) {
  const body = { origin, metrics: Object.keys(METRICS) };
  if (formFactor) body.formFactor = formFactor;
  const r = await fetch('https://chromeuxreport.googleapis.com/v1/records:queryRecord', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': key },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  });
  if (r.status === 404) return { missing: true };
  if (!r.ok) throw new Error(`HTTP ${r.status}`);
  return r.json();
}

async function main() {
  if (!key) {
    console.log('CRUX_API_KEY not set — skipping CrUX check.');
    summary('### CrUX\nSkipped: `CRUX_API_KEY` secret not set.');
    return;
  }
  const rows = [];
  for (const [ff, name] of [['PHONE', 'Phone'], [null, 'All devices']]) {
    let data;
    try { data = await query(ff); } catch (e) { warn(`CrUX request failed (${name}): ${e.message}`); continue; }
    if (data.missing) { console.log(`${name}: not enough Chrome traffic data in CrUX for ${origin}.`); continue; }
    for (const [m, def] of Object.entries(METRICS)) {
      const v = data.record?.metrics?.[m]?.percentiles?.p75;
      if (v === undefined) continue;
      const r = rate(m, Number(v));
      rows.push(`| ${name} | ${def.label} | ${def.fmt(v)} | ${r} |`);
      console.log(`${name.padEnd(11)} ${def.label.padEnd(4)} p75 ${def.fmt(v).padEnd(8)} ${r}`);
      if (r !== 'good') warn(`${name} ${def.label} p75 ${def.fmt(v)} is ${r}`);
    }
  }
  if (rows.length) summary(`### CrUX origin p75 — ${origin} (28-day real Chrome users)\n| Device | Metric | p75 | Rating |\n|---|---|---|---|\n${rows.join('\n')}`);
}

if (import.meta.url === `file://${process.argv[1]}`) main().catch((e) => warn(`unexpected error: ${e.message}`)).finally(() => process.exit(0));
