import assert from "node:assert/strict";

export function normalizeSiteUrl(value) {
  if (!value) return null;
  try {
    const url = new URL(value);
    const host = url.hostname.toLowerCase().replace(/^www\./, "");
    const withoutTrailingSlash = url.pathname.replace(/\/+$/, "") || "/";
    const pathname = withoutTrailingSlash.replace(/\.html$/, "") || "/";
    return `${host}${pathname}`;
  } catch {
    return null;
  }
}

function aggregateRows(rows, intendedCanonical) {
  const intendedKey = normalizeSiteUrl(intendedCanonical);
  assert.ok(intendedKey, `invalid intended canonical: ${intendedCanonical}`);
  const grouped = new Map();
  for (const row of rows) {
    const normalizedUrl = normalizeSiteUrl(row.page);
    if (!normalizedUrl) continue;
    const current = grouped.get(normalizedUrl) || {
      normalizedUrl,
      urlVariants: new Set(),
      clicks: 0,
      impressions: 0,
      weightedPosition: 0,
      positionWeight: 0,
      positions: [],
    };
    current.urlVariants.add(row.page);
    current.clicks += Number(row.clicks || 0);
    current.impressions += Number(row.impressions || 0);
    const position = Number(row.position);
    if (Number.isFinite(position)) {
      const weight = Number(row.impressions || 0) || 1;
      current.weightedPosition += position * weight;
      current.positionWeight += weight;
      current.positions.push(position);
    }
    grouped.set(normalizedUrl, current);
  }
  return [...grouped.values()]
    .map((row) => ({
      normalizedUrl: row.normalizedUrl,
      urlVariants: [...row.urlVariants].sort(),
      clicks: row.clicks,
      impressions: row.impressions,
      position: row.positionWeight
        ? Math.round((row.weightedPosition / row.positionWeight) * 10) / 10
        : null,
      intended: row.normalizedUrl === intendedKey,
    }))
    .sort((a, b) => b.impressions - a.impressions || (a.position ?? Infinity) - (b.position ?? Infinity) || a.normalizedUrl.localeCompare(b.normalizedUrl));
}

export function summarizeQueryAttribution({ keyword, intendedCanonical, requested, rows = [] }) {
  const normalizedRows = aggregateRows(rows, intendedCanonical);
  const intendedRows = normalizedRows.filter((row) => row.intended);
  const alternateRows = normalizedRows.filter((row) => !row.intended);
  let state = "unmeasured-not-requested";
  if (requested && normalizedRows.length === 0) state = "requested-no-row-returned";
  else if (requested && intendedRows.length > 0 && alternateRows.length === 0) state = "intended-url-only";
  else if (requested && intendedRows.length > 0 && alternateRows.length > 0) state = "multi-url-including-intended";
  else if (requested && intendedRows.length === 0 && alternateRows.length > 0) state = "alternate-url-only";

  const interpretation = {
    "unmeasured-not-requested": "The exact query was not requested in this GSC evidence snapshot; URL attribution is unmeasured, not zero.",
    "requested-no-row-returned": "The exact query was requested but GSC returned no row; this is withheld or absent row evidence, not zero demand or proof that no Frame URL ranks.",
    "intended-url-only": "Only the intended city hub appears in the exact query-to-page rows; preserve that route and canonical.",
    "multi-url-including-intended": "The intended hub and at least one other Frame URL appear in the 28-day window; diagnose timing, redirects, canonicals, and intent before any architecture change.",
    "alternate-url-only": "Only another Frame URL appears in the exact query-to-page rows; verify current routing and intent before changing or redirecting any page.",
  }[state];

  return {
    keyword,
    requested,
    state,
    intendedCanonical,
    intendedPageObserved: intendedRows.length > 0,
    highestImpressionUrl: normalizedRows[0]?.normalizedUrl || null,
    highestImpressionUrlIsIntended: normalizedRows[0]?.intended ?? null,
    rows: normalizedRows,
    interpretation,
  };
}

export function cityAttributionState(queries) {
  const states = new Set(queries.map((query) => query.state));
  if (states.has("alternate-url-only") || states.has("multi-url-including-intended")) return "url-competition-requires-diagnosis";
  if (states.has("unmeasured-not-requested")) return "targeted-gsc-not-complete";
  if (states.has("requested-no-row-returned")) return "complete-request-with-unreturned-rows";
  return "intended-url-only-for-all-returned-rows";
}
