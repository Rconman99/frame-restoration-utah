// lead-tier — pure lead urgency classification for Frame Roofing Utah's
// handle-lead.
// ─────────────────────────────────────────────────────────────────────────────
// Side-effect-free. handle-lead imports these so the frozen contract
// (lead-tier.test.ts) exercises the SAME decisions the live handler runs — the
// parity port of the TX repo's _shared/lead-tier.ts (#217).
//
// Tier drives notification routing: emergency pages Landon loudest; spam is
// muted. Two pure pieces are extracted here, behavior-preserving from
// handle-lead v7:
//   • heuristicClassify — the deterministic form-dropdown short-circuit that runs
//     BEFORE the (optional, timeout-bounded) OpenRouter LLM. It's what classifies
//     most leads, so an emergency-leak lead silently dropping to "general" is the
//     regression this freezes.
//   • coerceLlmClassification — the parse contract that keeps a hallucinated or
//     malformed LLM tier out of the DB (validates the tier, clamps confidence,
//     truncates the reason).
// fallbackClassification is the fail-open default (never lose a lead to a broken
// classifier). No classification behavior changes with this extraction.

export type Tier = "emergency" | "urgent" | "scheduled" | "general" | "spam";

export type Classification = {
  tier: Tier;
  reason: string;
  confidence: number | null; // null when set by heuristic
  classifier: string; // 'heuristic' | model slug | 'fallback'
};

export const ALLOWED_TIERS: Tier[] = [
  "emergency",
  "urgent",
  "scheduled",
  "general",
  "spam",
];

// Heuristic short-circuit. Fires when the form's `issue` dropdown alone gives a
// confident answer AND the free-text message is short enough not to contradict
// it. Returns null if the case is ambiguous → caller falls through to the LLM.
// Byte-for-byte the logic handle-lead used inline.
export function heuristicClassify(
  issue: string,
  message: string,
): Classification | null {
  const msg = (message || "").trim();
  const longMessage = msg.length > 50; // longer messages might add nuance

  // Substantial free text trumps the dropdown — defer to the LLM.
  if (longMessage) return null;

  switch ((issue || "").toLowerCase()) {
    case "leak":
      return { tier: "emergency", reason: "Form: active roof leak", confidence: null, classifier: "heuristic" };
    case "hail":
      return { tier: "urgent", reason: "Form: hail/storm damage", confidence: null, classifier: "heuristic" };
    case "insurance":
      return { tier: "scheduled", reason: "Form: insurance claim help", confidence: null, classifier: "heuristic" };
    case "old_roof":
      return { tier: "scheduled", reason: "Form: roof replacement quote", confidence: null, classifier: "heuristic" };
    case "":
      // No dropdown selected, no substantial message → minimal contact, low intent.
      if (!msg) return { tier: "general", reason: "Minimal info: contact only, no issue stated", confidence: null, classifier: "heuristic" };
      return null;
    default:
      // "other" or unknown — let the LLM look at the message.
      return null;
  }
}

// Parse contract for the LLM's already-parsed JSON object. Returns a validated
// Classification, or null if the tier is not in ALLOWED_TIERS (hallucinated /
// malformed → caller falls through to the fallback). Mirrors handle-lead's inline
// validation exactly: confidence is clamped to [0,1] with `Number(x) || 0.5`
// (NOTE: a literal 0 is falsy → becomes 0.5), reason is stringified and capped at
// 200 chars. `classifier` is set to the model slug.
export function coerceLlmClassification(
  parsed: { tier?: unknown; confidence?: unknown; reason?: unknown },
  model: string,
): Classification | null {
  if (!ALLOWED_TIERS.includes(parsed?.tier as Tier)) return null;
  const confidence = Math.max(0, Math.min(1, Number(parsed.confidence) || 0.5));
  const reason = String(parsed.reason || "no reason given").slice(0, 200);
  return { tier: parsed.tier as Tier, reason, confidence, classifier: model };
}

// Fail-open default — never lose a lead because the classifier broke. Identical
// to handle-lead's inline fallback object.
export function fallbackClassification(): Classification {
  return {
    tier: "scheduled",
    reason: "Classifier unavailable — defaulted to scheduled",
    confidence: null,
    classifier: "fallback",
  };
}
