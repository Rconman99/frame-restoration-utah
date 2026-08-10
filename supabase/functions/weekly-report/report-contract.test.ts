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
  REPORT_LOCATION_SLUGS,
  REPORT_RENDERING_CONTRACT,
  shapeReportRows,
  sourceTrafficFromRows,
  trafficBreakdownFromSectionRows,
} from "./report-contract.ts";
import { OPERATOR_PHONE } from "../_shared/classify-inbound.ts";

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("report windows are bounded numeric days", () => {
  assert(parseReportDays(null) === 30, "default window changed");
  for (const days of ["1", "7", "30", "90", "365"]) {
    assert(
      parseReportDays(days) === Number(days),
      `valid window rejected: ${days}`,
    );
  }
  for (const invalid of ["0", "366", "-1", "1.5", "1 DAY", "NaN", "9999"]) {
    assert(
      parseReportDays(invalid) === null,
      `invalid window accepted: ${invalid}`,
    );
  }
});

Deno.test("report detail accepts only full or summary", () => {
  assert(parseReportDetail(null) === "full", "default detail changed");
  assert(parseReportDetail("full") === "full", "full rejected");
  assert(parseReportDetail("summary") === "summary", "summary rejected");
  assert(parseReportDetail("private") === null, "unknown detail accepted");
});

Deno.test("report test filtering uses explicit markers and operator identity", () => {
  assert(
    isReportableLead({ name: "Contest Winner", is_test: false }),
    "a legitimate name was treated as test traffic",
  );
  assert(
    !isReportableLead({ name: "Any Name", is_test: true }),
    "an explicitly marked test lead survived",
  );
  assert(
    !isReportableCall({ from_number: OPERATOR_PHONE, is_test: false }),
    "operator call was counted as a customer conversion",
  );
  assert(
    !isReportableCall({ from_number: "+15555550100", is_test: true }),
    "an explicitly marked test call survived",
  );
  assert(
    isReportableCall({ from_number: "+15555550100", is_test: false }),
    "a normal customer call was removed",
  );
});

Deno.test("report text is bounded and strips unsafe controls", () => {
  assert(
    boundedReportText("roof\u0000 repair\u007f\n", 100) === "roof repair\n",
    "unsafe controls survived",
  );
  assert(boundedReportText("abcdef", 3) === "abc", "text bound failed");
});

Deno.test("PostHog aggregate count is exact and fails closed on malformed rows", () => {
  assert(parsePostHogAggregateCount([[314]]) === 314, "number rejected");
  assert(parsePostHogAggregateCount([["314"]]) === 314, "string rejected");
  for (
    const invalid of [
      [],
      [[1], [2]],
      [[]],
      [[-1]],
      [[1.5]],
      [["not-a-count"]],
    ]
  ) {
    assert(
      parsePostHogAggregateCount(invalid) === null,
      `invalid aggregate accepted: ${JSON.stringify(invalid)}`,
    );
  }
});

Deno.test("exact traffic sections reconcile to the total pageview aggregate", () => {
  const breakdown = trafficBreakdownFromSectionRows([
    ["home", 20],
    ["locations", "11"],
    ["services", 7],
    ["blog", 5],
    ["other", 2],
    ["other", 1],
  ], 46);
  assert(breakdown?.home === 20, "home total changed");
  assert(breakdown?.other === 3, "duplicate section rows were not summed");
  assert(
    trafficBreakdownFromSectionRows([["home", 20]], 21) === null,
    "unreconciled section total was accepted",
  );
  assert(
    trafficBreakdownFromSectionRows([["unknown", 1]], 1) === null,
    "unknown traffic section was accepted",
  );
});

Deno.test("exact source summary fails closed and display sources accumulate", () => {
  const summary = parsePostHogSourceSummary([["12", 8]]);
  assert(summary?.google_organic === 12, "Google aggregate changed");
  assert(summary?.direct_traffic === 8, "direct aggregate changed");
  for (const invalid of [[], [[1]], [[1, -1]], [[1.5, 2]], [[1, 2], [3, 4]]]) {
    assert(
      parsePostHogSourceSummary(invalid) === null,
      `invalid source aggregate accepted: ${JSON.stringify(invalid)}`,
    );
  }
  const sources = sourceTrafficFromRows([
    [null, 4],
    ["", "3"],
    ["$direct", 2],
    ["www.google.com", 5],
    ["www.google.com", 1],
    ["bad", -1],
  ]);
  assert(sources.get("$direct") === 9, "direct source groups were overwritten");
  assert(sources.get("www.google.com") === 6, "source groups were not summed");
  assert(!sources.has("bad"), "invalid negative source count survived");
});

Deno.test("location coverage uses its complete result set and sums city paths", () => {
  const traffic = locationTrafficFromPageRows([
    ["/locations/sandy", 7],
    ["/locations/sandy/", "2"],
    ["/locations/sandy/storm-damage", 4],
    ["/locations/draper.html", 3],
    ["/locations/not-published", 99],
    ["/blog/sandy-roofing", 500],
    ["/locations/provo", -1],
  ], ["draper", "provo", "sandy"]);
  assert(traffic.get("sandy") === 13, "Sandy paths were not summed");
  assert(traffic.get("draper") === 3, ".html location path was missed");
  assert(traffic.get("provo") === 0, "invalid negative count survived");
  assert(!traffic.has("not-published"), "unknown location entered coverage");
});

Deno.test("report location registry matches published top-level pages", async () => {
  const published: string[] = [];
  for await (
    const entry of Deno.readDir(new URL("../../../locations", import.meta.url))
  ) {
    if (entry.isFile && entry.name.endsWith(".html")) {
      published.push(entry.name.slice(0, -5));
    }
  }
  published.sort();
  assert(
    JSON.stringify(REPORT_LOCATION_SLUGS) === JSON.stringify(published),
    `report location registry drifted: expected ${published.join(", ")}`,
  );
});

Deno.test("preview CORS accepts configured exact HTTPS Vercel origins only", () => {
  const origins = configuredPreviewOrigins([
    "https://frame-utah-git-a1b2-owner.vercel.app",
    "https://frame-utah-git-a1b2-owner.vercel.app",
    "https://frame-utah-git-b3c4-owner.vercel.app/",
    "http://frame-utah-git-c5d6-owner.vercel.app",
    "https://frame-utah.vercel.app.evil.example",
    "*.vercel.app",
  ].join(","));
  assert(origins.length === 1, `unsafe preview origin accepted: ${origins}`);
  assert(
    origins[0] === "https://frame-utah-git-a1b2-owner.vercel.app",
    "exact preview origin missing",
  );
});

Deno.test("viewer report omits phone numbers and financial row detail", () => {
  const shaped = shapeReportRows(
    "viewer",
    "full",
    [{
      id: 7,
      name: '<img src=x onerror="globalThis.pwned=true">',
      phone: "555-0100",
      service: "roof repair",
      source_page: "/contact",
      status: "new",
      job_value: 5000,
      commission: 500,
      created_at: "2026-08-07T00:00:00Z",
    }],
    [{
      id: 9,
      from_number: "555-0199",
      duration_seconds: 45,
      status: "completed",
      city: "Heber City",
      source_page: "/",
      created_at: "2026-08-07T00:00:00Z",
    }],
  );
  const lead = shaped.leads[0] as Record<string, unknown>;
  const call = shaped.calls[0] as Record<string, unknown>;
  for (
    const forbidden of [
      "id",
      "name",
      "phone",
      "job_value",
      "commission",
      "status",
    ]
  ) {
    assert(!(forbidden in lead), `viewer lead exposes ${forbidden}`);
  }
  for (const forbidden of ["id", "from_number", "status"]) {
    assert(!(forbidden in call), `viewer call exposes ${forbidden}`);
  }
  assert(
    REPORT_RENDERING_CONTRACT.required_sink === "textContent_or_audited_escape",
    "safe rendering contract changed",
  );
});

Deno.test("sales/admin can receive bounded operational fields", () => {
  for (const role of ["sales", "admin"] as const) {
    const shaped = shapeReportRows(
      role,
      "full",
      [{
        id: 7,
        name: '<img src=x onerror="globalThis.pwned=true">',
        phone: "555-0100",
        job_value: "5000",
        commission: 500,
      }],
      [{ id: 9, from_number: "555-0199", status: "completed" }],
    );
    const lead = shaped.leads[0] as Record<string, unknown>;
    const call = shaped.calls[0] as Record<string, unknown>;
    assert(lead.id === 7, `${role} lead id missing`);
    assert(
      lead.name === '<img src=x onerror="globalThis.pwned=true">',
      `${role} lead name changed before safe browser rendering`,
    );
    assert(lead.phone === "555-0100", `${role} lead phone missing`);
    assert(lead.job_value === 5000, `${role} job value invalid`);
    assert(call.id === 9, `${role} call id missing`);
    assert(
      call.from_number === "555-0199",
      `${role} caller missing`,
    );
    assert(
      call.status === "completed",
      `${role} call status missing`,
    );
  }
});

Deno.test("summary detail never returns row-level lead or call data", () => {
  const shaped = shapeReportRows(
    "admin",
    "summary",
    [{ phone: "555-0100" }],
    [{ from_number: "555-0199" }],
  );
  assert(shaped.leads.length === 0, "summary leaked lead rows");
  assert(shaped.calls.length === 0, "summary leaked call rows");
});
