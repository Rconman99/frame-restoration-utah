// weekly-report — Frame Restoration Utah internal performance report.
//
// Authentication is a short-lived custom bearer session issued by lead-crm.
// No routing key, PIN, provider credential, or service credential is accepted
// in a URL. Database access remains service-role-only so hardened RLS does not
// expose internal tables to browser roles.

// Supabase Edge Functions use the platform's supported remote import form.
// deno-lint-ignore-file no-import-prefix no-unversioned-import

import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { type AccessRole, normalizeAccessRole } from "../_shared/crm-access.ts";
import {
  bearerToken,
  dashboardSessionMatchesVersion,
  dashboardSessionSecretReady,
  verifyDashboardSession,
} from "../_shared/dashboard-session.ts";
import {
  boundedReportText,
  configuredPreviewOrigins,
  isReportableCall,
  isReportableLead,
  locationTrafficFromPageRows,
  parsePostHogAggregateCount,
  parsePostHogSourceSummary,
  parseReportDays,
  parseReportDetail,
  PRODUCTION_REPORT_ORIGINS,
  REPORT_LOCATION_SLUGS,
  REPORT_RENDERING_CONTRACT,
  shapeReportRows,
  sourceTrafficFromRows,
  trafficBreakdownFromSectionRows,
} from "./report-contract.ts";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ??
  "";
const DASHBOARD_SESSION_SECRET = Deno.env.get("DASHBOARD_SESSION_SECRET") ?? "";
const POSTHOG_PERSONAL_API_KEY = Deno.env.get("POSTHOG_PERSONAL_API_KEY") ?? "";

const POSTHOG_HOST = "https://us.posthog.com";
const POSTHOG_PROJECT_ID = "333074";
const POSTHOG_TIMEOUT_MS = 15_000;
const DATABASE_PAGE_SIZE = 500;
const MAX_REPORT_ROWS_PER_TABLE = 50_000;
const ALLOWED_ORIGINS = new Set<string>(PRODUCTION_REPORT_ORIGINS);

// Immutable Vercel preview URLs can be authorized for a bounded QA window by
// setting an exact comma-separated allowlist. Wildcards and non-Vercel hosts
// are rejected; remove the preview origin after the production receipt passes.
for (
  const origin of configuredPreviewOrigins(
    Deno.env.get("DASHBOARD_PREVIEW_ORIGINS") ?? "",
  )
) {
  ALLOWED_ORIGINS.add(origin);
}

function responseHeaders(req: Request): Record<string, string> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store, private",
    "Pragma": "no-cache",
    "X-Content-Type-Options": "nosniff",
    "Referrer-Policy": "no-referrer",
    "Vary": "Origin",
    "Access-Control-Allow-Methods": "GET, OPTIONS",
    "Access-Control-Allow-Headers": "Authorization, Content-Type",
  };
  const origin = req.headers.get("origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    headers["Access-Control-Allow-Origin"] = origin;
  }
  return headers;
}

function jsonResponse(req: Request, body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: responseHeaders(req),
  });
}

function finiteNumber(value: unknown): number {
  const number = Number(value);
  return Number.isFinite(number) ? number : 0;
}

type ReportPageResult = {
  data: unknown;
  error: { code?: string; message?: string } | null;
};

type ReportPageFetcher = (
  from: number,
  to: number,
) => PromiseLike<ReportPageResult>;

async function fetchAllReportRows(
  label: string,
  fetchPage: ReportPageFetcher,
): Promise<{
  data: Record<string, unknown>[];
  errorCode: string | null;
}> {
  const rows: Record<string, unknown>[] = [];
  for (
    let from = 0;
    from < MAX_REPORT_ROWS_PER_TABLE;
    from += DATABASE_PAGE_SIZE
  ) {
    const result = await fetchPage(from, from + DATABASE_PAGE_SIZE - 1);
    if (result.error) {
      return {
        data: [],
        errorCode: result.error.code || `${label}_query_failed`,
      };
    }
    if (
      !Array.isArray(result.data) ||
      !result.data.every((row) =>
        row !== null && typeof row === "object" && !Array.isArray(row)
      )
    ) {
      return { data: [], errorCode: `${label}_invalid_rowset` };
    }
    const page = result.data as Record<string, unknown>[];
    rows.push(...page);
    if (page.length < DATABASE_PAGE_SIZE) {
      return { data: rows, errorCode: null };
    }
  }
  console.error(
    `[weekly-report] ${label} exceeded the bounded pagination limit`,
  );
  return { data: [], errorCode: `${label}_row_limit_exceeded` };
}

type PostHogResult =
  | { ok: true; rows: unknown[][] }
  | { ok: false; status: number | null };

async function postHogQuery(
  label: string,
  query: string,
): Promise<PostHogResult> {
  try {
    const response = await fetch(
      `${POSTHOG_HOST}/api/projects/${POSTHOG_PROJECT_ID}/query/`,
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${POSTHOG_PERSONAL_API_KEY}`,
        },
        body: JSON.stringify({ query: { kind: "HogQLQuery", query } }),
        signal: AbortSignal.timeout(POSTHOG_TIMEOUT_MS),
      },
    );
    if (!response.ok) {
      console.error(
        `[weekly-report] PostHog ${label} query failed: HTTP ${response.status}`,
      );
      return { ok: false, status: response.status };
    }
    const payload = await response.json() as { results?: unknown };
    if (
      !Array.isArray(payload.results) ||
      !payload.results.every((row) => Array.isArray(row))
    ) {
      console.error(
        `[weekly-report] PostHog ${label} query returned malformed result rows`,
      );
      return { ok: false, status: response.status };
    }
    const rows = payload.results as unknown[][];
    return { ok: true, rows };
  } catch (error) {
    console.error(
      `[weekly-report] PostHog ${label} query unavailable: ${
        error instanceof Error ? error.name : "unknown_error"
      }`,
    );
    return { ok: false, status: null };
  }
}

function sessionUser(row: Record<string, unknown>): {
  id: string;
  name: string;
  role: AccessRole;
} | null {
  const role = normalizeAccessRole(row.role);
  const id = typeof row.id === "string" ? row.id : "";
  if (!role || !id || row.active !== true) return null;
  return { id, name: boundedReportText(row.name, 160), role };
}

Deno.serve(async (req: Request) => {
  const origin = req.headers.get("origin");
  if (origin && !ALLOWED_ORIGINS.has(origin)) {
    return jsonResponse(req, { error: "origin_forbidden" }, 403);
  }
  if (req.method === "OPTIONS") {
    return new Response(null, { status: 204, headers: responseHeaders(req) });
  }
  if (req.method !== "GET") {
    return jsonResponse(req, { error: "method_not_allowed" }, 405);
  }

  const url = new URL(req.url);
  if (url.searchParams.has("key") || url.searchParams.has("pin")) {
    return jsonResponse(req, {
      error: "credentials_in_url",
      message: "Credentials must never be sent in a URL.",
    }, 400);
  }
  const days = parseReportDays(url.searchParams.get("days"));
  const detail = parseReportDetail(url.searchParams.get("detail"));
  if (days === null || detail === null) {
    return jsonResponse(req, { error: "invalid_report_parameters" }, 400);
  }

  if (
    !SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY ||
    !dashboardSessionSecretReady(DASHBOARD_SESSION_SECRET) ||
    !POSTHOG_PERSONAL_API_KEY
  ) {
    console.error("[weekly-report] required server configuration is missing");
    return jsonResponse(req, { error: "not_configured" }, 503);
  }

  const token = bearerToken(req.headers.get("authorization"));
  const claims = token
    ? await verifyDashboardSession(DASHBOARD_SESSION_SECRET, token)
    : null;
  if (!claims) return jsonResponse(req, { error: "invalid_session" }, 401);

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const sessionLookup = await supabase
    .from("report_access")
    .select("id, name, role, active, session_version")
    .eq("id", claims.sub)
    .maybeSingle();
  if (sessionLookup.error) {
    console.error(
      "[weekly-report] session identity lookup failed",
      sessionLookup.error.code,
    );
    return jsonResponse(req, { error: "auth_unavailable" }, 503);
  }
  const user = sessionLookup.data
    ? sessionUser(sessionLookup.data as Record<string, unknown>)
    : null;
  if (
    !user ||
    !dashboardSessionMatchesVersion(
      claims,
      sessionLookup.data?.session_version,
    )
  ) {
    return jsonResponse(req, { error: "invalid_session" }, 401);
  }

  const now = new Date();
  const since = new Date(now.getTime() - days * 24 * 60 * 60 * 1000);
  const sinceIso = since.toISOString();
  const untilIso = now.toISOString();
  // Every PostHog query uses the exact same immutable interval. Separate now()
  // evaluations can cross an event boundary and make exact aggregates disagree.
  const postHogWindow =
    `timestamp >= toDateTime('${sinceIso}') AND timestamp < toDateTime('${untilIso}')`;

  const [
    leadResult,
    callResult,
    totalResult,
    breakdownResult,
    pageResult,
    locationResult,
    sourceResult,
    sourceSummaryResult,
    eventResult,
  ] = await Promise.all([
    fetchAllReportRows("leads", (from, to) =>
      supabase
        .from("leads")
        .select(
          "id, name, phone, service, source_page, status, job_value, commission, created_at, is_test",
        )
        .gte("created_at", sinceIso)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: false })
        .range(from, to)),
    fetchAllReportRows("call_logs", (from, to) =>
      supabase
        .from("call_logs")
        .select(
          "id, from_number, duration_seconds, status, city, source_page, created_at, is_test",
        )
        .gte("created_at", sinceIso)
        .lt("created_at", untilIso)
        .order("created_at", { ascending: false })
        .range(from, to)),
    postHogQuery(
      "total pageviews",
      `SELECT count() AS total_pageviews FROM events WHERE event = '$pageview' AND ${postHogWindow}`,
    ),
    postHogQuery(
      "traffic breakdown",
      `SELECT CASE WHEN properties.$pathname = '/' THEN 'home' WHEN properties.$pathname LIKE '/locations/%' THEN 'locations' WHEN properties.$pathname LIKE '/pages/%' THEN 'services' WHEN properties.$pathname = '/blog' OR properties.$pathname LIKE '/blog/%' THEN 'blog' ELSE 'other' END AS section, count() AS views FROM events WHERE event = '$pageview' AND ${postHogWindow} GROUP BY section`,
    ),
    postHogQuery(
      "top pages",
      `SELECT properties.$pathname AS path, count() AS views FROM events WHERE event = '$pageview' AND ${postHogWindow} GROUP BY path ORDER BY views DESC LIMIT 100`,
    ),
    postHogQuery(
      "location pages",
      `SELECT properties.$pathname AS path, count() AS views FROM events WHERE event = '$pageview' AND ${postHogWindow} AND properties.$pathname LIKE '/locations/%' GROUP BY path ORDER BY views DESC LIMIT 1000`,
    ),
    postHogQuery(
      "sources",
      `SELECT properties.$referring_domain AS src, count() AS views FROM events WHERE event = '$pageview' AND ${postHogWindow} GROUP BY src ORDER BY views DESC LIMIT 20`,
    ),
    postHogQuery(
      "source summary",
      `SELECT sum(CASE WHEN lower(coalesce(properties.$referring_domain, '')) = 'google.com' OR lower(coalesce(properties.$referring_domain, '')) LIKE '%.google.com' OR lower(coalesce(properties.$referring_domain, '')) LIKE 'google.%' OR lower(coalesce(properties.$referring_domain, '')) LIKE '%.google.%' THEN 1 ELSE 0 END) AS google_organic, sum(CASE WHEN coalesce(properties.$referring_domain, '') IN ('', '$direct') THEN 1 ELSE 0 END) AS direct_traffic FROM events WHERE event = '$pageview' AND ${postHogWindow}`,
    ),
    postHogQuery(
      "events",
      `SELECT event, count() AS cnt FROM events WHERE event IN ('phone_click','email_click','form_submitted','cta_click','inbound_call','inbound_sms') AND ${postHogWindow} GROUP BY event`,
    ),
  ]);

  if (leadResult.errorCode || callResult.errorCode) {
    console.error(
      "[weekly-report] report database query failed",
      leadResult.errorCode || callResult.errorCode || "unknown_error",
    );
    return jsonResponse(req, { error: "report_database_unavailable" }, 503);
  }
  if (
    !totalResult.ok || !breakdownResult.ok || !pageResult.ok ||
    !locationResult.ok || !sourceResult.ok || !sourceSummaryResult.ok ||
    !eventResult.ok
  ) {
    return jsonResponse(req, {
      error: "posthog_unavailable",
      provider_status: { posthog: "unavailable" },
    }, 502);
  }

  const posthogTotal = parsePostHogAggregateCount(totalResult.rows);
  const trafficBreakdown = posthogTotal === null
    ? null
    : trafficBreakdownFromSectionRows(breakdownResult.rows, posthogTotal);
  const sourceSummary = parsePostHogSourceSummary(sourceSummaryResult.rows);
  if (posthogTotal === null || trafficBreakdown === null || !sourceSummary) {
    console.error(
      "[weekly-report] PostHog exact summary queries returned invalid or unreconciled aggregates",
    );
    return jsonResponse(req, {
      error: "posthog_unavailable",
      provider_status: { posthog: "unavailable" },
    }, 502);
  }

  const posthogPages = new Map<string, number>();
  for (const row of pageResult.rows) {
    const path = boundedReportText(row[0], 500);
    const views = Math.max(0, finiteNumber(row[1]));
    if (!path) continue;
    posthogPages.set(path, views);
  }

  const posthogSources = sourceTrafficFromRows(sourceResult.rows);

  const posthogEvents = new Map<string, number>();
  for (const row of eventResult.rows) {
    const event = boundedReportText(row[0], 100);
    if (event) posthogEvents.set(event, Math.max(0, finiteNumber(row[1])));
  }

  const locationTraffic = locationTrafficFromPageRows(locationResult.rows);
  const locationsWithTraffic = [...locationTraffic.entries()]
    .filter(([, views]) => views > 0)
    .sort((left, right) => right[1] - left[1]);
  const locationsNoTraffic = [...locationTraffic.entries()]
    .filter(([, views]) => views === 0)
    .map(([slug]) => slug)
    .sort();

  const leads = leadResult.data;
  const calls = callResult.data;
  const realLeads = leads.filter(isReportableLead);
  const completedCalls = calls.filter((call) =>
    call.status === "completed" && isReportableCall(call)
  );
  const totalCallMinutes = completedCalls.reduce(
    (sum, call) => sum + finiteNumber(call.duration_seconds),
    0,
  ) / 60;
  const totalJobValue = realLeads.reduce(
    (sum, lead) => sum + finiteNumber(lead.job_value),
    0,
  );
  const totalCommission = realLeads.reduce(
    (sum, lead) => sum + finiteNumber(lead.commission),
    0,
  );
  const conversionRate = posthogTotal > 0
    ? Number(
      ((realLeads.length + completedCalls.length) / posthogTotal * 100)
        .toFixed(1),
    )
    : 0;

  const rows = shapeReportRows(user.role, detail, realLeads, completedCalls);
  return jsonResponse(req, {
    generated_at: now.toISOString(),
    period_days: days,
    detail,
    rendering_contract: REPORT_RENDERING_CONTRACT,
    provider_status: { posthog: "available" },
    user: { name: user.name, role: user.role },
    summary: {
      total_pageviews: posthogTotal,
      google_organic: sourceSummary.google_organic,
      direct_traffic: sourceSummary.direct_traffic,
      total_leads: realLeads.length,
      total_calls: completedCalls.length,
      total_call_minutes: Math.round(totalCallMinutes * 10) / 10,
      total_job_value: totalJobValue,
      total_commission: totalCommission,
      conversion_rate_pct: conversionRate,
    },
    traffic_breakdown: trafficBreakdown,
    traffic_sources: Object.fromEntries(posthogSources),
    lead_actions: Object.fromEntries(posthogEvents),
    top_pages: [...posthogPages.entries()].slice(0, 20).map(
      ([path, views]) => ({ path, views }),
    ),
    location_performance: locationsWithTraffic.map(([location, views]) => ({
      location,
      views,
    })),
    location_gaps: locationsNoTraffic,
    gap_summary: {
      total_locations: REPORT_LOCATION_SLUGS.length,
      locations_with_traffic: locationsWithTraffic.length,
      locations_no_traffic: locationsNoTraffic.length,
      coverage_pct: Math.round(
        locationsWithTraffic.length / REPORT_LOCATION_SLUGS.length * 100,
      ),
    },
    ...rows,
  });
});
