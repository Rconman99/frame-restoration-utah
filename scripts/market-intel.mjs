#!/usr/bin/env node
/**
 * Frame Roofing Utah market-intel runner.
 *
 * Reads scripts/market-intel-config.json (45 cities), runs the bundled
 * market-intel module (scripts/market-intel-kit/), writes data/market-intel-*.
 *
 * Sources (env-gated):
 *   CENSUS_API_KEY       — free, default on
 *   DATAFORSEO_LOGIN +   — BYOK, opt in with --use-dataforseo
 *     DATAFORSEO_PASSWORD
 *   SERPAPI_KEY          — BYOK, opt in with --use-serpapi
 *
 * Usage:
 *   node scripts/market-intel.mjs                      # offline / Census only
 *   node scripts/market-intel.mjs --use-dataforseo
 *   node scripts/market-intel.mjs --budget=20000 --storm=park-city,heber-city
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { runMarketIntel } from './market-intel-kit/market-intel.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PROJECT_ROOT = join(__dirname, '..');

function parseFlags(argv) {
  const flags = {};
  for (const a of argv.slice(2)) {
    if (a.startsWith('--')) {
      const [k, v] = a.slice(2).split('=');
      flags[k] = v ?? true;
    }
  }
  return flags;
}

const flags = parseFlags(process.argv);

const cfgPath = join(__dirname, 'market-intel-config.json');
if (!existsSync(cfgPath)) {
  console.error(`[market-intel] missing ${cfgPath}`);
  process.exit(1);
}
const cfg = JSON.parse(readFileSync(cfgPath, 'utf-8'));

const monthlyBudget = parseInt(flags.budget || cfg.monthlyBudget || '0', 10);
if (!monthlyBudget) {
  console.error('[market-intel] --budget required (or set monthlyBudget in config)');
  process.exit(1);
}

const stormCities = (flags.storm || cfg.stormCities || '')
  .toString()
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

console.log('\n[frame-utah market-intel]');
console.log(`  budget:   $${monthlyBudget.toLocaleString()}/mo`);
console.log(`  cities:   ${cfg.cities.length}`);
console.log(`  storm:    ${stormCities.length ? stormCities.join(', ') : '(none)'}`);
console.log('');

const result = await runMarketIntel({
  brand: cfg.brand,
  vertical: cfg.vertical || 'local-service',
  monthlyBudget,
  state: cfg.state,
  cities: cfg.cities,
  keywords: cfg.keywords || [],
  naicsCode: cfg.naicsCode,
  stormCities,
  sources: {
    census: !flags['no-census'],
    dataforseo: !!flags['use-dataforseo'],
    serpapi: !!flags['use-serpapi'],
  },
  onLog: (m) => console.log(m),
});

const dataDir = join(PROJECT_ROOT, 'data');
if (!existsSync(dataDir)) mkdirSync(dataDir, { recursive: true });

writeFileSync(join(dataDir, 'market-intel-report.md'), result.report);
writeFileSync(
  join(dataDir, 'market-intel-allocation.json'),
  JSON.stringify(
    { generatedAt: new Date().toISOString(), tier: result.tier, allocation: result.allocation, factors: result.factors },
    null,
    2,
  ) + '\n',
);

console.log('\n[market-intel] done.');
console.log(`  report:     data/market-intel-report.md`);
console.log(`  allocation: data/market-intel-allocation.json`);
console.log(`  total $/mo: $${result.allocation.totals.monthlyBudget.toLocaleString()}`);
console.log(`  tier:       ${result.tier.tier}`);
