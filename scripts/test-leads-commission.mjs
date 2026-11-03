// leads.html commission KPI pays only SEO/AEO leads (mirrors _shared/tracking-numbers.ts).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync(new URL("../leads.html", import.meta.url), "utf8");
const start = html.indexOf("var DIRECTORY_UTM=");
const end = html.indexOf("function computeKpis(rows){");
assert(start > 0 && end > start, "paysCommission block not found");
const paysCommission = new Function(html.slice(start, end) + "\nreturn paysCommission;")();
const NEW = "2026-11-03T19:30:00Z", OLD = "2026-11-03T19:09:59Z";
const cases = [
  // net new (at/after cutoff, flag present): only commission_eligible===true pays
  [{ created_at: NEW, commission_eligible: true, call_source: "google_website" }, true],
  [{ created_at: NEW, commission_eligible: false, call_source: "not_seo_aeo:yelp", source_page: "inbound-call" }, false],
  [{ created_at: "2026-11-03T19:10:00Z", commission_eligible: false }, false],
  // grandfathered: pre-cutoff, or flag missing (old lead-crm v48) -> pre-#362 rule (pays)
  [{ created_at: OLD, commission_eligible: false, call_source: "unknown" }, true],
  [{ created_at: OLD, source_page: "inbound-call" }, true],
  [{ created_at: "2026-10-01T00:00:00Z", source_page: "/contact", utm_source: "Yelp" }, true],
  [{ created_at: NEW, source_page: "/contact", utm_source: "google" }, true],
  [{ source_page: "inbound-call" }, true],
];
for (const [row, want] of cases) assert.equal(paysCommission(row), want, JSON.stringify(row));
assert.match(html, /return paysCommission\(r\)&&statusOrNew\(r\.status\)==="won"/, "commMtd must filter on paysCommission");
console.log(`leads commission: ${cases.length} cases ok`);
