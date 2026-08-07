import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { fetchGscSections } from "./gsc.mjs";

// A real RSA key, so the JWT signing path executes for real. A dummy string key
// makes every test in this file skip, which passes CI while verifying nothing.
const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});

/**
 * A fake Search Console. Routes by the `dimensions` in the request body so each
 * pull can be answered independently, and records what was asked for.
 */
function fakeGsc({ date = [], query = [], queryPage = [], page = [] } = {}) {
  const calls = [];
  const fetchImpl = async (url, opts) => {
    if (String(url).includes("oauth2")) {
      return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    }
    const body = JSON.parse(opts.body);
    calls.push(body);
    const key = body.dimensions.join("+");
    const rows = { date, query, "query+page": queryPage, page }[key] || [];
    return { ok: true, json: async () => ({ rows }) };
  };
  return { fetchImpl, calls };
}

const SA = JSON.stringify({ client_email: "x@y.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.example/token" });

const env = { GSC_SERVICE_ACCOUNT_JSON: SA, GSC_SITE_URL: "https://www.example.com/" };

test("the page dimension is actually requested", async () => {
  const { fetchImpl, calls } = fakeGsc({ page: [{ keys: ["https://x/a"], clicks: 0, impressions: 10, position: 9 }] });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  const dims = calls.map((c) => c.dimensions.join("+"));
  assert.ok(dims.includes("page"), `expected a page-dimension pull, got: ${dims.join(", ")}`);
  assert.equal(sections.top_pages.length, 1);
});

test("top_pages sorts by impressions BEFORE the 200 cap", async () => {
  // GSC returns rows clicks-desc. A high-impression zero-click page therefore
  // arrives last — capping before sorting would drop exactly the pages the
  // silent-pages report exists to surface.
  const page = [];
  for (let i = 0; i < 205; i += 1) page.push({ keys: [`https://x/c${i}`], clicks: 5, impressions: 10, position: 3 });
  page.push({ keys: ["https://x/silent"], clicks: 0, impressions: 9999, position: 40 });
  const { fetchImpl } = fakeGsc({ page });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  assert.equal(sections.top_pages.length, 200);
  assert.equal(sections.top_pages[0].page, "https://x/silent");
  assert.equal(sections.pages_truncated, true);
});

test("truncated is true when storage drops rows the fetch did not", async () => {
  // 400 rows fetched, 200 stored. The old check was `queryRows.length >= 1000`,
  // which reported truncated:false here and let the readout imply full coverage.
  const query = [];
  for (let i = 0; i < 400; i += 1) query.push({ keys: [`q${i}`], clicks: 1, impressions: 5, position: 10 });
  const { fetchImpl } = fakeGsc({ query });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  assert.equal(sections.queries_seen, 400);
  assert.equal(sections.queries_stored, 200);
  assert.equal(sections.truncated, true);
});

test("nothing dropped -> truncated stays false", async () => {
  const query = [{ keys: ["q"], clicks: 1, impressions: 5, position: 10 }];
  const { fetchImpl } = fakeGsc({ query });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  assert.equal(sections.truncated, false);
  assert.equal(sections.pages_truncated, false);
});

test("top_queries stores the union of by-clicks and by-impressions", async () => {
  // The API sorts clicks-desc only. A zero-click query with huge impressions
  // therefore arrives last; the old `slice(0, 200)` dropped it while keeping 200
  // one-click rows. Both orderings must survive.
  const query = [];
  for (let i = 0; i < 250; i += 1) query.push({ keys: [`click${i}`], clicks: 5, impressions: 2, position: 3 });
  query.push({ keys: ["invisible-giant"], clicks: 0, impressions: 9999, position: 60 });
  const { fetchImpl, calls } = fakeGsc({ query });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  const names = sections.top_queries.map((r) => r.query);
  assert.ok(names.includes("invisible-giant"), "high-impression zero-click query must survive the cap");
  assert.equal(sections.top_queries[0].query, "invisible-giant", "stored rows are impressions-desc");
  assert.ok(names.includes("click0"), "top-by-clicks rows must survive too");
  assert.ok(sections.top_queries.length <= 400, `union is bounded, got ${sections.top_queries.length}`);
  // No duplicates across the two orderings.
  assert.equal(new Set(names).size, names.length);
  // Fetch depth was raised past 1000 — the tail is where the volume lives.
  const q = calls.find((c) => c.dimensions.join() === "query");
  assert.equal(q.rowLimit, 5000);
});

test("queries_stored_impressions reports real coverage, not row count", async () => {
  const query = [
    { keys: ["a"], clicks: 1, impressions: 30, position: 5 },
    { keys: ["b"], clicks: 0, impressions: 70, position: 40 },
  ];
  const date = [{ keys: ["2026-08-01"], clicks: 1, impressions: 1000 }];
  const { fetchImpl } = fakeGsc({ query, date });
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });
  assert.equal(sections.queries_stored_impressions, 100);
  assert.equal(sections.impressions28d, 1000); // 100/1000 = 10% coverage
});
