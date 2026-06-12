// Frozen PIN-throttle contract: ≤10 failed attempts per IP per 15-minute
// window; expiry resets; successes clear (the caller deletes the row).

import { assert, assertEquals, assertFalse } from "jsr:@std/assert@1";
import {
  failedAttemptRow,
  MAX_FAILS_PER_WINDOW,
  throttleAllows,
  WINDOW_MS,
} from "./auth-throttle.ts";

const NOW = Date.parse("2026-06-10T12:00:00Z");
const row = (fail_count: number, ageMs = 60_000) => ({
  ip: "1.2.3.4",
  fail_count,
  window_start: new Date(NOW - ageMs).toISOString(),
});

Deno.test("first attempt from an IP is allowed", () => {
  assert(throttleAllows(null, NOW));
});

Deno.test("blocks at the cap inside the window", () => {
  assert(throttleAllows(row(MAX_FAILS_PER_WINDOW - 1), NOW));
  assertFalse(throttleAllows(row(MAX_FAILS_PER_WINDOW), NOW));
  assertFalse(throttleAllows(row(MAX_FAILS_PER_WINDOW + 5), NOW));
});

Deno.test("an expired window unblocks (fresh start)", () => {
  assert(throttleAllows(row(MAX_FAILS_PER_WINDOW, WINDOW_MS + 1000), NOW));
});

Deno.test("failed attempt increments inside the window", () => {
  const next = failedAttemptRow("1.2.3.4", row(3), NOW);
  assertEquals(next.fail_count, 4);
  assertEquals(next.window_start, row(3).window_start); // window anchor unchanged
});

Deno.test("failed attempt after expiry starts a new window at 1", () => {
  const next = failedAttemptRow("1.2.3.4", row(9, WINDOW_MS + 1000), NOW);
  assertEquals(next.fail_count, 1);
  assertEquals(next.window_start, new Date(NOW).toISOString());
});

Deno.test("unparseable window_start fails open to a fresh window (no lockout bricking)", () => {
  const bad = { ip: "1.2.3.4", fail_count: 99, window_start: "garbage" };
  assert(throttleAllows(bad, NOW));
  assertEquals(failedAttemptRow("1.2.3.4", bad, NOW).fail_count, 1);
});
