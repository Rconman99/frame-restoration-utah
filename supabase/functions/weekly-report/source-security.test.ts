const source = await Deno.readTextFile(new URL("./index.ts", import.meta.url));
const snapshotScript = await Deno.readTextFile(
  new URL("../../../scripts/refresh-traffic-snapshot.sh", import.meta.url),
);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

Deno.test("weekly-report source contains no embedded credentials", () => {
  assert(
    source.includes('Deno.env.get("POSTHOG_PERSONAL_API_KEY")'),
    "PostHog personal key is not env-backed",
  );
  assert(
    source.includes('Deno.env.get("DASHBOARD_SESSION_SECRET")'),
    "dashboard session secret is not env-backed",
  );
  assert(
    source.includes('Deno.env.get("DASHBOARD_PREVIEW_ORIGINS")'),
    "exact preview-origin allowlist is unavailable",
  );
  for (
    const forbidden of [
      /phx_[A-Za-z0-9_-]+/,
      /sb_secret_[A-Za-z0-9_-]+/,
      /eyJ[A-Za-z0-9_-]{15,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}/,
      /frame-roofing-2026/,
      /searchParams\.get\(["'](?:pin|key)["']\)/,
    ]
  ) {
    assert(
      !forbidden.test(source),
      `forbidden credential pattern present: ${forbidden}`,
    );
  }
});

Deno.test("weekly-report enforces bearer/no-store/CORS security contract", () => {
  for (
    const required of [
      "bearerToken",
      "verifyDashboardSession",
      "dashboardSessionMatchesVersion(",
      'select("id, name, role, active, session_version")',
      '"Authorization, Content-Type"',
      '"Cache-Control": "no-store, private"',
      'url.searchParams.has("key")',
      'url.searchParams.has("pin")',
      "REPORT_RENDERING_CONTRACT",
      "configuredPreviewOrigins",
    ]
  ) {
    assert(source.includes(required), `weekly-report missing ${required}`);
  }
});

Deno.test("weekly-report exact summaries and location gaps do not depend on display limits", () => {
  for (
    const required of [
      /postHogQuery\(\s*"total pageviews"/,
      /SELECT count\(\) AS total_pageviews/,
      /postHogQuery\(\s*"location pages"/,
      /properties\.\$pathname LIKE '\/locations\/%'/,
      /postHogQuery\(\s*"traffic breakdown"/,
      /trafficBreakdownFromSectionRows\(breakdownResult\.rows, posthogTotal\)/,
      /postHogQuery\(\s*"source summary"/,
      /parsePostHogSourceSummary\(sourceSummaryResult\.rows\)/,
      /sourceTrafficFromRows\(sourceResult\.rows\)/,
      /parsePostHogAggregateCount\(totalResult\.rows\)/,
      /locationTrafficFromPageRows\(locationResult\.rows\)/,
    ]
  ) {
    assert(required.test(source), `weekly-report missing ${required}`);
  }
  assert(
    !/for \(const row of pageResult\.rows\)[\s\S]{0,350}posthogTotal \+=/.test(
      source,
    ),
    "top-page rows still drive total pageviews",
  );
  assert(
    !/google_organic:\s*posthogSources\.get|direct_traffic:\s*posthogSources\.get/
      .test(
        source,
      ),
    "limited source rows still drive exact source summary",
  );
  assert(
    !/for \(const \[path, views\] of posthogPages\)[\s\S]{0,500}trafficBreakdown/
      .test(
        source,
      ),
    "limited top pages still drive traffic breakdown",
  );
});

Deno.test("weekly-report freezes one interval and paginates operational rows", () => {
  for (
    const required of [
      "const untilIso = now.toISOString()",
      "const postHogWindow =",
      'fetchAllReportRows("leads"',
      'fetchAllReportRows("call_logs"',
      ".range(from, to)",
      '.lt("created_at", untilIso)',
      "isReportableLead",
      "isReportableCall",
      "is_test",
    ]
  ) {
    assert(source.includes(required), `weekly-report missing ${required}`);
  }
  assert(
    !/timestamp\s*>=\s*now\(\)/.test(source),
    "moving PostHog now() window returned",
  );
  assert(
    !/name[^\n]{0,180}(?:includes|indexOf)\([^\n]{0,80}TEST/i.test(source),
    "lead names are still used to infer test traffic",
  );
});

Deno.test("traffic snapshot login keeps PIN and token out of request URLs", () => {
  for (
    const forbidden of [
      /[?&]pin=/,
      /[?&]key=/,
      /weekly-report[^\n]*FRAME_REPORT_PIN/,
    ]
  ) {
    assert(
      !forbidden.test(snapshotScript),
      `snapshot script matches ${forbidden}`,
    );
  }
  for (
    const required of [
      "lead-crm?action=login",
      "--data-binary @-",
      'header = "Authorization: Bearer %s"',
      "weekly-report?days=${DAYS}&detail=summary",
    ]
  ) {
    assert(
      snapshotScript.includes(required),
      `snapshot script missing ${required}`,
    );
  }
});
