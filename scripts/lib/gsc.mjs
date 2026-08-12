/**
 * Google Search Console client for the SEO loop — service-account JWT auth,
 * zero npm dependencies (node:crypto signs the assertion).
 *
 * WHY a service account and not OAuth: the loop runs headless in GitHub
 * Actions. A service account is a non-interactive principal that the owner
 * adds ONCE as a user on the Search Console property; no consent screen, no
 * refresh-token rot.
 *
 * Setup (owner, once — full walkthrough in docs/seo/SEO-LOOP.md):
 *   1. Google Cloud Console -> create service account, download JSON key.
 *   2. Enable the "Google Search Console API" on that project.
 *   3. Search Console -> property -> Settings -> Users -> add the service
 *      account's email with Full/Restricted (read is enough).
 *   4. Repo secret GSC_SERVICE_ACCOUNT_JSON = the key file's contents
 *      (raw JSON or base64). Optional GSC_SITE_URL, default
 *      https://www.framerestorationutah.com/.
 *
 * Honesty contract: callers must treat ANY failure here as "not measured"
 * (gsc.available:false), never as zero. This module throws; it never returns
 * partial data.
 */

import crypto from "node:crypto";

const SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const DEFAULT_SITE = "https://www.framerestorationutah.com/";

// Fetch deep, store both orderings. The API returns clicks-desc with no sort
// control, so the zero-click impression volume lives in the tail — 1000 was not
// deep enough to reach it on a site with tens of thousands of impressions.
const QUERY_FETCH_LIMIT = 5000;
const QUERY_STORE_PER_ORDER = 200; // union of by-clicks and by-impressions, so <= 400 rows

function escapeRe2Literal(value) {
  return String(value).replace(/[\\^$.*+?()[\]{}|]/g, "\\$&");
}

/**
 * Build one exact, case-insensitive RE2 filter for the fixed rank panel.
 * Search Analytics sorts by clicks and may omit a zero-click query from the
 * broad query+page pull. A targeted filter lets the loop ask which URL Google
 * associated with every declared panel query instead of inferring it from a
 * city page's aggregate impressions.
 */
export function trackedQueryFilter(queries = []) {
  const requested = [...new Set(queries.map((query) => String(query).trim()).filter(Boolean))];
  if (requested.length === 0) return null;
  const expression = `(?i)^(?:${requested.map(escapeRe2Literal).join("|")})$`;
  if (Buffer.byteLength(expression, "utf8") > 4096) {
    throw new Error("tracked query filter exceeds Search Console's 4096-byte expression limit");
  }
  return {
    requested,
    dimensionFilterGroups: [
      {
        groupType: "and",
        filters: [{ dimension: "query", operator: "includingRegex", expression }],
      },
    ],
  };
}

function b64url(input) {
  return Buffer.from(input).toString("base64url");
}

export function readServiceAccount(env = process.env) {
  const raw = env.GSC_SERVICE_ACCOUNT_JSON;
  if (!raw || !raw.trim()) return null;
  const text = raw.trim().startsWith("{") ? raw : Buffer.from(raw, "base64").toString("utf8");
  const sa = JSON.parse(text);
  if (!sa.client_email || !sa.private_key) throw new Error("service account JSON missing client_email/private_key");
  return sa;
}

export async function getAccessToken(sa, { fetchImpl = fetch, now = Date.now() } = {}) {
  const iat = Math.floor(now / 1000);
  const header = b64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const claims = b64url(
    JSON.stringify({
      iss: sa.client_email,
      scope: SCOPE,
      aud: sa.token_uri || "https://oauth2.googleapis.com/token",
      iat,
      exp: iat + 3600,
    }),
  );
  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claims}`);
  const signature = signer.sign(sa.private_key).toString("base64url");
  const assertion = `${header}.${claims}.${signature}`;

  const res = await fetchImpl(sa.token_uri || "https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion,
    }),
  });
  const body = await res.json().catch(() => ({}));
  if (!res.ok || !body.access_token) {
    throw new Error(`token exchange failed (${res.status}): ${body.error_description || body.error || "no access_token"}`);
  }
  return body.access_token;
}

/**
 * The GSC window: 28 days ending ~3 days back, because Google's data lags.
 * Readouts must say the window ends in the past — it is NOT "the last 28 days
 * including today".
 */
export function last28Window(now = new Date(), lagDays = 3) {
  const end = new Date(now.getTime() - lagDays * 86400000);
  const start = new Date(end.getTime() - 27 * 86400000);
  const d = (x) => x.toISOString().slice(0, 10);
  return { startDate: d(start), endDate: d(end) };
}

export async function querySearchAnalytics(token, siteUrl, body, { fetchImpl = fetch } = {}) {
  const url = `https://www.googleapis.com/webmasters/v3/sites/${encodeURIComponent(siteUrl)}/searchAnalytics/query`;
  const res = await fetchImpl(url, {
    method: "POST",
    headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
    body: JSON.stringify(body),
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(`searchAnalytics/query ${res.status}: ${json.error?.message || "unknown error"}`);
  }
  return json.rows || [];
}

/**
 * Fetch everything the snapshot needs in one go. Throws on any failure — a
 * half-read GSC is not a measured GSC.
 *
 * Returns:
 *   by_date:      [{date, clicks, impressions}] sorted by date ascending
 *   top_queries:  union of the top 200 by clicks and the top 200 by impressions
 *                 (<=400 rows), impressions-desc. Clicks alone is a biased sample:
 *                 the API only sorts clicks-desc, so zero-click queries sink below
 *                 every 1-click one no matter how many impressions they carry.
 *   top_query_pages: { query: page } for top queries at position 4-15
 *   top_pages:    first 200 rows by impressions desc {page, clicks, impressions, position(1dp)}
 *   tracked_query_pages: exact query->URL rows for the declared fixed rank
 *                 panel. An empty rows array means the targeted API request
 *                 returned no row; it does NOT mean zero impressions.
 *   truncated:    true when ANY query row was dropped — by the fetch limit or by
 *                 the 200-row storage cap. Both are invisibility; only reporting the
 *                 fetch limit would claim full coverage on a 400-row pull that stored 200.
 *   queries_seen / queries_stored: the actual counts, so the readout can say how many
 *                 were dropped instead of just that some were.
 *   window:       {startDate, endDate}
 */
export async function fetchGscSections({ env = process.env, fetchImpl = fetch, now = new Date(), trackedQueries = [] } = {}) {
  const sa = readServiceAccount(env);
  if (!sa) return null; // not configured — caller records available:false, reason not_configured
  const siteUrl = env.GSC_SITE_URL || DEFAULT_SITE;
  const token = await getAccessToken(sa, { fetchImpl, now: now.getTime() });
  const window = last28Window(now);
  const common = { ...window, type: "web", dataState: "final" };

  // G1: per-date rows so the 28d totals and the week-over-week split are exact.
  const dateRows = await querySearchAnalytics(token, siteUrl, { ...common, dimensions: ["date"], rowLimit: 40 }, { fetchImpl });
  const by_date = dateRows
    .map((r) => ({ date: r.keys[0], clicks: r.clicks || 0, impressions: r.impressions || 0 }))
    .sort((a, b) => a.date.localeCompare(b.date)); // rows arrive clicks-desc, NOT date-ordered

  // G2: queries. The API always orders clicks-desc and offers no sort control,
  // so on a low-click site every zero-click query — however many impressions it
  // carries — sinks below every 1-click query. Taking the first 200 rows was
  // therefore a clicks-biased sample that hid exactly the invisible queries worth
  // seeing: Utah's stored slice covered 2.5% of its impressions.
  //
  // Two fixes: fetch deeper (the tail is where the zero-click volume lives), and
  // store the UNION of the top rows by clicks and by impressions. Clicks answer
  // "what is working", impressions answer "what is invisible" — either ordering
  // alone loses one of them.
  const queryRows = await querySearchAnalytics(
    token,
    siteUrl,
    { ...common, dimensions: ["query"], rowLimit: QUERY_FETCH_LIMIT },
    { fetchImpl },
  );
  const asRow = (r) => ({
    query: r.keys[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    position: Math.round((r.position || 0) * 10) / 10,
  });
  const byClicks = [...queryRows].sort((a, b) => (b.clicks || 0) - (a.clicks || 0)).slice(0, QUERY_STORE_PER_ORDER);
  const byImpressions = [...queryRows].sort((a, b) => (b.impressions || 0) - (a.impressions || 0)).slice(0, QUERY_STORE_PER_ORDER);
  const seen = new Set();
  const top_queries = [];
  for (const r of [...byClicks, ...byImpressions]) {
    const q = r.keys[0];
    if (seen.has(q)) continue;
    seen.add(q);
    top_queries.push(asRow(r));
  }
  top_queries.sort((a, b) => b.impressions - a.impressions || b.clicks - a.clicks);

  // How much of the site's impressions the stored slice actually accounts for.
  // GSC also withholds rare/anonymised queries, so this never reaches 100% — which
  // is the point: state the coverage instead of implying the slice is the whole.
  const storedImpressions = top_queries.reduce((n, r) => n + r.impressions, 0);

  // G3: query+page, to name the ranking page for quick-win rows (position 4-15).
  const pageRows = await querySearchAnalytics(
    token,
    siteUrl,
    { ...common, dimensions: ["query", "page"], rowLimit: 2500 },
    { fetchImpl },
  );
  const bestPage = new Map();
  for (const r of pageRows) {
    const [query, page] = r.keys;
    const prev = bestPage.get(query);
    if (!prev || (r.impressions || 0) > prev.impressions) bestPage.set(query, { page, impressions: r.impressions || 0 });
  }
  const top_query_pages = {};
  for (const q of top_queries) {
    if (q.position >= 4 && q.position <= 15 && bestPage.has(q.query)) {
      top_query_pages[q.query] = bestPage.get(q.query).page;
    }
  }

  // G3b: targeted query+page rows for the exact fixed panel. The unfiltered G3
  // request is still needed for general quick wins, but it is clicks-sorted and
  // bounded. That made the Draper architecture diagnosis impossible: the storm
  // child had page-level demand while all four commercial queries were outside
  // the rank tracker's top 30, yet the snapshot could not say which Frame URL
  // (if any) Google associated with those exact commercial queries.
  const trackedFilter = trackedQueryFilter(trackedQueries);
  let tracked_query_pages = { requested: [], rows: [] };
  if (trackedFilter) {
    const trackedRows = await querySearchAnalytics(
      token,
      siteUrl,
      {
        ...common,
        dimensions: ["query", "page"],
        dimensionFilterGroups: trackedFilter.dimensionFilterGroups,
        rowLimit: 25000,
      },
      { fetchImpl },
    );
    tracked_query_pages = {
      requested: trackedFilter.requested,
      rows: trackedRows
        .map((r) => ({
          query: r.keys[0],
          page: r.keys[1],
          clicks: r.clicks || 0,
          impressions: r.impressions || 0,
          position: Math.round((r.position || 0) * 10) / 10,
        }))
        .sort((a, b) => a.query.localeCompare(b.query) || b.impressions - a.impressions || a.position - b.position),
    };
  }

  // G4: the page dimension on its own. G3 above fetches query+page but keeps only a
  // query->page string map, discarding every metric, so nothing downstream can answer
  // "which pages earn impressions and where do they rank". Summing G3 by page is NOT a
  // substitute: it covers only queries that made the top-200 cut, and per-query positions
  // cannot be averaged into a page position. Ask GSC for the page dimension directly.
  const rawPageRows = await querySearchAnalytics(
    token,
    siteUrl,
    { ...common, dimensions: ["page"], rowLimit: 1000 },
    { fetchImpl },
  );
  // Rows arrive clicks-desc. Sort by impressions before capping, or the cap silently
  // drops the high-impression/zero-click pages — exactly the ones worth seeing.
  const top_pages = rawPageRows
    .map((r) => ({
      page: r.keys[0],
      clicks: r.clicks || 0,
      impressions: r.impressions || 0,
      position: Math.round((r.position || 0) * 10) / 10,
    }))
    .sort((a, b) => b.impressions - a.impressions || a.position - b.position)
    .slice(0, 200);

  return {
    siteUrl,
    window,
    by_date,
    top_queries,
    top_query_pages,
    tracked_query_pages,
    top_pages,
    queries_seen: queryRows.length,
    queries_stored: top_queries.length,
    queries_stored_impressions: storedImpressions,
    pages_seen: rawPageRows.length,
    pages_stored: top_pages.length,
    truncated: queryRows.length >= QUERY_FETCH_LIMIT || top_queries.length < queryRows.length,
    pages_truncated: rawPageRows.length >= 1000 || top_pages.length < rawPageRows.length,
    clicks28d: by_date.reduce((n, r) => n + r.clicks, 0),
    impressions28d: by_date.reduce((n, r) => n + r.impressions, 0),
  };
}
