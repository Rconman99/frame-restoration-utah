import type { AccessRole } from "../_shared/crm-access.ts";
import { isOperator, normalizePhone } from "../_shared/classify-inbound.ts";

export type ReportDetail = "full" | "summary";

type LeadRow = Record<string, unknown>;
type CallRow = Record<string, unknown>;

// Every string in the report is data, never trusted markup. Browser consumers
// must use textContent/DOM APIs or an audited HTML escaper before inserting it.
export const REPORT_RENDERING_CONTRACT = {
  version: 1,
  string_fields: "untrusted_plain_text",
  required_sink: "textContent_or_audited_escape",
} as const;

// The report exposes event and row counts, not a deduplicated sales funnel.
// Keep their grain explicit so dashboard consumers cannot present activity as
// qualified opportunities, collected revenue, or a conversion rate.
export const REPORT_METRIC_DEFINITIONS = {
  total_pageviews: {
    grain: "posthog_pageview_events",
    status: "measured",
  },
  total_leads: {
    grain: "reportable_lead_table_rows",
    status: "measured",
    unique_qualified_opportunities: false,
  },
  total_calls: {
    grain: "reportable_completed_call_log_rows",
    status: "measured",
    unique_qualified_opportunities: false,
  },
  total_job_value: {
    grain: "sum_of_populated_lead_job_value_fields",
    status: "partial",
    collected_revenue: false,
  },
  qualified_conversion_rate: {
    numerator: "deduplicated_qualified_opportunities",
    denominator: "eligible_sessions",
    owner: "business_owner",
    status: "unavailable",
    reason:
      "qualification, deduplication, and eligible-session outcomes are not yet reconciled",
  },
} as const;

export const PRODUCTION_REPORT_ORIGINS = [
  "https://www.framerestorationutah.com",
  "https://framerestorationutah.com",
] as const;

// This is the published top-level location-page surface. A contract test keeps
// it synchronized with locations/*.html so traffic gaps never include planned
// cities that do not have a live page or omit a city that does.
export const REPORT_LOCATION_SLUGS = [
  "alpine",
  "american-fork",
  "bluffdale",
  "bountiful",
  "cedar-hills",
  "centerville",
  "clearfield",
  "clinton",
  "cottonwood-heights",
  "draper",
  "eagle-mountain",
  "farmington",
  "fruit-heights",
  "heber-city",
  "herriman",
  "highland",
  "holladay",
  "kaysville",
  "kearns",
  "layton",
  "lehi",
  "lindon",
  "magna",
  "mapleton",
  "midvale",
  "midway",
  "millcreek",
  "murray",
  "north-salt-lake",
  "ogden",
  "orem",
  "park-city",
  "payson",
  "pleasant-grove",
  "provo",
  "riverton",
  "salt-lake-city",
  "sandy",
  "santaquin",
  "saratoga-springs",
  "south-jordan",
  "south-salt-lake",
  "spanish-fork",
  "springville",
  "syracuse",
  "taylorsville",
  "tooele",
  "vineyard",
  "wallsburg",
  "west-bountiful",
  "west-jordan",
  "west-valley-city",
  "woods-cross",
] as const;

export function configuredPreviewOrigins(value: string): string[] {
  const origins = new Set<string>();
  for (
    const candidate of value.split(",").map((part) => part.trim()).filter(
      Boolean,
    )
  ) {
    try {
      const preview = new URL(candidate);
      if (
        preview.protocol === "https:" && preview.origin === candidate &&
        preview.hostname.endsWith(".vercel.app")
      ) {
        origins.add(preview.origin);
      }
    } catch {
      // Invalid entries are ignored rather than broadening protected CORS.
    }
  }
  return [...origins];
}

export function parseReportDays(value: string | null): number | null {
  if (value === null || value === "") return 30;
  if (!/^\d{1,3}$/.test(value)) return null;
  const days = Number(value);
  return Number.isSafeInteger(days) && days >= 1 && days <= 365 ? days : null;
}

export function parseReportDetail(value: string | null): ReportDetail | null {
  if (value === null || value === "" || value === "full") return "full";
  return value === "summary" ? "summary" : null;
}

// Test traffic is excluded only when it carries an explicit database marker.
// Never infer test status from a customer's name: legitimate names such as
// "Contest Winner" contain the same substring.
export function isReportableLead(row: LeadRow): boolean {
  return row.is_test !== true;
}

export function isReportableCall(row: CallRow): boolean {
  if (row.is_test === true) return false;
  return !isOperator(normalizePhone(boundedReportText(row.from_number, 64)));
}

export function boundedReportText(
  value: unknown,
  maxLength = 500,
): string {
  if (value === null || value === undefined) return "";
  let clean = "";
  for (const character of String(value)) {
    const codePoint = character.codePointAt(0) ?? 0;
    if (
      codePoint === 9 || codePoint === 10 || codePoint === 13 ||
      (codePoint >= 32 && codePoint !== 127)
    ) {
      clean += character;
    }
  }
  return clean.slice(0, maxLength);
}

export function parsePostHogAggregateCount(
  rows: readonly (readonly unknown[])[],
): number | null {
  if (rows.length !== 1 || rows[0].length < 1) return null;
  const count = Number(rows[0][0]);
  return Number.isSafeInteger(count) && count >= 0 ? count : null;
}

export type TrafficBreakdown = {
  home: number;
  locations: number;
  services: number;
  blog: number;
  other: number;
};

const TRAFFIC_SECTIONS = [
  "home",
  "locations",
  "services",
  "blog",
  "other",
] as const;

export function trafficBreakdownFromSectionRows(
  rows: readonly (readonly unknown[])[],
  exactTotal: number,
): TrafficBreakdown | null {
  if (!Number.isSafeInteger(exactTotal) || exactTotal < 0) return null;
  const breakdown: TrafficBreakdown = {
    home: 0,
    locations: 0,
    services: 0,
    blog: 0,
    other: 0,
  };
  for (const row of rows) {
    const section = boundedReportText(row[0], 32) as keyof TrafficBreakdown;
    const views = finiteNumber(row[1]);
    if (
      !TRAFFIC_SECTIONS.includes(section as typeof TRAFFIC_SECTIONS[number]) ||
      views === null || !Number.isSafeInteger(views) || views < 0
    ) {
      return null;
    }
    breakdown[section] += views;
  }
  const reconciled = Object.values(breakdown).reduce(
    (sum, views) => sum + views,
    0,
  );
  return reconciled === exactTotal ? breakdown : null;
}

export function parsePostHogSourceSummary(
  rows: readonly (readonly unknown[])[],
): { google_organic: number; direct_traffic: number } | null {
  if (rows.length !== 1 || rows[0].length < 2) return null;
  const googleOrganic = Number(rows[0][0]);
  const directTraffic = Number(rows[0][1]);
  if (
    !Number.isSafeInteger(googleOrganic) || googleOrganic < 0 ||
    !Number.isSafeInteger(directTraffic) || directTraffic < 0
  ) {
    return null;
  }
  return {
    google_organic: googleOrganic,
    direct_traffic: directTraffic,
  };
}

export function sourceTrafficFromRows(
  rows: readonly (readonly unknown[])[],
): Map<string, number> {
  const totals = new Map<string, number>();
  for (const row of rows) {
    const source = boundedReportText(row[0], 300) || "$direct";
    const views = finiteNumber(row[1]);
    if (views === null || !Number.isSafeInteger(views) || views < 0) continue;
    totals.set(source, (totals.get(source) ?? 0) + views);
  }
  return totals;
}

export function locationTrafficFromPageRows(
  rows: readonly (readonly unknown[])[],
  locations: readonly string[] = REPORT_LOCATION_SLUGS,
): Map<string, number> {
  const totals = new Map(locations.map((slug) => [slug, 0]));
  for (const row of rows) {
    const path = boundedReportText(row[0], 500);
    const views = finiteNumber(row[1]);
    if (views === null || views < 0) continue;
    const match = path.match(
      /^\/locations\/([a-z-]+)(?:\.html)?(?:\/|$)/,
    );
    const slug = match?.[1];
    if (!slug || !totals.has(slug)) continue;
    totals.set(slug, (totals.get(slug) ?? 0) + views);
  }
  return totals;
}

function text(value: unknown, maxLength: number): string | null {
  if (value === null || value === undefined) return null;
  return boundedReportText(value, maxLength);
}

function finiteNumber(value: unknown): number | null {
  if (value === null || value === undefined || value === "") return null;
  const number = Number(value);
  return Number.isFinite(number) ? number : null;
}

function publicLead(row: LeadRow) {
  return {
    service: text(row.service, 160),
    source_page: text(row.source_page, 500),
    created_at: text(row.created_at, 64),
  };
}

function elevatedLead(row: LeadRow) {
  return {
    ...publicLead(row),
    id: row.id ?? null,
    name: text(row.name, 160),
    phone: text(row.phone, 64),
    status: text(row.status, 64),
    job_value: finiteNumber(row.job_value),
    commission: finiteNumber(row.commission),
  };
}

function publicCall(row: CallRow) {
  return {
    duration_seconds: finiteNumber(row.duration_seconds),
    city: text(row.city, 160),
    source_page: text(row.source_page, 500),
    created_at: text(row.created_at, 64),
  };
}

function elevatedCall(row: CallRow) {
  return {
    ...publicCall(row),
    id: row.id ?? null,
    from_number: text(row.from_number, 64),
    status: text(row.status, 64),
  };
}

export function shapeReportRows(
  role: AccessRole,
  detail: ReportDetail,
  leads: LeadRow[],
  calls: CallRow[],
) {
  if (detail === "summary") return { leads: [], calls: [] };
  const elevated = role === "sales" || role === "admin";
  return {
    leads: leads.map(elevated ? elevatedLead : publicLead),
    calls: calls.map(elevated ? elevatedCall : publicCall),
  };
}
