// leads.html commission KPI pays only SEO/AEO leads (mirrors _shared/tracking-numbers.ts).
import { readFileSync } from "node:fs";
import assert from "node:assert/strict";
const html = readFileSync(new URL("../leads.html", import.meta.url), "utf8");
const start = html.indexOf("var DIRECTORY_UTM=");
const end = html.indexOf("function computeKpis(rows){");
assert(start > 0 && end > start, "paysCommission block not found");
const paysCommission = new Function(html.slice(start, end) + "\nreturn paysCommission;")();
const cases = [
  [{ commission_eligible: true, call_source: "google_website" }, true],
  [{ commission_eligible: false, call_source: "not_seo_aeo:yelp", source_page: "inbound-call" }, false],
  [{ call_source: "unknown" }, false],
  [{ source_page: "inbound-call" }, false],
  [{ source_page: "/contact", utm_source: "google" }, false],
  [{ source_page: "/contact", utm_source: "Yelp" }, false],
];
for (const [row, want] of cases) assert.equal(paysCommission(row), want, JSON.stringify(row));
assert.match(html, /return paysCommission\(r\)&&statusOrNew\(r\.status\)==="won"/, "commMtd must filter on paysCommission");
console.log(`leads commission: ${cases.length} cases ok`);
