// lead-tier.test.ts — frozen lead-classification contract for handle-lead.
// ─────────────────────────────────────────────────────────────────────────────
// Tier drives notification urgency (emergency pages Landon loudest) and SMS
// suppression (spam is muted). The heuristic short-circuit classifies most leads
// before the optional LLM, so an emergency-leak lead silently dropping to
// "general" — or a hallucinated tier reaching the DB — is exactly the regression
// this freezes. handle-lead imports these functions, so the test exercises
// SHIPPING code. Parity port of the TX repo's lead-tier.test.ts (#217).
//
// Run locally:  deno test supabase/functions/_shared/lead-tier.test.ts
// CI: the "lead-tier-classification" job in .github/workflows/compliance-gate.yml

import { assertEquals } from "jsr:@std/assert@1";
import {
  ALLOWED_TIERS,
  coerceLlmClassification,
  fallbackClassification,
  heuristicClassify,
} from "./lead-tier.ts";

Deno.test("heuristicClassify: each form dropdown maps to its frozen tier", () => {
  assertEquals(heuristicClassify("leak", "")?.tier, "emergency");
  assertEquals(heuristicClassify("hail", "")?.tier, "urgent");
  assertEquals(heuristicClassify("insurance", "")?.tier, "scheduled");
  assertEquals(heuristicClassify("old_roof", "")?.tier, "scheduled");
  // case-insensitive on the dropdown value
  assertEquals(heuristicClassify("LEAK", "")?.tier, "emergency");
});

Deno.test("heuristicClassify: heuristic never sets a confidence (LLM-only)", () => {
  assertEquals(heuristicClassify("leak", "")?.confidence, null);
  assertEquals(heuristicClassify("leak", "")?.classifier, "heuristic");
});

Deno.test("heuristicClassify: empty dropdown + no message → general", () => {
  assertEquals(heuristicClassify("", "")?.tier, "general");
  assertEquals(heuristicClassify("", "   ")?.tier, "general"); // whitespace-only is empty
});

Deno.test("heuristicClassify: defers to LLM (null) when ambiguous", () => {
  assertEquals(heuristicClassify("other", "my roof is weird"), null); // unknown dropdown
  assertEquals(heuristicClassify("", "I have a question about my roof"), null); // empty dropdown + real message
  // a long message trumps even a confident dropdown → defer to LLM
  const long = "x".repeat(51);
  assertEquals(heuristicClassify("leak", long), null);
  // exactly 50 chars is NOT long → dropdown still wins
  assertEquals(heuristicClassify("leak", "y".repeat(50))?.tier, "emergency");
});

Deno.test("coerceLlmClassification: a valid tier passes through with model slug", () => {
  const c = coerceLlmClassification({ tier: "urgent", confidence: 0.8, reason: "storm" }, "google/gemini-2.0-flash-001");
  assertEquals(c, { tier: "urgent", reason: "storm", confidence: 0.8, classifier: "google/gemini-2.0-flash-001" });
});

Deno.test("coerceLlmClassification: an invalid/hallucinated tier is rejected", () => {
  assertEquals(coerceLlmClassification({ tier: "URGENT!!!", confidence: 0.9 }, "m"), null);
  assertEquals(coerceLlmClassification({ tier: "vip", confidence: 0.9 }, "m"), null);
  assertEquals(coerceLlmClassification({ confidence: 0.9 }, "m"), null); // missing tier
});

Deno.test("coerceLlmClassification: confidence is clamped to [0,1] (0 → 0.5 quirk frozen)", () => {
  assertEquals(coerceLlmClassification({ tier: "spam", confidence: 2 }, "m")?.confidence, 1); // over → 1
  assertEquals(coerceLlmClassification({ tier: "spam", confidence: -1 }, "m")?.confidence, 0); // under → 0
  assertEquals(coerceLlmClassification({ tier: "spam" }, "m")?.confidence, 0.5); // missing → 0.5
  assertEquals(coerceLlmClassification({ tier: "spam", confidence: "0.9" }, "m")?.confidence, 0.9); // numeric string
  assertEquals(coerceLlmClassification({ tier: "spam", confidence: 0 }, "m")?.confidence, 0.5); // 0 is falsy → 0.5 (intentional quirk)
});

Deno.test("coerceLlmClassification: reason defaults + truncates at 200 chars", () => {
  assertEquals(coerceLlmClassification({ tier: "general" }, "m")?.reason, "no reason given");
  assertEquals(coerceLlmClassification({ tier: "general", reason: "z".repeat(250) }, "m")?.reason.length, 200);
});

Deno.test("fallbackClassification: fail-open default is scheduled / fallback", () => {
  const f = fallbackClassification();
  assertEquals(f.tier, "scheduled");
  assertEquals(f.classifier, "fallback");
  assertEquals(f.confidence, null);
});

Deno.test("ALLOWED_TIERS is the canonical 5-tier set", () => {
  assertEquals(ALLOWED_TIERS, ["emergency", "urgent", "scheduled", "general", "spam"]);
});
