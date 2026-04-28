/**
 * SerpAPI client — BYOK (Ryan's existing key works for both endpoints).
 *
 * Two roles:
 *   1. Per-city SERP — paid + organic competitors (search volume proxy)
 *   2. Google Maps — competitor GBP review counts (paidDensity supplement)
 *
 * Auth: SERPAPI_KEY env var
 * Cost: ~$0.005-0.015 per call. 12-city DFW run ≈ $0.20.
 *
 * Returns normalized 0-1 factors for the scoring algo.
 */

const BASE = 'https://serpapi.com/search.json';

export async function fetchCitySerp({ keyword, city, state }, opts = {}) {
  const apiKey = opts.apiKey || process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error('SERPAPI_KEY env var required');

  const params = new URLSearchParams({
    engine: 'google',
    q: keyword,
    location: `${city}, ${state}, United States`,
    google_domain: 'google.com',
    gl: 'us',
    hl: 'en',
    api_key: apiKey,
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`SerpAPI ${res.status}: ${await res.text()}`);
  const data = await res.json();

  const adsCount = (data.ads || []).length;
  const organicCount = (data.organic_results || []).length;
  const localPackCount = (data.local_results?.places || []).length;

  // Search volume proxy: higher organic + ads count = more demand. Real
  // volume needs DataForSEO Keyword Search Volume — this is a cheap stand-in.
  const searchSignal = Math.min(1, (organicCount + adsCount) / 20);
  // Paid density: more ads = more bid inflation
  const paidDensity = Math.min(1, adsCount / 4);
  // Organic saturation: top-3 ranks dominated by big brands?
  const top3 = (data.organic_results || []).slice(0, 3);
  const top3DomainAuthority = top3.filter((r) => {
    const host = (r.link || '').split('/')[2] || '';
    // Yelp/Angi/Google sub-domains saturate organic for many local-service queries
    return /yelp\.com|angi\.com|homeadvisor|thumbtack|bbb\.org|nextdoor/.test(host);
  }).length;
  const organicSat = Math.min(1, top3DomainAuthority / 3);

  return {
    keyword,
    city,
    raw: { adsCount, organicCount, localPackCount, top3: top3.map((r) => r.link) },
    searchVolume: searchSignal,
    paidDensity,
    organicSat,
  };
}

/**
 * Pull GBP map results for a competitor or service in a city.
 * Returns review-count distribution.
 */
export async function fetchGbpMaps({ keyword, city, state }, opts = {}) {
  const apiKey = opts.apiKey || process.env.SERPAPI_KEY;
  if (!apiKey) throw new Error('SERPAPI_KEY env var required');

  const params = new URLSearchParams({
    engine: 'google_maps',
    q: keyword,
    ll: city ? `@${city}` : '@Frisco,Texas', // user can pass exact lat/lng
    api_key: apiKey,
  });

  const res = await fetch(`${BASE}?${params}`);
  if (!res.ok) throw new Error(`SerpAPI Maps ${res.status}: ${await res.text()}`);
  const data = await res.json();
  const places = data.local_results || [];
  return {
    keyword,
    city,
    placeCount: places.length,
    topReviewCount: Math.max(0, ...places.slice(0, 10).map((p) => p.reviews || 0)),
    avgReviewCount: places.length ? places.slice(0, 10).reduce((a, p) => a + (p.reviews || 0), 0) / Math.min(10, places.length) : 0,
    top3: places.slice(0, 3).map((p) => ({ name: p.title, reviews: p.reviews, rating: p.rating })),
  };
}
