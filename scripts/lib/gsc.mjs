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
 *   top_queries:  first 200 rows by clicks desc {query, clicks, impressions, position(1dp)}
 *   top_query_pages: { query: page } for top queries at position 4-15
 *   truncated:    true when the query pull hit its row limit (top 200 of more)
 *   window:       {startDate, endDate}
 */
export async function fetchGscSections({ env = process.env, fetchImpl = fetch, now = new Date() } = {}) {
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

  // G2: queries, clicks-desc.
  const queryRows = await querySearchAnalytics(token, siteUrl, { ...common, dimensions: ["query"], rowLimit: 1000 }, { fetchImpl });
  const top_queries = queryRows.slice(0, 200).map((r) => ({
    query: r.keys[0],
    clicks: r.clicks || 0,
    impressions: r.impressions || 0,
    position: Math.round((r.position || 0) * 10) / 10,
  }));

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

  return {
    siteUrl,
    window,
    by_date,
    top_queries,
    top_query_pages,
    truncated: queryRows.length >= 1000,
    clicks28d: by_date.reduce((n, r) => n + r.clicks, 0),
    impressions28d: by_date.reduce((n, r) => n + r.impressions, 0),
  };
}
