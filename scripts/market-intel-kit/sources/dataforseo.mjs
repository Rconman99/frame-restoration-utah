/**
 * DataForSEO client — BYOK (Ryan has account).
 *
 * Best per-city SERP + keyword search volume in the stack.
 *   - $0.0006/SERP standard, $0.002 live
 *   - Same price for any city/zip granularity
 *
 * Endpoints used:
 *   /serp/google/organic/live/advanced  — per-city org + paid + local pack
 *   /keywords_data/google_ads/search_volume/live  — absolute monthly volume
 *
 * Auth: DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars
 */

const BASE = 'https://api.dataforseo.com/v3';

function authHeader() {
  const login = process.env.DATAFORSEO_LOGIN;
  const pass = process.env.DATAFORSEO_PASSWORD;
  if (!login || !pass) {
    throw new Error('DATAFORSEO_LOGIN + DATAFORSEO_PASSWORD env vars required');
  }
  return `Basic ${Buffer.from(`${login}:${pass}`).toString('base64')}`;
}

/**
 * Per-city organic + paid SERP for a keyword.
 * Live endpoint — synchronous, ~3-5sec response.
 */
export async function fetchCitySerp({ keyword, city, state }) {
  const body = [{
    keyword,
    location_name: `${city},${state},United States`,
    language_code: 'en',
    device: 'desktop',
    depth: 50,
  }];
  const res = await fetch(`${BASE}/serp/google/organic/live/advanced`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO SERP ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const result = data.tasks?.[0]?.result?.[0];
  if (!result) return null;

  const items = result.items || [];
  const ads = items.filter((i) => i.type === 'paid');
  const organic = items.filter((i) => i.type === 'organic');
  const localPack = items.filter((i) => i.type === 'local_pack' || i.type === 'maps_pack');

  // Top-3 organic dominance check (directories saturating)
  const top3 = organic.slice(0, 3);
  const directoryDomains = /yelp\.com|angi\.com|homeadvisor|thumbtack|bbb\.org|nextdoor|google\.com\/maps/;
  const top3Saturation = top3.filter((r) => directoryDomains.test(r.url || '')).length / 3;

  return {
    keyword,
    city,
    raw: { adsCount: ads.length, organicCount: organic.length, localPackCount: localPack.length, totalItems: items.length },
    searchVolume: Math.min(1, (organic.length + ads.length) / 20),
    paidDensity: Math.min(1, ads.length / 4),
    organicSat: Math.min(1, top3Saturation),
    topAds: ads.slice(0, 4).map((a) => ({ title: a.title, url: a.url, description: a.description })),
    topOrganic: top3.map((o) => ({ title: o.title, url: o.url, rank: o.rank_absolute })),
  };
}

/**
 * Absolute monthly search volume per keyword per city.
 * More expensive per call but the only authoritative volume source.
 */
export async function fetchKeywordVolume({ keywords, city, state }) {
  const body = [{
    keywords,
    location_name: `${city},${state},United States`,
    language_code: 'en',
  }];
  const res = await fetch(`${BASE}/keywords_data/google_ads/search_volume/live`, {
    method: 'POST',
    headers: { Authorization: authHeader(), 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`DataForSEO Volume ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const rows = data.tasks?.[0]?.result || [];
  return rows.map((r) => ({
    keyword: r.keyword,
    city,
    monthlySearches: r.search_volume || 0,
    competition: r.competition_level || null,
    cpc: r.cpc || null,
  }));
}

/**
 * High-level helper: gather SERP + volume for a list of keywords across
 * a list of cities. Returns per-city aggregated factors.
 */
export async function fetchCityIntel(cities, keywords, { state }) {
  const out = {};
  for (const city of cities) {
    const cityName = city.name;
    let aggSearchVolume = 0, aggPaidDensity = 0, aggOrganicSat = 0;
    let n = 0;
    for (const kw of keywords) {
      try {
        const s = await fetchCitySerp({ keyword: kw, city: cityName, state });
        if (s) {
          aggSearchVolume += s.searchVolume;
          aggPaidDensity += s.paidDensity;
          aggOrganicSat += s.organicSat;
          n++;
        }
      } catch {
        // continue on per-keyword error
      }
    }
    out[city.id] = {
      cityId: city.id,
      name: cityName,
      keywordsChecked: n,
      searchVolume: n > 0 ? aggSearchVolume / n : 0,
      paidDensity: n > 0 ? aggPaidDensity / n : 0,
      organicSat: n > 0 ? aggOrganicSat / n : 0,
    };
  }
  return out;
}
