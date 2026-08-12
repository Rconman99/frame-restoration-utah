// Blocking gate for the missed-call alert decision + copy. Same eval-as-gate
// pattern as auth-throttle.test.ts / lead-sms.test.ts.

import { assertEquals, assertStringIncludes } from "jsr:@std/assert@1";
import {
  formatUsPhone,
  isBlockCommandAttempt,
  missedCallAlertText,
  normalizeAlertPhone,
  parseBlockCommand,
  shouldAlertMissedCall,
} from "./missed-call-alert.ts";

const none = new Set<string>();

Deno.test("alerts on a real missed call", () => {
  const d = shouldAlertMissedCall("no-answer", "+16505550123", none);
  assertEquals(d.alert, true);
  assertEquals(d.reason, "missed");
});

Deno.test("busy and failed also count as missed", () => {
  for (const s of ["busy", "failed", "canceled"]) {
    assertEquals(shouldAlertMissedCall(s, "+14805550124", none).alert, true, s);
  }
});

Deno.test("never alerts when Landon actually answered", () => {
  for (const s of ["completed", "answered", "ANSWERED"]) {
    const d = shouldAlertMissedCall(s, "+16505550123", none);
    assertEquals(d.alert, false, s);
    assertEquals(d.reason, "answered");
  }
});

Deno.test("out-of-state numbers still alert — second-home owners are real clients", () => {
  assertEquals(
    shouldAlertMissedCall("no-answer", "+14805550124", none).alert,
    true,
  );
  // Utah, for symmetry.
  assertEquals(
    shouldAlertMissedCall("no-answer", "+14355550126", none).alert,
    true,
  );
});

Deno.test("suppressed numbers do not alert", () => {
  const s = new Set(["+16505550123"]);
  const d = shouldAlertMissedCall("no-answer", "(650) 555-0123", s);
  assertEquals(d.alert, false);
  assertEquals(d.reason, "suppressed");
});

Deno.test("our own lines never alert", () => {
  const internal = new Set(["+12125550127", "+14355550128"]);
  for (const n of internal) {
    const d = shouldAlertMissedCall("no-answer", n, none, internal);
    assertEquals(d.alert, false, n);
    assertEquals(d.reason, "internal_line");
  }
});

Deno.test("missing caller id does not alert", () => {
  assertEquals(
    shouldAlertMissedCall("no-answer", "", none).reason,
    "no_caller_id",
  );
  assertEquals(
    shouldAlertMissedCall("no-answer", "unknown", none).reason,
    "no_caller_id",
  );
  assertEquals(
    shouldAlertMissedCall("no-answer", "anonymous", none).reason,
    "no_caller_id",
  );
});

Deno.test("a non-dial callback is not treated as a miss", () => {
  assertEquals(shouldAlertMissedCall("", "+16505550123", none).alert, false);
  assertEquals(
    shouldAlertMissedCall("in-progress", "+16505550123", none).alert,
    false,
  );
});

Deno.test("fails open: an empty suppression set still alerts", () => {
  // Callers pass an empty set when the DB lookup fails. A missed alert costs a
  // job; a spurious alert costs one text.
  assertEquals(
    shouldAlertMissedCall("no-answer", "+19995550125", none).alert,
    true,
  );
});

Deno.test("phone formats for a phone screen", () => {
  assertEquals(formatUsPhone("+16505550123"), "(650) 555-0123");
  assertEquals(formatUsPhone("+99955550129"), "+99955550129");
  assertEquals(normalizeAlertPhone("(650) 555-0123"), "+16505550123");
});

Deno.test("alert text leads with the number — the original complaint", () => {
  const t = missedCallAlertText({
    fromNumber: "+16505550123",
    city: "EXAMPLE, CA",
    callCount: 3,
    localTime: "5:37 PM",
  });
  assertStringIncludes(t, "(650) 555-0123");
  assertStringIncludes(t, "EXAMPLE, CA");
  assertStringIncludes(t, "5:37 PM");
  assertStringIncludes(t, "Call #3");
  assertStringIncludes(t, "BLOCK 0123");
  assertEquals([...t].every((char) => char.charCodeAt(0) <= 127), true);
  assertEquals(t.length <= 160, true);
});

Deno.test("alert text omits noise when data is thin", () => {
  const t = missedCallAlertText({
    fromNumber: "+14355550126",
    city: "unknown",
    callCount: 1,
  });
  assertEquals(t.includes("unknown"), false);
  assertEquals(t.includes("Call #"), false);
});

Deno.test("BLOCK requires the intended caller suffix", () => {
  for (
    const b of ["BLOCK 0123", "block 0123", " Block   0123 ", "block 0123\n"]
  ) {
    assertEquals(parseBlockCommand(b), { lastFour: "0123" }, JSON.stringify(b));
  }
  for (
    const b of [
      "BLOCK",
      "block this guy",
      "block 123",
      "block 01234",
      "unblock 0123",
      "b",
      "",
    ]
  ) {
    assertEquals(parseBlockCommand(b), null, JSON.stringify(b));
  }
  assertEquals(isBlockCommandAttempt("BLOCK"), true);
  assertEquals(isBlockCommandAttempt("block this guy"), true);
  assertEquals(isBlockCommandAttempt("unblock 0123"), false);
});
