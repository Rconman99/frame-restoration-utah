// Guards the blog against republished prices. Dollar figures were removed from
// every customer-facing post by owner decision on 2026-11-25 (no prices on a
// contractor site — cost-FACTOR content and a free-inspection / written-quote CTA
// only), so this test exists to keep them out: every .html under blog/ must carry
// no dollar amount except the cited third-party figures allowlisted below.
//
// Companion guard: scripts/roof-cost-calculator.test.mjs covers the roof size
// calculator. A separate guard covers the served pages outside blog/.
//
// Adding to ALLOWED is a deliberate act. A figure qualifies only when it is NOT a
// price Frame or any contractor charges — a government program amount, an
// insurance statistic, a tax-credit amount, a lender term — AND the post names the
// source next to it. A "typical", "average", market-range, per-square,
// per-square-foot or per-linear-foot figure never qualifies, however it is framed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const repoRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const blogRoot = path.join(repoRoot, "blog");

const DOLLAR_AMOUNT = /\$\s?\d/;

// file (relative to the repo root) -> exact substrings that may carry a dollar sign.
// Every occurrence of each substring is exempt; anything else in the file is not.
const ALLOWED = {
  // HUD Title I program amount, cited to hud.gov in the same list item.
  "blog/index.html": ["$25,000"],
  // FHA/HUD Title I program amounts and the Title I securing threshold, all cited
  // to hud.gov in the post's Source-Backed Utah Financing Checks list.
  "blog/utah/roof-financing-options-utah.html": ["$25,000", "$7,500"],
  // Worked example of a percentage wind/hail deductible on a home value — an
  // insurance policy mechanic, not a roofing price.
  "blog/bountiful/davis-county-wind-damage-guide.html": ["$650,000", "$6,500 to $13,000"],
  // Insurance Information Institute average paid loss per water/wind incident,
  // linked to iii.org in the same sentence.
  "blog/layton/emergency-roof-tarping.html": ["$13,954"],
  // Illustration of a quote line shown as a placeholder rather than a real price,
  // in the passage telling homeowners to challenge exactly that.
  "blog/utah/how-to-choose-a-roofer-utah.html": ["$0,"],
};

function htmlFiles(dir) {
  const out = [];
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...htmlFiles(full));
    else if (entry.isFile() && entry.name.endsWith(".html")) out.push(full);
  }
  return out;
}

const pages = htmlFiles(blogRoot).sort();

test("blog/ has pages to scan", () => {
  assert.ok(pages.length > 20, `expected the blog corpus, found ${pages.length} pages`);
});

test("no blog page publishes a price", () => {
  for (const file of pages) {
    const rel = path.relative(repoRoot, file).split(path.sep).join("/");
    let body = readFileSync(file, "utf8");
    for (const allowed of ALLOWED[rel] ?? []) {
      body = body.split(allowed).join(" ");
    }
    const match = body.match(DOLLAR_AMOUNT);
    // assert.ok keeps the failure to one line; assert.doesNotMatch would print the
    // whole page.
    assert.ok(
      match === null,
      `${rel} publishes a dollar figure near "${body
        .slice(Math.max(0, (match?.index ?? 0) - 60), (match?.index ?? 0) + 60)
        .replace(/\s+/g, " ")
        .trim()}". Remove it, or — only for a cited third-party figure that is not a ` +
        `contractor price — add the exact substring to ALLOWED in ` +
        `scripts/no-published-prices-blog.test.mjs.`,
    );
  }
});

test("every allowlist entry is still present and still needed", () => {
  for (const [rel, substrings] of Object.entries(ALLOWED)) {
    const body = readFileSync(path.join(repoRoot, rel), "utf8");
    for (const allowed of substrings) {
      assert.ok(
        body.includes(allowed),
        `${rel}: the allowlisted figure ${allowed} is gone — drop it from ALLOWED in ` +
          `scripts/no-published-prices-blog.test.mjs so the list cannot rot into a blanket exemption.`,
      );
    }
  }
});
