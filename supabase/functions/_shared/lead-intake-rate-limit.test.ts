import { assertEquals } from "jsr:@std/assert@1";
import {
  LEAD_INTAKE_MAX_ATTEMPTS,
  LEAD_INTAKE_RATE_LIMIT_CONTEXT,
  LEAD_INTAKE_RATE_LIMIT_RPC,
  LEAD_INTAKE_RATE_LIMIT_WINDOW_SECONDS,
  leadIntakeThrottleKey,
  nativeLeadSubmissionKey,
  parseLeadIntakeRateReservation,
} from "./lead-intake-rate-limit.ts";

const SECRET = "test-lead-intake-rate-secret-32-bytes-minimum";

Deno.test("freezes the fixed lead-intake rate contract", () => {
  assertEquals(LEAD_INTAKE_RATE_LIMIT_RPC, "reserve_lead_intake_attempt");
  assertEquals(LEAD_INTAKE_RATE_LIMIT_CONTEXT, "lead-intake-v1");
  assertEquals(LEAD_INTAKE_MAX_ATTEMPTS, 5);
  assertEquals(LEAD_INTAKE_RATE_LIMIT_WINDOW_SECONDS, 15 * 60);
});

Deno.test("hashes a canonical platform client identity", async () => {
  const result = await leadIntakeThrottleKey(
    SECRET,
    new Headers({ "cf-connecting-ip": "203.0.113.18" }),
  );
  assertEquals(result.source, "cf-connecting-ip");
  assertEquals(/^[0-9a-f]{64}$/.test(result.key), true);
  assertEquals(result.key.includes("203.0.113.18"), false);
});

Deno.test("allows attempts one through five and blocks the sixth", () => {
  for (let attempt = 1; attempt <= LEAD_INTAKE_MAX_ATTEMPTS; attempt++) {
    assertEquals(
      parseLeadIntakeRateReservation([{
        allowed: true,
        attempt_count: attempt,
        retry_after_seconds: 0,
      }])?.allowed,
      true,
    );
  }
  assertEquals(
    parseLeadIntakeRateReservation([{
      allowed: false,
      attempt_count: LEAD_INTAKE_MAX_ATTEMPTS + 1,
      retry_after_seconds: 600,
    }]),
    {
      allowed: false,
      attempt_count: 6,
      retry_after_seconds: 600,
    },
  );
});

Deno.test("malformed or contradictory reservations fail closed", () => {
  for (
    const value of [
      null,
      [],
      [{ allowed: true, attempt_count: 6, retry_after_seconds: 0 }],
      [{ allowed: false, attempt_count: 6, retry_after_seconds: 0 }],
      [{ allowed: false, attempt_count: 6, retry_after_seconds: 901 }],
      [{ allowed: "false", attempt_count: 6, retry_after_seconds: 10 }],
    ]
  ) {
    assertEquals(parseLeadIntakeRateReservation(value), null);
  }
});

Deno.test("no-JavaScript retries receive a stable daily UUID without exposing PII", async () => {
  const client = await leadIntakeThrottleKey(
    SECRET,
    new Headers({ "cf-connecting-ip": "203.0.113.18" }),
  );
  const fields = {
    name: "Fallback Homeowner",
    phone: "+14355550100",
    email: "",
    message: "Roof leak",
  };
  const first = await nativeLeadSubmissionKey(
    SECRET,
    client.key,
    fields,
    Date.parse("2026-08-07T01:00:00Z"),
  );
  const retry = await nativeLeadSubmissionKey(
    SECRET,
    client.key,
    { ...fields },
    Date.parse("2026-08-07T23:59:59Z"),
  );
  const nextDay = await nativeLeadSubmissionKey(
    SECRET,
    client.key,
    fields,
    Date.parse("2026-08-08T00:00:00Z"),
  );
  assertEquals(first, retry);
  assertEquals(first === nextDay, false);
  assertEquals(
    /^[0-9a-f]{8}-[0-9a-f]{4}-5[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/
      .test(
        first,
      ),
    true,
  );
  assertEquals(first.includes("Fallback"), false);
});
