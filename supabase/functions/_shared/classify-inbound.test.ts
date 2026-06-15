// classify-inbound.test.ts — frozen inbound-SMS routing contract for handle-sms.
// ─────────────────────────────────────────────────────────────────────────────
// The relay misclassified inbound webhooks repeatedly (opt-out leaked into the
// reply flow; the TO parser was too strict; internal automation got treated as a
// customer). Each was a one-line routing slip that shipped. This freezes the
// relay routing so the same class of slip can't ship again: change the routing
// and you must change an expected value in the same PR.
//
// handle-sms imports these exact functions, so the test exercises SHIPPING code,
// not a mirror. Run locally:  deno test supabase/functions/_shared/classify-inbound.test.ts
// CI: the "relay-classification" job in .github/workflows/compliance-gate.yml
//
// This is the W2-merge superset: Phase A's 3-bucket routing + tolerant TO parser
// (internal-automation route, JobNimbus body keyword) UNION origin/main's frozen
// opt-out + operator contract.

import { assertEquals } from "jsr:@std/assert@1";
import {
  classifyCustomerInbound,
  isOperator,
  normalizePhone,
  OPERATOR_PHONE,
  parseCallCommand,
  parseToCommand,
} from "./classify-inbound.ts";

const INTERNAL = new Set(["+18015550100"]);

// ── Operator detection (origin/main contract — Phase A inlined the literal, this
//    restores the shared helper both the handler and this test consume) ────────
Deno.test("isOperator: only Landon's exact line is the operator", () => {
  assertEquals(isOperator(OPERATOR_PHONE), true);
  assertEquals(isOperator("+14353024422"), true); // the literal operator line
  assertEquals(isOperator("+18015551234"), false); // a customer
  assertEquals(isOperator(""), false);
  assertEquals(isOperator("14353024422"), false); // missing +, not an exact match
});

// ── normalizePhone ───────────────────────────────────────────────────────────
Deno.test("normalizePhone: E.164 coercion mirrors the handler", () => {
  assertEquals(normalizePhone("8015551234"), "+18015551234"); // bare 10-digit
  assertEquals(normalizePhone("18015551234"), "+18015551234"); // 11-digit w/ 1
  assertEquals(normalizePhone("+18015551234"), "+18015551234"); // already E.164
  assertEquals(normalizePhone("(801) 555-1234"), "+18015551234"); // punctuated
  assertEquals(normalizePhone("+448015551234"), "+448015551234"); // >10 digits kept
  assertEquals(normalizePhone(""), ""); // junk → unchanged, never throws
  assertEquals(normalizePhone("not-a-phone"), "not-a-phone");
});

// ── Customer routing: opt-out > internal > normal (Phase A 3-bucket) ──────────
const CUSTOMER_FIXTURES: Array<{
  name: string;
  from: string;
  body: string;
  optOutType?: string;
  expected: "optout" | "internal" | "normal";
}> = [
  {
    name: "known internal sender -> internal",
    from: "+18015550100",
    body: "New job assigned: 1234 Main St roof inspection",
    expected: "internal",
  },
  {
    name: "JobNimbus by body keyword from unknown number -> internal",
    from: "+14355550000",
    body: "JobNimbus: estimate #4471 approved",
    expected: "internal",
  },
  {
    name: "JobNimbus keyword is case-insensitive -> internal",
    from: "+14355550000",
    body: "jobnimbus automation ping",
    expected: "internal",
  },
  {
    name: "STOP -> optout",
    from: "+18015551234",
    body: "STOP",
    optOutType: "STOP",
    expected: "optout",
  },
  {
    name: "HELP -> optout",
    from: "+18015551234",
    body: "HELP",
    optOutType: "HELP",
    expected: "optout",
  },
  {
    name: "START -> optout path",
    from: "+18015551234",
    body: "START",
    optOutType: "START",
    expected: "optout",
  },
  // A2P precedence guard (origin/main): opt-out must win EVEN when the sender is
  // an internal-relay number — never reply to / forward someone who unsubscribed.
  {
    name: "opt-out wins over internal sender (precedence)",
    from: "+18015550100", // internal sender
    body: "STOP",
    optOutType: "STOP",
    expected: "optout",
  },
  {
    name: "opt-out wins over JobNimbus body keyword (precedence)",
    from: "+14355550000",
    body: "STOP jobnimbus",
    optOutType: "STOP",
    expected: "optout",
  },
  {
    name: "lowercase opt-out is trimmed + still optout",
    from: "+18015551234",
    body: "  stop  ",
    optOutType: "  stop  ",
    expected: "optout",
  },
  {
    name: "genuine customer storm-damage text -> normal",
    from: "+18015551234",
    body:
      "Hi, I think I have hail damage on my roof after last night. Can someone come look?",
    expected: "normal",
  },
  {
    name: "short genuine customer reply -> normal",
    from: "+14355559876",
    body: "yes that time works, thanks",
    expected: "normal",
  },
  {
    name: "empty optOutType + plain body -> normal (no false optout)",
    from: "+18015551234",
    body: "",
    optOutType: "",
    expected: "normal",
  },
  {
    name: "known limitation: customer asking about JobNimbus -> internal",
    from: "+18015551234",
    body: "Do you guys use JobNimbus for scheduling?",
    expected: "internal",
  },
];

Deno.test("customer routing fixtures", () => {
  for (const f of CUSTOMER_FIXTURES) {
    assertEquals(
      classifyCustomerInbound({
        from: f.from,
        body: f.body,
        optOutType: f.optOutType,
        internalSenders: INTERNAL,
      }),
      f.expected,
      f.name,
    );
  }
});

Deno.test("classifyCustomerInbound: junk input is safe, never throws", () => {
  assertEquals(
    classifyCustomerInbound({ from: "", body: "", internalSenders: INTERNAL }),
    "normal",
  );
  assertEquals(
    classifyCustomerInbound({
      from: "garbage",
      body: "???",
      internalSenders: new Set<string>(),
    }),
    "normal",
  );
});

// ── Tolerant operator TO parser (Phase A #212 parser) ────────────────────────
const TO_FIXTURES: Array<{
  name: string;
  body: string;
  expected: { customerNumber: string; messageBody: string } | null;
}> = [
  {
    name: "plain 10-digit colon form routes",
    body: "TO:8015551234 on my way",
    expected: { customerNumber: "+18015551234", messageBody: "on my way" },
  },
  {
    name: "bracketed number copied from the prompt",
    body: "TO:<8015551234> hi",
    expected: { customerNumber: "+18015551234", messageBody: "hi" },
  },
  {
    name: "dashed number, space after TO",
    body: "TO 801-555-1234 hi",
    expected: { customerNumber: "+18015551234", messageBody: "hi" },
  },
  {
    name: "+1 with spaces, multi-word message",
    body: "TO:+1 801 555 1234 hello there, on my way",
    expected: {
      customerNumber: "+18015551234",
      messageBody: "hello there, on my way",
    },
  },
  {
    name: "plain 10-digit, colon form",
    body: "TO:3855551234 your roof estimate is ready",
    expected: {
      customerNumber: "+13855551234",
      messageBody: "your roof estimate is ready",
    },
  },
  {
    name: "message body is trimmed",
    body: "TO:3855551234    on my way   ",
    expected: { customerNumber: "+13855551234", messageBody: "on my way" },
  },
  {
    name: "newline body is preserved (origin/main `s`-flag behavior)",
    body: "TO:8015551234 line one\nline two",
    expected: {
      customerNumber: "+18015551234",
      messageBody: "line one\nline two",
    },
  },
  {
    name: "number with no message -> null (safe fallback, not a stray send)",
    body: "TO:8015551234",
    expected: null,
  },
  {
    name: "a plain reply is not a TO command",
    body: "sounds good, see you then",
    expected: null,
  },
  {
    name: "a CALL command is not a TO command",
    body: "CALL 8015551234",
    expected: null,
  },
];

Deno.test("operator TO-command parser fixtures", () => {
  for (const f of TO_FIXTURES) {
    assertEquals(parseToCommand(f.body), f.expected, f.name);
  }
});

Deno.test("operator CALL-command parser fixtures", () => {
  assertEquals(parseCallCommand("CALL 8015551234"), "+18015551234");
  assertEquals(parseCallCommand("CALL +18015551234"), "+18015551234");
  assertEquals(parseCallCommand("call 8015551234"), "+18015551234"); // case-insensitive
  assertEquals(parseCallCommand("CALL"), null); // no number
  assertEquals(parseCallCommand("hello there"), null);
  assertEquals(parseCallCommand("TO:8015551234 hi"), null);
});
