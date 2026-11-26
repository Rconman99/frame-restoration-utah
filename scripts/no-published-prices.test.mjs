// Owner rule, 2026-11-25: no prices on a contractor site. Customer-facing pages
// publish cost FACTORS (roof size in squares, pitch, tear-off layers, decking
// condition, ventilation and flashing, access, permits, elevation, season) and a
// free-inspection / written-scope CTA — never a dollar figure for Frame's work.
//
// This guard fails if a dollar amount reappears on a served page. The only
// permitted dollar amounts are third-party figures that are not Frame's prices
// (lender terms, cited program amounts, policy examples); each one is listed in
// ALLOWED below with the file and the exact substring that carries it.
//
// To extend this scan to blog/ (the blog sweep ships on its own branch), flip
// SCAN_BLOG to true. That is the only change needed.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

const SCAN_BLOG = false;

const root = path.resolve(import.meta.dirname, "..");

// Served, customer-facing HTML. Directories are walked recursively.
const ROOTS = [
  "index.html",
  "404.html",
  "review.html",
  "privacy.html",
  "terms.html",
  "thank-you.html",
  "pages",
  "locations",
  "projects",
  ...(SCAN_BLOG ? ["blog"] : []),
];

// Owner tools, not customer-facing pages: the PIN-gated CRM and the directory
// blitz worksheet Landon works through. Both are excluded from the price rule.
const SKIP = new Set(["leads.html", "directory-blitz-tool.html"]);

const DOLLAR_AMOUNT = /\$\s?\d/;

// file → exact substrings that may carry a dollar amount, with why each stays.
const ALLOWED = {
  // Wisetack's published lender terms. Frame does not set them and they are not
  // a price for roofing work.
  "index.html": [
    "Loans from $500 to $100,000",
    "Loans from $500–$100,000",
    "Loan amounts from $500 to $100,000",
  ],
  "pages/roof-financing.html": [
    "Loans from $500 to $100,000",
    "Loans from $500&ndash;$100,000",
  ],
};

function servedFiles() {
  const out = [];
  const walk = (rel) => {
    const abs = path.join(root, rel);
    let info;
    try {
      info = statSync(abs);
    } catch {
      return; // a root that does not exist yet is not a failure
    }
    if (info.isDirectory()) {
      for (const entry of readdirSync(abs).sort()) walk(path.join(rel, entry));
      return;
    }
    if (!rel.endsWith(".html")) return;
    if (SKIP.has(rel)) return;
    out.push(rel);
  };
  for (const r of ROOTS) walk(r);
  return out;
}

const files = servedFiles();

test("served pages are discovered", () => {
  assert.ok(files.length > 50, `expected the served corpus, found ${files.length} file(s)`);
  assert.ok(files.includes("index.html"));
  assert.ok(files.some((f) => f.startsWith("locations/")));
  assert.ok(files.some((f) => f.startsWith("pages/")));
});

test("no served page outside blog/ publishes a price", () => {
  const offenders = [];
  for (const rel of files) {
    const allowed = ALLOWED[rel] ?? [];
    const lines = readFileSync(path.join(root, rel), "utf8").split("\n");
    lines.forEach((line, i) => {
      if (!DOLLAR_AMOUNT.test(line)) return;
      if (allowed.some((snippet) => line.includes(snippet))) return;
      offenders.push(`${rel}:${i + 1}: ${line.trim().slice(0, 160)}`);
    });
  }
  assert.deepEqual(
    offenders,
    [],
    `dollar amounts on served pages (owner rule: cost factors and a free written quote, no prices):\n${offenders.join("\n")}`,
  );
});

test("every allowlisted line still exists, so the list cannot go stale", () => {
  for (const [rel, snippets] of Object.entries(ALLOWED)) {
    if (!SCAN_BLOG && rel.startsWith("blog/")) continue;
    const source = readFileSync(path.join(root, rel), "utf8");
    for (const snippet of snippets) {
      assert.ok(
        source.includes(snippet),
        `${rel}: allowlisted snippet is gone, remove it from ALLOWED — ${snippet}`,
      );
    }
  }
});
