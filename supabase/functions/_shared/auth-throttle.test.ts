// Frozen dashboard login-throttle adapter contract. The database RPC owns the
// atomic fixed-window mutation; these fixtures ensure lead-crm cannot treat a
// malformed response as permission to continue.

import { assertEquals, assertRejects } from "jsr:@std/assert@1";
import {
  AUTH_THROTTLE_KEY_CONTEXT,
  AUTH_THROTTLE_KEY_HEX_LENGTH,
  AUTH_THROTTLE_RPC,
  AUTH_THROTTLE_WINDOW_SECONDS,
  dashboardThrottleKey,
  MAX_ATTEMPTS_PER_WINDOW,
  parseThrottleReservation,
} from "./auth-throttle.ts";
import { readBoundedJsonObject } from "./bounded-json.ts";

const SECRET = "test-dashboard-throttle-secret-32-bytes-minimum";

Deno.test("freezes the database-owned throttle constants", () => {
  assertEquals(AUTH_THROTTLE_RPC, "reserve_dashboard_login_attempt");
  assertEquals(MAX_ATTEMPTS_PER_WINDOW, 10);
  assertEquals(AUTH_THROTTLE_WINDOW_SECONDS, 15 * 60);
  assertEquals(AUTH_THROTTLE_KEY_CONTEXT, "dashboard-auth-v1");
  assertEquals(AUTH_THROTTLE_KEY_HEX_LENGTH, 64);
});

Deno.test("uses a strict platform IP and persists only a bounded HMAC", async () => {
  const trusted = await dashboardThrottleKey(
    SECRET,
    new Headers({ "cf-connecting-ip": "203.0.113.7" }),
  );
  assertEquals(trusted.source, "cf-connecting-ip");
  assertEquals(trusted.key.length, AUTH_THROTTLE_KEY_HEX_LENGTH);
  assertEquals(/^[0-9a-f]{64}$/.test(trusted.key), true);
  assertEquals(trusted.key.includes("203.0.113.7"), false);

  await assertRejects(
    () =>
      dashboardThrottleKey(
        SECRET,
        new Headers({
          "x-real-ip": "203.0.113.7",
          "x-forwarded-for": "attacker.invalid, 203.0.113.7",
        }),
      ),
    Error,
    "trusted_client_ip_unavailable",
  );
});

Deno.test("accepts the one-row Supabase RPC response through attempt 10", () => {
  assertEquals(
    parseThrottleReservation([{
      allowed: true,
      attempt_count: MAX_ATTEMPTS_PER_WINDOW,
      retry_after_seconds: 0,
    }]),
    {
      allowed: true,
      attempt_count: 10,
      retry_after_seconds: 0,
    },
  );
});

Deno.test("accepts a blocked reservation with a bounded retry interval", () => {
  assertEquals(
    parseThrottleReservation([{
      allowed: false,
      attempt_count: MAX_ATTEMPTS_PER_WINDOW + 1,
      retry_after_seconds: 417,
    }]),
    {
      allowed: false,
      attempt_count: 11,
      retry_after_seconds: 417,
    },
  );
});

Deno.test("rejects missing, malformed, and contradictory RPC responses", () => {
  for (
    const value of [
      null,
      [],
      [
        { allowed: true, attempt_count: 1, retry_after_seconds: 0 },
        { allowed: true, attempt_count: 2, retry_after_seconds: 0 },
      ],
      [{ allowed: "true", attempt_count: 1, retry_after_seconds: 0 }],
      [{ allowed: true, attempt_count: 0, retry_after_seconds: 0 }],
      [{ allowed: true, attempt_count: 11, retry_after_seconds: 0 }],
      [{ allowed: false, attempt_count: 11, retry_after_seconds: 0 }],
      [{ allowed: false, attempt_count: 11, retry_after_seconds: 901 }],
    ]
  ) {
    assertEquals(parseThrottleReservation(value), null);
  }
});

function chunkedJsonRequest(chunks: string[]) {
  const encoder = new TextEncoder();
  let reads = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(controller) {
      if (reads >= chunks.length) {
        controller.close();
        return;
      }
      controller.enqueue(encoder.encode(chunks[reads++]));
    },
  }, { highWaterMark: 0 });
  return {
    reads: () => reads,
    request: new Request("https://example.test/functions/v1/lead-crm", {
      body,
      method: "POST",
    }),
  };
}

Deno.test("bounded JSON reader accepts only valid object bodies", async () => {
  const valid = await readBoundedJsonObject(
    new Request("https://example.test", {
      body: '{"routing_key":"route","pin":"123456"}',
      method: "POST",
    }),
    1024,
  );
  assertEquals(valid, {
    ok: true,
    value: { routing_key: "route", pin: "123456" },
  });

  for (const body of ["", "not json", "[]", "null", '"scalar"']) {
    assertEquals(
      await readBoundedJsonObject(
        new Request("https://example.test", { body, method: "POST" }),
        1024,
      ),
      { ok: false, error: "bad_json", status: 400 },
    );
  }
});

Deno.test("bounded JSON reader rejects a declared oversized body with 413", async () => {
  const request = new Request("https://example.test", {
    body: "{}",
    headers: { "content-length": "1025" },
    method: "POST",
  });
  assertEquals(await readBoundedJsonObject(request, 1024), {
    ok: false,
    error: "body_too_large",
    status: 413,
  });
});

Deno.test("bounded JSON reader stops an oversized chunked body before parsing", async () => {
  const streamed = chunkedJsonRequest([
    '{"value":"',
    "x".repeat(32),
    '"}',
  ]);
  assertEquals(await readBoundedJsonObject(streamed.request, 32), {
    ok: false,
    error: "body_too_large",
    status: 413,
  });
  assertEquals(
    streamed.reads(),
    2,
    "reader consumed chunks after the byte limit was exceeded",
  );
});

Deno.test("bounded JSON reader accepts a bounded chunked JSON object", async () => {
  const streamed = chunkedJsonRequest(['{"routing_', 'key":"route"}']);
  assertEquals(await readBoundedJsonObject(streamed.request, 64), {
    ok: true,
    value: { routing_key: "route" },
  });
});
