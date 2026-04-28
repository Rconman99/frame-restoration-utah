/**
 * Market intel orchestrator — composes sources + scoring + allocation
 * + reporter into a single end-to-end run.
 *
 * Usage:
 *   const out = await runMarketIntel({
 *     brand: 'Frame Restoration',
 *     vertical: 'local-service',
 *     monthlyBudget: 15000,
 *     state: 'Texas',
 *     cities: [{ id, name, zips, tier }, ...],
 *     keywords: ['roofer in {city}', 'roof repair {city}', ...],
 *     naicsCode: '238160',  // for Census ZBP competitor density
 *     stormCities: ['frisco', 'plano'],  // optional storm override
 *     sources: {
 *       census: true,            // free; default on
 *       dataforseo: true,        // BYOK; default off if no key
 *       serpapi: false,          // BYOK; default off if no key
 *     },
 *   });
 *
 * Returns: { allocation, factors, scoredCities, report }
 */

import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

import { scoreAllCities, classifyBudget } from './scoring.mjs';
import { allocateBudget, applyStormOverride } from './budget-allocator.mjs';
import { renderMarketIntelReport } from './reporter.mjs';

const __dirname = dirname(fileURLToPath(import.meta.url));

export async function runMarketIntel(opts) {
  const {
    brand,
    vertical = 'local-service',
    monthlyBudget,
    state,
    cities,
    keywords = [],
    naicsCode,
    stormCities = [],
    sources = {},
    onLog = () => {},
  } = opts;

  if (!cities || cities.length === 0) throw new Error('cities required');
  if (!monthlyBudget || monthlyBudget <= 0) throw new Error('monthlyBudget required');

  // Load channel definitions for the vertical
  const channelsConfig = JSON.parse(
    readFileSync(join(__dirname, `channels/${vertical}.json`), 'utf-8'),
  );

  // ── Gather factors per city ───────────────────────────────────────────
  const cityFactors = {};
  for (const c of cities) cityFactors[c.id] = {};

  // Census (free, default on)
  if (sources.census !== false) {
    try {
      const { fetchCityIntel } = await import('./sources/census.mjs');
      onLog('[market-intel] fetching Census demographics + ZBP competitor density…');
      const censusData = await fetchCityIntel(cities, { naicsCode });
      for (const [cityId, data] of Object.entries(censusData)) {
        cityFactors[cityId].demoFit = data.demoFit ?? 0.5;
        cityFactors[cityId].paidDensity = data.paidDensity ?? 0.5;
        cityFactors[cityId]._census = data;
      }
    } catch (err) {
      onLog(`[market-intel] Census skipped: ${err.message}`);
    }
  }

  // DataForSEO (BYOK)
  if (sources.dataforseo === true && process.env.DATAFORSEO_LOGIN) {
    try {
      const { fetchCityIntel: dfsCityIntel } = await import('./sources/dataforseo.mjs');
      onLog('[market-intel] fetching DataForSEO per-city SERP…');
      const dfs = await dfsCityIntel(cities, keywords, { state });
      for (const [cityId, data] of Object.entries(dfs)) {
        cityFactors[cityId].searchVolume = data.searchVolume ?? 0.5;
        cityFactors[cityId].organicSat = data.organicSat ?? 0.3;
        // DataForSEO's paidDensity is from SERP ads, more direct than Census ZBP — use it
        if (data.paidDensity !== undefined) cityFactors[cityId].paidDensity = data.paidDensity;
        cityFactors[cityId]._dataforseo = data;
      }
    } catch (err) {
      onLog(`[market-intel] DataForSEO skipped: ${err.message}`);
    }
  }

  // SerpAPI (BYOK)
  if (sources.serpapi === true && process.env.SERPAPI_KEY) {
    try {
      const { fetchCitySerp } = await import('./sources/serpapi.mjs');
      onLog('[market-intel] fetching SerpAPI SERP per city…');
      for (const c of cities) {
        for (const kw of keywords.slice(0, 2)) { // cap calls per city
          const resolvedKw = kw.replaceAll('{city}', c.name);
          try {
            const s = await fetchCitySerp({ keyword: resolvedKw, city: c.name, state });
            // average across keywords
            const f = cityFactors[c.id];
            f.searchVolume = ((f.searchVolume ?? 0) + s.searchVolume) / 2;
            f.paidDensity = ((f.paidDensity ?? 0) + s.paidDensity) / 2;
            f.organicSat = ((f.organicSat ?? 0) + s.organicSat) / 2;
          } catch {
            // continue
          }
        }
      }
    } catch (err) {
      onLog(`[market-intel] SerpAPI skipped: ${err.message}`);
    }
  }

  // Apply default seasonality (uniform 0.5; storm cities get 0.85)
  for (const c of cities) {
    cityFactors[c.id].season = stormCities.includes(c.id) ? 0.85 : 0.5;
    cityFactors[c.id].budgetFloor = 0.5; // neutral; channel-specific gating handled in scorer
    // Fill unset factors with 0.5 (neutral)
    for (const f of ['demoFit', 'searchVolume', 'paidDensity', 'organicSat']) {
      if (cityFactors[c.id][f] === undefined) cityFactors[c.id][f] = 0.5;
    }
  }

  // ── Score + allocate ──────────────────────────────────────────────────
  const tier = classifyBudget(monthlyBudget, channelsConfig.budgetTiers);
  onLog(`[market-intel] budget tier: ${tier.tier} (skip: ${tier.skipChannels.join(', ') || 'none'})`);

  const enrichedCities = cities.map((c) => ({
    ...c,
    monthlyBudget,
    factors: cityFactors[c.id],
  }));

  const scoredCities = scoreAllCities({
    cities: enrichedCities,
    channels: channelsConfig.channels,
    weights: channelsConfig.factorWeights,
  });

  let allocation = allocateBudget({
    scoredCities,
    totalMonthlyBudget: monthlyBudget,
    channels: channelsConfig.channels,
    skipChannels: tier.skipChannels,
  });

  if (stormCities.length > 0) {
    allocation = applyStormOverride(allocation, stormCities);
  }

  const report = renderMarketIntelReport(allocation, {
    brand,
    tier: tier.tier,
    antiPatterns: channelsConfig.antiPatterns,
    stormCities,
  });

  return {
    allocation,
    factors: cityFactors,
    scoredCities,
    tier,
    report,
  };
}
