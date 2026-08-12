import test from "node:test";
import assert from "node:assert/strict";
import { cityAttributionState, normalizeSiteUrl, summarizeQueryAttribution } from "./slv-gsc-attribution.mjs";

const intended = "https://www.framerestorationutah.com/locations/holladay";

test("URL normalization removes tracking parameters, www, html, and trailing slashes", () => {
  assert.equal(
    normalizeSiteUrl("https://www.framerestorationutah.com/locations/holladay.html/?utm_source=google#x"),
    "framerestorationutah.com/locations/holladay",
  );
});

test("an unrequested query remains explicitly unmeasured", () => {
  const result = summarizeQueryAttribution({ keyword: "roofer holladay", intendedCanonical: intended, requested: false });
  assert.equal(result.state, "unmeasured-not-requested");
  assert.equal(result.highestImpressionUrl, null);
});

test("an exact request with no row is not converted to zero", () => {
  const result = summarizeQueryAttribution({ keyword: "roofer holladay", intendedCanonical: intended, requested: true });
  assert.equal(result.state, "requested-no-row-returned");
  assert.match(result.interpretation, /not zero demand/i);
});

test("query parameters do not create false multi-URL competition", () => {
  const result = summarizeQueryAttribution({
    keyword: "roof repair holladay",
    intendedCanonical: intended,
    requested: true,
    rows: [
      { page: `${intended}?utm_source=google`, clicks: 0, impressions: 2, position: 9 },
      { page: `${intended}/`, clicks: 0, impressions: 3, position: 10 },
    ],
  });
  assert.equal(result.state, "intended-url-only");
  assert.equal(result.rows.length, 1);
  assert.equal(result.rows[0].impressions, 5);
});

test("intended and alternate routes are retained for diagnosis without declaring cannibalization", () => {
  const result = summarizeQueryAttribution({
    keyword: "roofing contractor holladay",
    intendedCanonical: intended,
    requested: true,
    rows: [
      { page: intended, clicks: 0, impressions: 11, position: 13.1 },
      { page: "https://www.framerestorationutah.com/salt-lake-city", clicks: 0, impressions: 11, position: 8.5 },
    ],
  });
  assert.equal(result.state, "multi-url-including-intended");
  assert.equal(result.rows.length, 2);
  assert.match(result.interpretation, /diagnose timing/i);
  assert.equal(cityAttributionState([result]), "url-competition-requires-diagnosis");
});
