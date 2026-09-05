import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  callerIdIntroduction,
  enrichCallerId,
  forwardedCallerId,
  normalizeCallerIdName,
} from "./caller-id.ts";

const callSid = "CA" + "1".repeat(32);
const phone = "+12025550123";
const business = "+12025550199";
const config = {
  supabaseUrl: "https://example.supabase.co",
  serviceKey: "test-service-key",
  accountSid: "AC" + "2".repeat(32),
  authToken: "test-token",
};
function json(value: unknown, status = 200): Response {
  return new Response(JSON.stringify(value), { status });
}

Deno.test("forwarded caller ID preserves an original PSTN number", () => {
  assertEquals(forwardedCallerId(phone, business), phone);
  assertEquals(forwardedCallerId("+442079460123", business), "+442079460123");
  assertEquals(forwardedCallerId(" " + phone + " ", business), phone);
});

Deno.test("withheld malformed or SIP caller IDs use the business fallback", () => {
  for (
    const value of [
      null,
      undefined,
      "",
      "anonymous",
      "restricted",
      "unknown",
      "sip:+12025550123@example.com",
      "+0123456789",
      "2025550123",
      '+12025550123" timeout="0',
      "+1",
      "+" + "1".repeat(16),
    ]
  ) {
    assertEquals(forwardedCallerId(value, business), business);
  }
});

Deno.test("CNAM remains labeled metadata and handles missing generic names", () => {
  assertEquals(normalizeCallerIdName("  JANE\n  DOE "), "JANE DOE");
  assertEquals(normalizeCallerIdName("a".repeat(200))?.length, 80);
  for (const value of [null, "", "unknown", "WIRELESS CALLER", "Private"]) {
    assertEquals(callerIdIntroduction(value), "");
  }
  assertEquals(callerIdIntroduction("Jane Doe"), "Caller ID lists Jane Doe. ");
});

Deno.test("an unclaimed or retried webhook cannot perform a paid lookup", async () => {
  const calls: string[] = [];
  await enrichCallerId(callSid, phone, null, config, async (input, init) => {
    calls.push(String(input));
    assertEquals(init?.method, "PATCH");
    assertStringIncludes(String(input), "caller_name_lookup_status=is.null");
    return json([]);
  });
  assertEquals(calls.length, 1);
});

Deno.test("native CallerName is saved without a second paid lookup", async () => {
  const calls: string[] = [];
  let saved: unknown;
  await enrichCallerId(
    callSid,
    phone,
    "Jane Doe",
    config,
    async (input, init) => {
      calls.push(String(input));
      if (calls.length === 1) return json([{ call_sid: callSid }]);
      saved = JSON.parse(String(init?.body));
      return json([]);
    },
  );
  assertEquals(calls.length, 2);
  assertEquals(saved, {
    caller_name: "Jane Doe",
    caller_name_lookup_status: "native",
  });
});

Deno.test("lookup uses the original number and persists a matching name", async () => {
  let step = 0;
  let saved: unknown;
  await enrichCallerId(callSid, phone, null, config, async (input, init) => {
    step++;
    if (step === 1) return json([{ call_sid: callSid }]);
    if (step === 2) {
      assertStringIncludes(String(input), encodeURIComponent(phone));
      assertStringIncludes(String(input), "Fields=caller_name");
      assertEquals(new Headers(init?.headers).has("apikey"), false);
      assertEquals(init?.signal instanceof AbortSignal, true);
      return json({
        phone_number: phone,
        valid: true,
        caller_name: {
          caller_name: "Jane Doe",
          error_code: null,
        },
      });
    }
    saved = JSON.parse(String(init?.body));
    return json([]);
  });
  assertEquals(step, 3);
  assertEquals(saved, {
    caller_name: "Jane Doe",
    caller_name_lookup_status: "matched",
  });
});

Deno.test("withheld numbers are never sent to Lookup", async () => {
  let step = 0;
  let saved: unknown;
  await enrichCallerId(
    callSid,
    "anonymous",
    null,
    config,
    async (_input, init) => {
      if (++step === 1) return json([{ call_sid: callSid }]);
      saved = JSON.parse(String(init?.body));
      return json([]);
    },
  );
  assertEquals(step, 2);
  assertEquals(saved, {
    caller_name: null,
    caller_name_lookup_status: "not-eligible",
  });
});

Deno.test("an empty or generic native result does not cause a duplicate charge", async () => {
  for (const native of ["", "WIRELESS CALLER"]) {
    let calls = 0;
    let saved: unknown;
    await enrichCallerId(
      callSid,
      phone,
      native,
      config,
      async (_input, init) => {
        if (++calls === 1) return json([{ call_sid: callSid }]);
        saved = JSON.parse(String(init?.body));
        return json([]);
      },
    );
    assertEquals(calls, 2);
    assertEquals(saved, {
      caller_name: null,
      caller_name_lookup_status: "native",
    });
  }
});

Deno.test("provider failures and mismatched numbers never supply an identity", async () => {
  for (const result of ["throw", "mismatch", "empty", "http-error"]) {
    let step = 0;
    let saved: unknown;
    await enrichCallerId(callSid, phone, null, config, async (_input, init) => {
      if (++step === 1) return json([{ call_sid: callSid }]);
      if (step === 2) {
        if (result === "throw") throw new Error("provider unavailable");
        if (result === "http-error") return json({}, 500);
        return json({
          phone_number: result === "mismatch" ? business : phone,
          valid: true,
          caller_name: result === "empty"
            ? null
            : { caller_name: "Wrong person" },
        });
      }
      saved = JSON.parse(String(init?.body));
      return json([]);
    });
    assertEquals(saved, {
      caller_name: null,
      caller_name_lookup_status: result === "empty" ? "empty" : "unavailable",
    });
  }
});

Deno.test("database failures and invalid CallSids fail softly without lookup", async () => {
  let calls = 0;
  const fail = async () => {
    calls++;
    throw new Error("database unavailable");
  };
  await enrichCallerId("invalid", phone, null, config, fail);
  assertEquals(calls, 0);
  await enrichCallerId(callSid, phone, null, config, fail);
  assertEquals(calls, 1);
});
