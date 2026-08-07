import test from "node:test";
import assert from "node:assert/strict";
import { generateKeyPairSync } from "node:crypto";
import { buildSnapshot } from "./seo-snapshot.mjs";
import { fetchGscSections } from "./lib/gsc.mjs";

const { privateKey } = generateKeyPairSync("rsa", {
  modulusLength: 2048,
  privateKeyEncoding: { type: "pkcs8", format: "pem" },
  publicKeyEncoding: { type: "spki", format: "pem" },
});
const SA = JSON.stringify({ client_email: "x@y.iam.gserviceaccount.com", private_key: privateKey, token_uri: "https://oauth2.example/token" });

function fakeGscFetch() {
  return async (url, opts) => {
    if (String(url).includes("oauth2")) return { ok: true, json: async () => ({ access_token: "t", expires_in: 3600 }) };
    const body = JSON.parse(opts.body);
    const rows = {
      date: [{ keys: ["2026-08-01"], clicks: 3, impressions: 900 }],
      query: [{ keys: ["q"], clicks: 3, impressions: 100, position: 8 }],
      "query+page": [{ keys: ["q", "https://x/p"], clicks: 3, impressions: 100, position: 8 }],
      page: [{ keys: ["https://x/p"], clicks: 3, impressions: 100, position: 8 }],
    }[body.dimensions.join("+")] || [];
    return { ok: true, json: async () => ({ rows }) };
  };
}

/**
 * The snapshot writer used to copy GSC fields across one by one, so adding a
 * field to fetchGscSections and forgetting this list dropped it silently —
 * which is exactly what happened to `queries_stored_impressions`: the readout
 * printed "showing 370 of 1426 queries" and left out the impression share it
 * existed to report. Unit tests on either side both passed, because one proved
 * the field was returned and the other injected it directly.
 *
 * This asserts the seam itself: everything the client returns reaches the
 * snapshot. It fails on the NEXT field someone adds, not just that one.
 */
test("every field fetchGscSections returns survives into the snapshot", async () => {
  const fetchImpl = fakeGscFetch();
  const env = { GSC_SERVICE_ACCOUNT_JSON: SA, GSC_SITE_URL: "https://www.example.com/" };
  const sections = await fetchGscSections({ env, fetchImpl, now: new Date("2026-08-07T12:00:00Z") });

  // A real crawl would hit the network; stand in a minimal successful one.
  const { snapshot } = await buildSnapshot({
    site: "https://www.example.com",
    env,
    crawlImpl: async () => ({
      failed: false, pages: 1, indexable_pages: 1, fetched_at: "2026-08-07T12:00:00Z",
      by_status: { 200: 1 }, issues: [], notes: [],
    }),
    gscFetchImpl: fetchImpl,
  });

  const missing = Object.keys(sections).filter((k) => !(k in snapshot.gsc));
  assert.deepEqual(missing, [], `snapshot.gsc dropped: ${missing.join(", ")}`);
  assert.equal(snapshot.gsc.available, true);
  assert.equal(snapshot.gsc.queries_stored_impressions, sections.queries_stored_impressions);
});

test("a GSC field with value 0 is persisted, not treated as absent", async () => {
  const fetchImpl = fakeGscFetch();
  const env = { GSC_SERVICE_ACCOUNT_JSON: SA };
  const { snapshot } = await buildSnapshot({
    site: "https://www.example.com",
    env,
    crawlImpl: async () => ({
      failed: false, pages: 1, indexable_pages: 1, fetched_at: "2026-08-07T12:00:00Z",
      by_status: { 200: 1 }, issues: [], notes: [],
    }),
    gscFetchImpl: fetchImpl,
  });
  assert.equal(snapshot.gsc.pages_truncated, false); // false, not undefined
  assert.ok(Number.isFinite(snapshot.gsc.queries_stored_impressions));
});
