// Guards for the roof cost calculator: no dollar range ships without an owner sign-off,
// the math matches the published method, and the page is wired to the script.
import { test } from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const calc = require("../assets/roof-cost-calculator.js");
const page = readFileSync(new URL("../pages/roof-cost-calculator.html", import.meta.url), "utf8");

test("prices are either both null or a confirmed low/high pair", () => {
  const { ROOF_PRICING: p } = calc;
  let anyPriced = false;
  for (const m of p.materials) {
    const lo = m.lowPerSquare, hi = m.highPerSquare;
    assert.ok((lo === null) === (hi === null), `${m.id}: low and high must both be set or both null`);
    if (lo !== null) {
      anyPriced = true;
      assert.ok(Number.isFinite(lo) && Number.isFinite(hi) && lo > 0 && lo <= hi, `${m.id}: bad range`);
    }
  }
  if (anyPriced) {
    assert.ok(p.confirmedBy && /\S/.test(p.confirmedBy), "a price range needs confirmedBy (the owner who approved it)");
    assert.match(String(p.confirmedOn), /^\d{4}-\d{2}-\d{2}$/, "a price range needs confirmedOn (YYYY-MM-DD)");
  }
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
