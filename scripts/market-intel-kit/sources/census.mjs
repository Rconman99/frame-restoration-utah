/**
 * US Census Bureau API client — FREE, no fees.
 *
 * Pulls two datasets per ZIP:
 *   - ACS 5-year: median HHI, owner-occupancy %, household count, age
 *   - ZBP: count of business establishments by NAICS by ZIP
 *     (NAICS 238160 = roofing contractors)
 *
 * Combined output → demoFit + paidDensity inputs to the scoring algo.
 *
 * Auth: free key from api.census.gov/data/key_signup.html
 *   export CENSUS_API_KEY=xxx
 *
 * Rate limit: 500 req/IP/day (soft). Cache aggressively — ACS lags
 * ~18mo, ZBP ~24mo, neither changes often.
 */

const ACS_YEAR = 2023; // most recent ACS 5-year as of 2026
const ZBP_YEAR = 2022;

/**
 * Pull ACS demographics for a list of ZIPs.
 * Returns: { [zip]: { medianHHI, ownerOccupied, totalHouseholds, ownerPct } }
 */
export async function fetchAcsDemographics(zips, { apiKey } = {}) {
  apiKey = apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) throw new Error('CENSUS_API_KEY env var required');
  if (!zips || zips.length === 0) return {};

  // B19013_001E = median HHI; B25003_002E = owner-occupied units;
  // B25003_001E = total occupied units (denominator for owner %)
  const fields = ['NAME', 'B19013_001E', 'B25003_002E', 'B25003_001E'];
  const url = `https://api.census.gov/data/${ACS_YEAR}/acs/acs5?get=${fields.join(',')}&for=zip%20code%20tabulation%20area:${zips.join(',')}&key=${apiKey}`;

  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Census ACS API ${res.status}: ${await res.text()}`);
  }
  const rows = await res.json();
  // First row is headers
  const header = rows[0];
  const idx = (name) => header.indexOf(name);
  const out = {};
  for (let i = 1; i < rows.length; i++) {
    const row = rows[i];
    const zip = row[idx('zip code tabulation area')];
    const medianHHI = parseInt(row[idx('B19013_001E')], 10) || null;
    const ownerOccupied = parseInt(row[idx('B25003_002E')], 10) || 0;
    const totalHouseholds = parseInt(row[idx('B25003_001E')], 10) || 0;
    out[zip] = {
      zip,
      name: row[idx('NAME')],
      medianHHI,
      ownerOccupied,
      totalHouseholds,
      ownerPct: totalHouseholds > 0 ? ownerOccupied / totalHouseholds : 0,
    };
  }
  return out;
}

/**
 * Pull ZIP Business Patterns count by NAICS code.
 * Returns: { [zip]: establishmentCount }
 *
 * NAICS examples for local-service:
 *   238160 = roofing contractors
 *   238220 = plumbing/HVAC contractors
 *   621210 = dental offices
 *   238210 = electrical contractors
 *   561730 = landscaping
 */
export async function fetchZbpEstablishments(zips, naicsCode, { apiKey } = {}) {
  apiKey = apiKey || process.env.CENSUS_API_KEY;
  if (!apiKey) throw new Error('CENSUS_API_KEY env var required');
  if (!zips || zips.length === 0) return {};

  // ZBP API requires per-zip query (no comma-separated list support)
  const out = {};
  for (const zip of zips) {
    const url = `https://api.census.gov/data/${ZBP_YEAR}/zbp?get=ESTAB,EMP&NAICS2017=${naicsCode}&for=zipcode:${zip}&key=${apiKey}`;
    try {
      const res = await fetch(url);
      if (!res.ok) {
        out[zip] = { zip, establishments: 0, employment: 0, error: `${res.status}` };
        continue;
      }
      const rows = await res.json();
      if (rows.length < 2) {
        // No matching businesses
        out[zip] = { zip, establishments: 0, employment: 0 };
        continue;
      }
      const header = rows[0];
      const row = rows[1];
      out[zip] = {
        zip,
        establishments: parseInt(row[header.indexOf('ESTAB')], 10) || 0,
        employment: parseInt(row[header.indexOf('EMP')], 10) || 0,
      };
    } catch (err) {
      out[zip] = { zip, establishments: 0, employment: 0, error: String(err) };
    }
  }
  return out;
}

/**
 * High-level helper: take a list of cities (each with .zips[]) and a
 * NAICS code, return per-city aggregated demographics + competitor density.
 *
 * Output normalized 0-1 for use as scoring factors.
 */
export async function fetchCityIntel(cities, { naicsCode, apiKey } = {}) {
  apiKey = apiKey || process.env.CENSUS_API_KEY;
  const allZips = [...new Set(cities.flatMap((c) => c.zips || []))];
  if (allZips.length === 0) return {};

  const acs = await fetchAcsDemographics(allZips, { apiKey });
  const zbp = naicsCode ? await fetchZbpEstablishments(allZips, naicsCode, { apiKey }) : {};

  // National benchmarks for normalization (rough; better-than-this is the
  // top decile for local-service customer fit)
  const HHI_TOP = 150_000;     // top decile HHI
  const OWNER_TOP = 0.85;      // 85% owner-occupied = top decile
  const COMP_DENSE = 20;       // 20+ roofers per ZIP = saturated

  const out = {};
  for (const city of cities) {
    const cityZips = city.zips || [];
    if (cityZips.length === 0) {
      out[city.id] = { error: 'no zips' };
      continue;
    }

    let totalHH = 0, totalOwners = 0, weightedHHI = 0, totalEstabs = 0;
    for (const zip of cityZips) {
      const a = acs[zip];
      if (!a) continue;
      totalHH += a.totalHouseholds;
      totalOwners += a.ownerOccupied;
      if (a.medianHHI) weightedHHI += a.medianHHI * a.totalHouseholds;
      const z = zbp[zip];
      if (z) totalEstabs += z.establishments;
    }

    const avgHHI = totalHH > 0 ? weightedHHI / totalHH : 0;
    const ownerPct = totalHH > 0 ? totalOwners / totalHH : 0;
    const compDensity = cityZips.length > 0 ? totalEstabs / cityZips.length : 0;

    out[city.id] = {
      cityId: city.id,
      name: city.name,
      zips: cityZips,
      raw: { medianHHI: avgHHI, ownerPct, compDensity, totalHouseholds: totalHH, totalEstablishments: totalEstabs },
      // Normalized 0-1 factors
      demoFit: clamp01(((avgHHI / HHI_TOP) * 0.6) + ((ownerPct / OWNER_TOP) * 0.4)),
      // paidDensity is INVERSE — high competitor density = bad for paid (more bid inflation)
      paidDensity: clamp01(compDensity / COMP_DENSE),
    };
  }
  return out;
}

function clamp01(n) {
  return Math.max(0, Math.min(1, n));
}
