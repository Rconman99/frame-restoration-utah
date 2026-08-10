// lead-sms.test.ts — frozen message + consent contract for handle-lead's SMS copy.
// ─────────────────────────────────────────────────────────────────────────────
// The customer auto-reply is user-facing copy texted to real homeowners on a
// LIVE A2P 10DLC number, but the site-wide forbidden-word gate never scans
// supabase/. This test closes that gap (ported from the TX repo's pattern):
//   • every customer message carries "Reply STOP to opt out." (carrier compliance),
//   • shows the public business number,
//   • contains NO Utah forbidden term (deductible-rebate / public-adjuster /
//     claim-negotiation fences — Utah Code §31A-26-201 family) from the SAME
//     canonical compliance-words.json the site gate uses,
//   • the TCPA consent gate: no sms_consent → NO auto-text, ever.
//
// Run locally:  deno test supabase/functions/_shared/lead-sms.test.ts
// CI: the "lead-sms-contract" job in .github/workflows/compliance-gate.yml

import { assert, assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  customerAutoReply,
  shouldSendCustomerAutoText,
  SMS_BUSINESS_PHONE,
  smsDeliveryEnabled,
  smsForLandon,
  type Tier,
} from "./lead-sms.ts";
import complianceWords from "../../../data/route-factory/compliance-words.json" with {
  type: "json",
};

const FORBIDDEN: { key: string; pattern: string }[] = Object.entries(
  (complianceWords as {
    forbiddenWords: Record<string, { patterns: string[]; severity: string }>;
  }).forbiddenWords,
)
  .filter(([, rule]) => rule.severity === "blocker")
  .flatMap(([key, rule]) => rule.patterns.map((pattern) => ({ key, pattern })));

const TIERS: Tier[] = ["emergency", "urgent", "scheduled", "general", "spam"];

Deno.test("Utah SMS delivery is fail-closed behind an exact opt-in", () => {
  for (
    const disabled of [
      undefined,
      null,
      false,
      true,
      "",
      "false",
      "TRUE",
      " true ",
      "1",
    ]
  ) {
    assertEquals(smsDeliveryEnabled(disabled), false, String(disabled));
  }
  assertEquals(smsDeliveryEnabled("true"), true);
});

Deno.test("every customer auto-reply carries the A2P STOP line", () => {
  for (const tier of TIERS) {
    assertStringIncludes(
      customerAutoReply(tier, "Sam"),
      "Reply STOP to opt out.",
      `tier=${tier}`,
    );
  }
});

Deno.test("every customer auto-reply shows the public business number", () => {
  for (const tier of TIERS) {
    assertStringIncludes(
      customerAutoReply(tier, ""),
      SMS_BUSINESS_PHONE,
      `tier=${tier}`,
    );
  }
});

Deno.test("no Utah forbidden term in any customer or owner message", () => {
  assert(
    FORBIDDEN.length > 0,
    "canonical wordlist must yield blocker patterns",
  );
  for (const tier of TIERS) {
    const messages = [
      customerAutoReply(tier, "Sam").toLowerCase(),
      smsForLandon(tier, "Sam Smith", "+14355551234", "roof leak", "test")
        .toLowerCase(),
    ];
    for (const msg of messages) {
      for (const { key, pattern } of FORBIDDEN) {
        assert(
          !msg.includes(pattern.toLowerCase()),
          `tier=${tier}: forbidden "${pattern}" (${key}) found in message`,
        );
      }
    }
  }
});

Deno.test("owner alert urgency routing is preserved", () => {
  assertStringIncludes(
    smsForLandon("emergency", "S", "p", "svc", "r"),
    "🚨 EMERGENCY",
  );
  assertStringIncludes(
    smsForLandon("emergency", "S", "p", "svc", "r"),
    "Call NOW",
  );
  assertStringIncludes(
    smsForLandon("urgent", "S", "p", "svc", "r"),
    "🔥 URGENT",
  );
  assertStringIncludes(
    smsForLandon("scheduled", "S", "p", "svc", "r"),
    "NEW LEAD",
  );
});

Deno.test("consent gate: no consent → NO auto-text (the TCPA fence)", () => {
  assertEquals(
    shouldSendCustomerAutoText(undefined, "+14355551234").send,
    false,
  );
  assertEquals(shouldSendCustomerAutoText(false, "+14355551234").send, false);
  assertEquals(shouldSendCustomerAutoText("", "+14355551234").send, false);
  assertEquals(
    shouldSendCustomerAutoText(undefined, "+14355551234").reason,
    "no_consent",
  );
});

Deno.test("consent gate: explicit opt-in forms all pass, but only with a phone", () => {
  for (const yes of [true, "true", "yes", "on", "1", 1]) {
    assertEquals(
      shouldSendCustomerAutoText(yes, "+14355551234").send,
      true,
      String(yes),
    );
  }
  const noPhone = shouldSendCustomerAutoText(true, null);
  assertEquals(noPhone.send, false);
  assertEquals(noPhone.reason, "no_valid_phone");
});
