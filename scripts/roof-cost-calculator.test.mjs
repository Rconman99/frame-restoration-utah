// Guards for the roof size calculator. Prices were removed by owner decision on
// 2026-11-25 (no prices on a contractor site), so these tests exist to keep them out:
// no dollar amount in the page or the script, no per-square price field, no money
// formatter, and the published sizing math still matches what the page claims.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const calc = require("../assets/roof-cost-calculator.js");
const scriptSource = readFileSync(new URL("../assets/roof-cost-calculator.js", import.meta.url), "utf8");
const page = readFileSync(new URL("../pages/roof-cost-calculator.html", import.meta.url), "utf8");

const DOLLAR_AMOUNT = /\$\s?\d/;

test("the page shows no dollar amount", () => {
  assert.doesNotMatch(page, DOLLAR_AMOUNT, "the calculator page must not publish a dollar figure");
});

test("the script shows no dollar amount", () => {
  assert.doesNotMatch(scriptSource, DOLLAR_AMOUNT, "the calculator script must not publish a dollar figure");
});

test("the script has no price fields and no money formatter", () => {
  for (const banned of [
    "lowPerSquare",
    "highPerSquare",
    "PerSquare",
    "confirmedBy",
    "confirmedOn",
    "rangeNote",
    "ROOF_PRICING",
    "money(",
    "round500",
    "priced(",
    "currency",
  ]) {
    assert.ok(!scriptSource.includes(banned), `the calculator script must not contain ${banned}`);
  }
  for (const m of calc.ROOF_CALC.materials) {
    assert.deepEqual(Object.keys(m).sort(), ["id", "label"], `${m.id}: a material carries an id and a label only`);
  }
  assert.equal(calc.ROOF_PRICING, undefined, "the priced export is gone");
});

test("pitch factors follow sqrt(1 + (rise/12)^2)", () => {
  const rises = { low: 4, standard: 6, steep: 8, very_steep: 10 };
  for (const [k, rise] of Object.entries(rises)) {
    const exact = Math.sqrt(1 + (rise / 12) ** 2);
    assert.ok(Math.abs(calc.PITCH[k].factor - exact) < 0.001, k);
  }
  assert.equal(calc.OVERHANG, 1.1);
});

test("worked example on the page matches the math", () => {
  const squares = (2000 * calc.OVERHANG * calc.PITCH.steep.factor) / 100;
  assert.equal(Math.round(squares), 26);
  assert.match(page, /2,000 sq ft footprint with an 8\/12 pitch comes out near 26 squares/);
});

test("page loads the calculator and has every field it reads", () => {
  assert.match(page, /src="\/assets\/roof-cost-calculator\.js\?v=\d+"/);
  for (const id of ["rc-form", "rc-footprint", "rc-pitch", "rc-squares", "rc-material", "rc-result",
    "rc-footprint-row", "rc-pitch-row", "rc-squares-row"]) {
    assert.ok(page.includes(`id="${id}"`), id);
  }
});
