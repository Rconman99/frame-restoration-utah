// classify-inbound.test.ts — frozen inbound-SMS routing contract for handle-sms.
// ─────────────────────────────────────────────────────────────────────────────
// The relay misclassified inbound webhooks repeatedly in the TX repo (opt-out
// leaked into the reply flow; the TO parser was too strict; internal automation
// got treated as a customer). Each was a one-line routing slip that shipped. This
// freezes Utah's relay routing so the same class of slip can't ship here: change
// the routing and you must change an expected value in the same PR.
//
// handle-sms imports these exact functions, so the test exercises SHIPPING code,
// not a mirror. Run locally:  deno test supabase/functions/_shared/classify-inbound.test.ts
// CI: the "relay-classification" job in .github/workflows/compliance-gate.yml

import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyCustomerInbound,
  isOperator,
  normalizePhone,
  OPERATOR_PHONE,
  parseCallCommand,
  parseToCommand,
} from "./classify-inbound.ts";

Deno.test("isOperator: only Landon's exact line is the operator", () => {
  assertEquals(isOperator(OPERATOR_PHONE), true);
  assertEquals(isOperator("+14353024422"), true); // the literal operator line
  assertEquals(isOperator("+18015551234"), false); // a customer
  assertEquals(isOperator(""), false);
  assertEquals(isOperator("14353024422"), false); // missing +, not an exact match
});

Deno.test("normalizePhone: E.164 coercion mirrors the handler", () => {
  assertEquals(normalizePhone("8015551234"), "+18015551234"); // bare 10-digit
  assertEquals(normalizePhone("18015551234"), "+18015551234"); // 11-digit w/ 1
  assertEquals(normalizePhone("+18015551234"), "+18015551234"); // already E.164
  assertEquals(normalizePhone("(801) 555-1234"), "+18015551234"); // punctuated
  assertEquals(normalizePhone("+448015551234"), "+448015551234"); // >10 digits kept
  assertEquals(normalizePhone(""), ""); // junk → unchanged, never throws
  assertEquals(normalizePhone("not-a-phone"), "not-a-phone");
});

Deno.test("parseCallCommand: CALL <number> → E.164, else null", () => {
  assertEquals(parseCallCommand("CALL 8015551234"), "+18015551234");
  assertEquals(parseCallCommand("CALL +18015551234"), "+18015551234");
  assertEquals(parseCallCommand("call 8015551234"), "+18015551234"); // case-insensitive
  assertEquals(parseCallCommand("CALL"), null); // no number
  assertEquals(parseCallCommand("CALL 801 555 1234"), null); // spaces inside → not matched (current behavior)
  assertEquals(parseCallCommand("TO:8015551234 hi"), null);
  assertEquals(parseCallCommand("just a message"), null);
});

Deno.test("parseToCommand: TO:<number> <message> → routed, else null", () => {
  assertEquals(parseToCommand("TO:8015551234 on my way"), {
    customerNumber: "+18015551234",
    message: "on my way",
  });
  assertEquals(parseToCommand("TO: 8015551234 with a space"), {
    customerNumber: "+18015551234",
    message: "with a space",
  });
  assertEquals(parseToCommand("TO:+18015551234 already e164"), {
    customerNumber: "+18015551234",
    message: "already e164",
  });
  // `s` flag: the message body may span newlines.
  assertEquals(parseToCommand("TO:8015551234 line one\nline two"), {
    customerNumber: "+18015551234",
    message: "line one\nline two",
  });
  assertEquals(parseToCommand("TO:8015551234"), null); // number but no message
  assertEquals(parseToCommand("CALL 8015551234"), null);
  assertEquals(parseToCommand("hello there"), null);
});

Deno.test("classifyCustomerInbound: any OptOutType → optout, else normal", () => {
  assertEquals(classifyCustomerInbound("STOP"), "optout");
  assertEquals(classifyCustomerInbound("stop"), "optout"); // Twilio sends upper, but be defensive
  assertEquals(classifyCustomerInbound("HELP"), "optout");
  assertEquals(classifyCustomerInbound("START"), "optout");
  assertEquals(classifyCustomerInbound("  STOP  "), "optout"); // trimmed
  assertEquals(classifyCustomerInbound(""), "normal");
  assertEquals(classifyCustomerInbound(null), "normal");
  assertEquals(classifyCustomerInbound(undefined), "normal");
});
