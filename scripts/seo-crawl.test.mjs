// Unit tests for the crawler's head-extraction helpers.
// Run: node --test scripts/seo-crawl.test.mjs
import test from "node:test";
import assert from "node:assert/strict";
import { metaContent, canonicalHref } from "./seo-crawl.mjs";

const meta = (d) => `<meta name="description" content="${d}" />`;

test("an apostrophe inside a double-quoted value does not truncate it", () => {
  const html = meta("Frame Restoration Utah's Frisco roofing resource hub — Frisco, TX.");
  assert.equal(
    metaContent(html, "description"),
    "Frame Restoration Utah's Frisco roofing resource hub — Frisco, TX.",
  );
});

test("descriptions sharing a pre-apostrophe prefix stay distinct", () => {
  // The exact production shape that produced a phantom duplicate-meta-description:
  // every value begins "Frame Restoration Utah's ...", so truncating at the first
  // apostrophe collapsed all four to "Frame Restoration Utah".
  const values = [
    "Frame Restoration Utah's Frisco roofing resource hub.",
    "Frame Restoration Utah's McKinney roofing resource hub.",
    "Frame Restoration Utah's Plano roofing resource hub.",
    "Frame Restoration Utah's Project Manager Jace Wright was featured in the news.",
  ].map((d) => metaContent(meta(d), "description"));

  assert.equal(new Set(values).size, 4, "each description must extract distinctly");
  assert.ok(!values.includes("Frame Restoration Utah"), "no value may truncate to the shared prefix");
});

test("genuinely identical descriptions still collide", () => {
  // The fix must not cost us true positives.
  const a = metaContent(meta("One shared description."), "description");
  const b = metaContent(meta("One shared description."), "description");
  assert.equal(a, b);
});

test("single-quoted values and embedded double quotes both survive", () => {
  assert.equal(
    metaContent(`<meta name='description' content='He said "hello" today.' />`, "description"),
    'He said "hello" today.',
  );
});

test("reversed attribute order still extracts the full value", () => {
  assert.equal(
    metaContent(`<meta content="Frame Restoration Utah's crew." name="description">`, "description"),
    "Frame Restoration Utah's crew.",
  );
});

test("a missing meta reads null — not an empty string", () => {
  assert.equal(metaContent("<html><head></head></html>", "description"), null);
});

test("robots noindex detection is unaffected by the delimiter change", () => {
  assert.equal(metaContent(`<meta name="robots" content="noindex, nofollow" />`, "robots"), "noindex, nofollow");
});

test("canonical href extracts fully in either attribute order", () => {
  const want = "https://www.framerestorationutah.com/blog/frisco";
  assert.equal(canonicalHref(`<link rel="canonical" href="${want}" />`), want);
  assert.equal(canonicalHref(`<link href="${want}" rel="canonical" />`), want);
  assert.equal(canonicalHref("<html><head></head></html>"), null);
});
